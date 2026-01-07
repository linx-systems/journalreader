use crate::error::JournalError;
use crate::journal::parser::{get_priority, get_timestamp, parse_entry};
use crate::journal::types::{
    BootInfo, JournalFilter, JournalQueryResult, JournalStatistics, PriorityCount, ServiceCount,
    StatisticsRequest, SystemUnit, TimeseriesPoint,
};
use regex::Regex;
use serde_json::Value;
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};

pub struct JournalReader;

impl JournalReader {
    pub fn query(filter: &JournalFilter) -> Result<JournalQueryResult, JournalError> {
        let mut cmd = Command::new("journalctl");
        cmd.arg("-o").arg("json");
        cmd.arg("--no-pager");

        // Apply unit filters
        for unit in &filter.units {
            cmd.arg("-u").arg(unit);
        }

        // Priority filter - use range syntax MIN..MAX
        // Without range, -p 3 would show 0-3, not just 3
        if !filter.priorities.is_empty() {
            let min = filter.priorities.iter().min().unwrap();
            let max = filter.priorities.iter().max().unwrap();
            cmd.arg("-p").arg(format!("{}..{}", min, max));
        }

        // Cursor for pagination (mutually exclusive with --since)
        // If we have a cursor, use it for pagination; otherwise use time filters
        if let Some(cursor) = &filter.after_cursor {
            cmd.arg("--after-cursor").arg(cursor);
        } else {
            // Time filters (only when not using cursor-based pagination)
            if let Some(since) = &filter.since {
                cmd.arg("-S").arg(since);
            }
        }

        if let Some(until) = &filter.until {
            cmd.arg("-U").arg(until);
        }

        // Boot filter
        if let Some(boot_id) = &filter.boot_id {
            cmd.arg("-b").arg(boot_id);
        } else if let Some(offset) = filter.boot_offset {
            cmd.arg("-b").arg(offset.to_string());
        }

        // Identifier filter
        if let Some(identifier) = &filter.identifier {
            cmd.arg("-t").arg(identifier);
        }

        // Grep pattern
        if let Some(pattern) = &filter.grep_pattern {
            if !pattern.is_empty() {
                // Validate regex first
                if Regex::new(pattern).is_err() {
                    return Err(JournalError::InvalidRegex(pattern.clone()));
                }
                cmd.arg("-g").arg(pattern);
                if !filter.case_sensitive {
                    cmd.arg("--case-sensitive=false");
                }
            }
        }

        // Reverse order (newest first)
        if filter.reverse {
            cmd.arg("-r");
        }

        // Limit
        // Fetch one extra to determine if there are more entries
        // If we have exclusions, fetch more to compensate for filtered entries
        let fetch_limit = if filter.excluded_units.is_empty() {
            filter.limit + 1
        } else {
            // Fetch 3x when excluding to ensure we get enough entries after filtering
            (filter.limit * 3) + 1
        };
        cmd.arg("-n").arg(fetch_limit.to_string());

        let output = cmd.output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("No journal files were found")
                || stderr.contains("Failed to open journal")
            {
                return Err(JournalError::JournalNotAvailable);
            }
            if stderr.contains("Permission denied") || stderr.contains("access denied") {
                return Err(JournalError::PermissionDenied);
            }
            return Err(JournalError::ExecutionError(stderr.to_string()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut entries = Vec::new();

        for line in stdout.lines() {
            if line.trim().is_empty() {
                continue;
            }

            match parse_entry(line) {
                Ok(entry) => {
                    // Filter out excluded units
                    if !filter.excluded_units.is_empty() {
                        if let Some(ref unit) = entry.systemd_unit {
                            if filter.excluded_units.contains(unit) {
                                continue;
                            }
                        }
                    }
                    entries.push(entry);
                }
                Err(e) => {
                    eprintln!("Warning: Failed to parse journal entry: {}", e);
                    continue;
                }
            }
        }

        // Determine if there are more entries and truncate to requested limit
        let has_more = entries.len() > filter.limit as usize;
        entries.truncate(filter.limit as usize);

        let cursor_start = entries.first().map(|e| e.cursor.clone());
        let cursor_end = entries.last().map(|e| e.cursor.clone());

        Ok(JournalQueryResult {
            entries,
            has_more,
            cursor_start,
            cursor_end,
        })
    }

    pub fn count(filter: &JournalFilter) -> Result<u64, JournalError> {
        let mut cmd = Command::new("journalctl");
        cmd.arg("--no-pager");
        cmd.arg("-q"); // Quiet mode

        // Apply same filters as query (except limit and cursor)
        for unit in &filter.units {
            cmd.arg("-u").arg(unit);
        }

        if !filter.priorities.is_empty() {
            let min = filter.priorities.iter().min().unwrap();
            let max = filter.priorities.iter().max().unwrap();
            cmd.arg("-p").arg(format!("{}..{}", min, max));
        }

        if let Some(since) = &filter.since {
            cmd.arg("-S").arg(since);
        }

        if let Some(until) = &filter.until {
            cmd.arg("-U").arg(until);
        }

        if let Some(boot_id) = &filter.boot_id {
            cmd.arg("-b").arg(boot_id);
        } else if let Some(offset) = filter.boot_offset {
            cmd.arg("-b").arg(offset.to_string());
        }

        if let Some(pattern) = &filter.grep_pattern {
            if !pattern.is_empty() {
                cmd.arg("-g").arg(pattern);
                if !filter.case_sensitive {
                    cmd.arg("--case-sensitive=false");
                }
            }
        }

        // If we have excluded units, we need to use JSON output to filter them
        if !filter.excluded_units.is_empty() {
            cmd.arg("-o").arg("json");
            let output = cmd.output()?;
            let stdout = String::from_utf8_lossy(&output.stdout);

            let count = stdout
                .lines()
                .filter(|line| !line.trim().is_empty())
                .filter(|line| {
                    if let Ok(value) = serde_json::from_str::<Value>(line) {
                        if let Some(unit) = value.get("_SYSTEMD_UNIT").and_then(|v| v.as_str()) {
                            return !filter.excluded_units.contains(&unit.to_string());
                        }
                    }
                    true // Include entries without a unit or parse errors
                })
                .count() as u64;

            Ok(count)
        } else {
            // Output only count (faster when no exclusions)
            cmd.arg("--output=cat");

            let output = cmd.output()?;
            let stdout = String::from_utf8_lossy(&output.stdout);
            let count = stdout.lines().count() as u64;

            Ok(count)
        }
    }

    pub fn list_units() -> Result<Vec<SystemUnit>, JournalError> {
        // Get units that have journal entries
        let output = Command::new("journalctl")
            .arg("-F")
            .arg("_SYSTEMD_UNIT")
            .arg("--no-pager")
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(JournalError::ExecutionError(stderr.to_string()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut units: Vec<SystemUnit> = stdout
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(|name| SystemUnit {
                name: name.to_string(),
                description: None,
                load_state: None,
                active_state: None,
                sub_state: None,
            })
            .collect();

        units.sort_by(|a, b| a.name.cmp(&b.name));
        units.dedup_by(|a, b| a.name == b.name);

        Ok(units)
    }

    pub fn list_boots() -> Result<Vec<BootInfo>, JournalError> {
        let output = Command::new("journalctl")
            .arg("--list-boots")
            .arg("--no-pager")
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(JournalError::ExecutionError(stderr.to_string()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut boots = Vec::new();

        for line in stdout.lines() {
            if line.trim().is_empty() {
                continue;
            }

            // Format: offset boot_id timestamp—timestamp
            // Example: -1 abc123def456... Thu 2024-01-01 10:00:00 UTC—Thu 2024-01-01 18:00:00 UTC
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                let offset = parts[0].parse::<i32>().unwrap_or(0);
                let boot_id = parts[1].to_string();

                boots.push(BootInfo {
                    boot_id,
                    boot_offset: offset,
                    first_entry: None,
                    last_entry: None,
                });
            }
        }

        Ok(boots)
    }

    /// Get statistics by streaming journal entries to minimize memory usage.
    /// Instead of loading all entries into memory at once, processes entries
    /// line-by-line using streaming I/O.
    pub fn get_statistics(request: &StatisticsRequest) -> Result<JournalStatistics, JournalError> {
        let filter = &request.filter;
        let granularity_ms = request.granularity_ms;

        let mut cmd = Command::new("journalctl");
        cmd.arg("-o").arg("json");
        cmd.arg("--no-pager");
        // Use piped stdout for streaming instead of collecting all output
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        // Apply unit filters
        for unit in &filter.units {
            cmd.arg("-u").arg(unit);
        }

        // Priority filter
        if !filter.priorities.is_empty() {
            let min = filter.priorities.iter().min().unwrap();
            let max = filter.priorities.iter().max().unwrap();
            cmd.arg("-p").arg(format!("{}..{}", min, max));
        }

        // Time filters
        if let Some(since) = &filter.since {
            cmd.arg("-S").arg(since);
        }

        if let Some(until) = &filter.until {
            cmd.arg("-U").arg(until);
        }

        // Boot filter
        if let Some(boot_id) = &filter.boot_id {
            cmd.arg("-b").arg(boot_id);
        } else if let Some(offset) = filter.boot_offset {
            cmd.arg("-b").arg(offset.to_string());
        }

        // Identifier filter
        if let Some(identifier) = &filter.identifier {
            cmd.arg("-t").arg(identifier);
        }

        // Grep pattern
        if let Some(pattern) = &filter.grep_pattern {
            if !pattern.is_empty() {
                if Regex::new(pattern).is_err() {
                    return Err(JournalError::InvalidRegex(pattern.clone()));
                }
                cmd.arg("-g").arg(pattern);
                if !filter.case_sensitive {
                    cmd.arg("--case-sensitive=false");
                }
            }
        }

        let mut child = cmd.spawn()?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| JournalError::ExecutionError("Failed to capture stdout".into()))?;

        // Stream and process entries line-by-line to minimize memory usage
        let reader = BufReader::new(stdout);

        // Aggregation maps - only store aggregated data, not raw entries
        let mut timeseries_map: HashMap<i64, (u64, u64, u64)> = HashMap::new(); // (count, errors, warnings)
        let mut priority_map: HashMap<u8, u64> = HashMap::new();
        let mut service_map: HashMap<String, u64> = HashMap::new();
        let mut total_count: u64 = 0;
        let mut error_count: u64 = 0;

        let priority_labels = [
            "emerg", "alert", "crit", "err", "warning", "notice", "info", "debug",
        ];

        // Process entries one at a time - never stores the raw JSON in memory
        for line_result in reader.lines() {
            let line = match line_result {
                Ok(l) => l,
                Err(_) => continue,
            };

            if line.trim().is_empty() {
                continue;
            }

            let value: Value = match serde_json::from_str(&line) {
                Ok(v) => v,
                Err(_) => continue,
            };

            // Check excluded units
            if !filter.excluded_units.is_empty() {
                if let Some(unit) = value.get("_SYSTEMD_UNIT").and_then(|v| v.as_str()) {
                    if filter.excluded_units.contains(&unit.to_string()) {
                        continue;
                    }
                }
            }

            total_count += 1;

            // Get timestamp and bucket it
            let timestamp = get_timestamp(&value, "__REALTIME_TIMESTAMP");
            // Convert from microseconds to milliseconds, then bucket
            let timestamp_ms = timestamp / 1000;
            let bucket = (timestamp_ms / granularity_ms) * granularity_ms;

            // Get priority
            let priority = get_priority(&value);
            let is_error = priority <= 3; // emerg, alert, crit, err
            let is_warning = priority == 4;

            if is_error {
                error_count += 1;
            }

            // Update timeseries
            let entry = timeseries_map.entry(bucket).or_insert((0, 0, 0));
            entry.0 += 1;
            if is_error {
                entry.1 += 1;
            }
            if is_warning {
                entry.2 += 1;
            }

            // Update priority distribution
            *priority_map.entry(priority).or_insert(0) += 1;

            // Update service counts
            let service = value
                .get("_SYSTEMD_UNIT")
                .and_then(|v| v.as_str())
                .or_else(|| value.get("SYSLOG_IDENTIFIER").and_then(|v| v.as_str()))
                .unwrap_or("unknown")
                .to_string();
            *service_map.entry(service).or_insert(0) += 1;
        }

        // Wait for the process to finish and check for errors
        let status = child.wait()?;
        if !status.success() {
            // Try to read stderr for error message
            if let Some(mut stderr) = child.stderr.take() {
                let mut error_msg = String::new();
                use std::io::Read;
                let _ = stderr.read_to_string(&mut error_msg);
                if error_msg.contains("No journal files were found")
                    || error_msg.contains("Failed to open journal")
                {
                    return Err(JournalError::JournalNotAvailable);
                }
                if error_msg.contains("Permission denied") || error_msg.contains("access denied") {
                    return Err(JournalError::PermissionDenied);
                }
                if !error_msg.is_empty() {
                    return Err(JournalError::ExecutionError(error_msg));
                }
            }
        }

        // Convert timeseries map to sorted vec
        let mut timeseries: Vec<TimeseriesPoint> = timeseries_map
            .into_iter()
            .map(|(timestamp, (count, errors, warnings))| TimeseriesPoint {
                timestamp,
                count,
                error_count: errors,
                warning_count: warnings,
            })
            .collect();
        timeseries.sort_by_key(|p| p.timestamp);

        // Convert priority map to vec with labels
        let mut priority_distribution: Vec<PriorityCount> = priority_map
            .into_iter()
            .map(|(priority, count)| PriorityCount {
                priority,
                label: priority_labels
                    .get(priority as usize)
                    .unwrap_or(&"unknown")
                    .to_string(),
                count,
            })
            .collect();
        priority_distribution.sort_by_key(|p| p.priority);

        // Convert service map to sorted vec (top services first)
        let mut top_services: Vec<ServiceCount> = service_map
            .into_iter()
            .map(|(service, count)| ServiceCount { service, count })
            .collect();
        top_services.sort_by(|a, b| b.count.cmp(&a.count));
        top_services.truncate(20); // Keep top 20

        let error_rate = if total_count > 0 {
            (error_count as f64 / total_count as f64) * 100.0
        } else {
            0.0
        };

        Ok(JournalStatistics {
            timeseries,
            priority_distribution,
            top_services,
            total_count,
            error_rate,
        })
    }
}
