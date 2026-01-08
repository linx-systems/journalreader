use crate::error::JournalError;
use crate::journal::parser::{get_priority, get_timestamp, parse_entry};
use crate::journal::shell_escape::escape_arg;
use crate::journal::ssh::ConnectionManager;
use crate::journal::types::{
    BootInfo, JournalFilter, JournalQueryResult, JournalStatistics, PriorityCount, ServiceCount,
    StatisticsRequest, SystemUnit, TimeseriesPoint,
};
use regex::Regex;
use serde_json::Value;
use std::collections::HashMap;

/// Remote journal reader that executes journalctl commands over SSH
pub struct RemoteJournalReader;

impl RemoteJournalReader {
    /// Build the journalctl command arguments from a filter
    fn build_command_args(filter: &JournalFilter, extra_args: &[&str]) -> String {
        let mut args = vec!["journalctl".to_string()];
        args.push("-o".to_string());
        args.push("json".to_string());
        args.push("--no-pager".to_string());

        // Apply unit filters (escape user input to prevent command injection)
        for unit in &filter.units {
            args.push("-u".to_string());
            args.push(escape_arg(unit));
        }

        // Priority filter (numeric values are safe)
        if !filter.priorities.is_empty() {
            let min = filter.priorities.iter().min().unwrap();
            let max = filter.priorities.iter().max().unwrap();
            args.push("-p".to_string());
            args.push(format!("{}..{}", min, max));
        }

        // Cursor for pagination (escape user input)
        if let Some(cursor) = &filter.after_cursor {
            args.push("--after-cursor".to_string());
            args.push(escape_arg(cursor));
        } else {
            // Time filters (escape user input)
            if let Some(since) = &filter.since {
                args.push("-S".to_string());
                args.push(escape_arg(since));
            }
        }

        if let Some(until) = &filter.until {
            args.push("-U".to_string());
            args.push(escape_arg(until));
        }

        // Boot filter (escape user input)
        if let Some(boot_id) = &filter.boot_id {
            args.push("-b".to_string());
            args.push(escape_arg(boot_id));
        } else if let Some(offset) = filter.boot_offset {
            // Numeric offset is safe
            args.push("-b".to_string());
            args.push(offset.to_string());
        }

        // Identifier filter (escape user input)
        if let Some(identifier) = &filter.identifier {
            args.push("-t".to_string());
            args.push(escape_arg(identifier));
        }

        // Grep pattern (escape user input)
        if let Some(pattern) = &filter.grep_pattern {
            if !pattern.is_empty() {
                args.push("-g".to_string());
                args.push(escape_arg(pattern));
                if !filter.case_sensitive {
                    args.push("--case-sensitive=false".to_string());
                }
            }
        }

        // Reverse order
        if filter.reverse {
            args.push("-r".to_string());
        }

        // Extra args (these are internal, not user-provided)
        for arg in extra_args {
            args.push(arg.to_string());
        }

        args.join(" ")
    }

    /// Query journal entries from a remote host
    pub fn query(
        conn: &ConnectionManager,
        filter: &JournalFilter,
    ) -> Result<JournalQueryResult, JournalError> {
        // Validate regex if present
        if let Some(pattern) = &filter.grep_pattern {
            if !pattern.is_empty() && Regex::new(pattern).is_err() {
                return Err(JournalError::InvalidRegex(pattern.clone()));
            }
        }

        // Fetch extra entries to determine if there are more
        let fetch_limit = if filter.excluded_units.is_empty() {
            filter.limit + 1
        } else {
            (filter.limit * 3) + 1
        };

        let cmd = Self::build_command_args(filter, &["-n", &fetch_limit.to_string()]);
        let output = conn.run_command(&cmd)?;

        let mut entries = Vec::new();
        for line in output.lines() {
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

    /// Count journal entries matching a filter
    pub fn count(conn: &ConnectionManager, filter: &JournalFilter) -> Result<u64, JournalError> {
        if !filter.excluded_units.is_empty() {
            // Need to fetch and filter
            let cmd = Self::build_command_args(filter, &[]);
            let output = conn.run_command(&cmd)?;

            let count = output
                .lines()
                .filter(|line| !line.trim().is_empty())
                .filter(|line| {
                    if let Ok(value) = serde_json::from_str::<Value>(line) {
                        if let Some(unit) = value.get("_SYSTEMD_UNIT").and_then(|v| v.as_str()) {
                            return !filter.excluded_units.contains(&unit.to_string());
                        }
                    }
                    true
                })
                .count() as u64;

            Ok(count)
        } else {
            // Use cat output for faster counting
            let cmd = format!(
                "journalctl --no-pager -q --output=cat {}",
                Self::build_filter_args(filter)
            );
            let output = conn.run_command(&cmd)?;
            Ok(output.lines().count() as u64)
        }
    }

    fn build_filter_args(filter: &JournalFilter) -> String {
        let mut args = Vec::new();

        // Escape all user-provided values to prevent command injection
        for unit in &filter.units {
            args.push(format!("-u {}", escape_arg(unit)));
        }

        // Priority is numeric, safe to use directly
        if !filter.priorities.is_empty() {
            let min = filter.priorities.iter().min().unwrap();
            let max = filter.priorities.iter().max().unwrap();
            args.push(format!("-p {}..{}", min, max));
        }

        if let Some(since) = &filter.since {
            args.push(format!("-S {}", escape_arg(since)));
        }

        if let Some(until) = &filter.until {
            args.push(format!("-U {}", escape_arg(until)));
        }

        if let Some(boot_id) = &filter.boot_id {
            args.push(format!("-b {}", escape_arg(boot_id)));
        } else if let Some(offset) = filter.boot_offset {
            // Numeric offset is safe
            args.push(format!("-b {}", offset));
        }

        if let Some(pattern) = &filter.grep_pattern {
            if !pattern.is_empty() {
                args.push(format!("-g {}", escape_arg(pattern)));
                if !filter.case_sensitive {
                    args.push("--case-sensitive=false".to_string());
                }
            }
        }

        args.join(" ")
    }

    /// List available systemd units from a remote host
    pub fn list_units(conn: &ConnectionManager) -> Result<Vec<SystemUnit>, JournalError> {
        let output = conn.run_command("journalctl -F _SYSTEMD_UNIT --no-pager")?;

        let mut units: Vec<SystemUnit> = output
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

    /// List boot sessions from a remote host
    pub fn list_boots(conn: &ConnectionManager) -> Result<Vec<BootInfo>, JournalError> {
        let output = conn.run_command("journalctl --list-boots --no-pager")?;

        let mut boots = Vec::new();
        for line in output.lines() {
            if line.trim().is_empty() {
                continue;
            }

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

    /// Get statistics from a remote host
    pub fn get_statistics(
        conn: &ConnectionManager,
        request: &StatisticsRequest,
    ) -> Result<JournalStatistics, JournalError> {
        let filter = &request.filter;
        let granularity_ms = request.granularity_ms;

        // Validate regex if present
        if let Some(pattern) = &filter.grep_pattern {
            if !pattern.is_empty() && Regex::new(pattern).is_err() {
                return Err(JournalError::InvalidRegex(pattern.clone()));
            }
        }

        let cmd = Self::build_command_args(filter, &[]);
        let output = conn.run_command(&cmd)?;

        // Aggregation maps
        let mut timeseries_map: HashMap<i64, (u64, u64, u64)> = HashMap::new();
        let mut priority_map: HashMap<u8, u64> = HashMap::new();
        let mut service_map: HashMap<String, u64> = HashMap::new();
        let mut total_count: u64 = 0;
        let mut error_count: u64 = 0;

        let priority_labels = [
            "emerg", "alert", "crit", "err", "warning", "notice", "info", "debug",
        ];

        for line in output.lines() {
            if line.trim().is_empty() {
                continue;
            }

            let value: Value = match serde_json::from_str(line) {
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

            let timestamp = get_timestamp(&value, "__REALTIME_TIMESTAMP");
            let timestamp_ms = timestamp / 1000;
            let bucket = (timestamp_ms / granularity_ms) * granularity_ms;

            let priority = get_priority(&value);
            let is_error = priority <= 3;
            let is_warning = priority == 4;

            if is_error {
                error_count += 1;
            }

            let entry = timeseries_map.entry(bucket).or_insert((0, 0, 0));
            entry.0 += 1;
            if is_error {
                entry.1 += 1;
            }
            if is_warning {
                entry.2 += 1;
            }

            *priority_map.entry(priority).or_insert(0) += 1;

            let service = value
                .get("_SYSTEMD_UNIT")
                .and_then(|v| v.as_str())
                .or_else(|| value.get("SYSLOG_IDENTIFIER").and_then(|v| v.as_str()))
                .unwrap_or("unknown")
                .to_string();
            *service_map.entry(service).or_insert(0) += 1;
        }

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

        let mut top_services: Vec<ServiceCount> = service_map
            .into_iter()
            .map(|(service, count)| ServiceCount { service, count })
            .collect();
        top_services.sort_by(|a, b| b.count.cmp(&a.count));
        top_services.truncate(20);

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
