use crate::error::JournalError;
use crate::journal::pagination::{scan_page, RawPage};
use crate::journal::parser::{get_priority, get_timestamp, matches_post_filters, parse_entry};
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
        if let Some(pattern) = &filter.grep_pattern {
            if !pattern.is_empty() && Regex::new(pattern).is_err() {
                return Err(JournalError::InvalidRegex(pattern.clone()));
            }
        }

        let minimum_timestamp = if filter.since.is_some() {
            match Self::probe_since(conn, filter)? {
                Some(timestamp) => Some(timestamp),
                None => return Ok(Self::empty_query_result()),
            }
        } else {
            None
        };

        scan_page(filter, minimum_timestamp, |cursor, page_size| {
            Self::fetch_raw_page(conn, filter, cursor, cursor.is_none(), filter.reverse, page_size)
        })
    }

    fn probe_since(
        conn: &ConnectionManager,
        filter: &JournalFilter,
    ) -> Result<Option<i64>, JournalError> {
        Ok(Self::fetch_raw_page(conn, filter, None, true, false, 1)?
            .entries
            .into_iter()
            .next()
            .map(|entry| entry.realtime_timestamp))
    }

    fn fetch_raw_page(
        conn: &ConnectionManager,
        filter: &JournalFilter,
        cursor: Option<&str>,
        include_since: bool,
        reverse: bool,
        page_size: u32,
    ) -> Result<RawPage, JournalError> {
        let mut raw_filter = filter.clone();
        raw_filter.after_cursor = cursor.map(str::to_owned);
        raw_filter.reverse = reverse;
        if !include_since {
            raw_filter.since = None;
        }
        let use_oldest_first_limit = !reverse
            && (cursor.is_none()
                || filter
                    .grep_pattern
                    .as_deref()
                    .is_some_and(|pattern| !pattern.is_empty()));
        let page_size = if use_oldest_first_limit {
            format!("+{page_size}")
        } else {
            page_size.to_string()
        };
        let command = Self::build_command_args(&raw_filter, &["-n", &page_size]);
        let output = conn.run_command(&command)?;

        let mut entries = Vec::new();
        let mut scanned = 0;
        for line in output.lines() {
            if line.trim().is_empty() {
                continue;
            }
            scanned += 1;
            match parse_entry(line) {
                Ok(entry) => entries.push(entry),
                Err(error) => eprintln!("Warning: Failed to parse journal entry: {error}"),
            }
        }
        let last_cursor = entries
            .last()
            .and_then(|entry| (!entry.cursor.is_empty()).then(|| entry.cursor.clone()));
        Ok(RawPage {
            entries,
            scanned,
            last_cursor,
        })
    }

    fn empty_query_result() -> JournalQueryResult {
        JournalQueryResult {
            entries: Vec::new(),
            has_more: false,
            cursor_start: None,
            cursor_end: None,
        }
    }

    /// Count journal entries matching a filter.
    pub fn count(conn: &ConnectionManager, filter: &JournalFilter) -> Result<u64, JournalError> {
        if let Some(pattern) = &filter.grep_pattern {
            if !pattern.is_empty() && Regex::new(pattern).is_err() {
                return Err(JournalError::InvalidRegex(pattern.clone()));
            }
        }

        let mut count_filter = filter.clone();
        count_filter.after_cursor = None;
        count_filter.reverse = false;
        let output = conn.run_command(&Self::build_command_args(&count_filter, &[]))?;
        Ok(output
            .lines()
            .filter_map(|line| parse_entry(line).ok())
            .filter(|entry| {
                matches_post_filters(
                    &filter.excluded_units,
                    &filter.priorities,
                    entry.systemd_unit.as_deref(),
                    entry.priority,
                )
            })
            .count() as u64)
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
                // Skip header row (starts with "IDX" or first column is non-numeric)
                let offset = match parts[0].parse::<i32>() {
                    Ok(o) => o,
                    Err(_) => continue, // Skip header or invalid lines
                };
                let boot_id = parts[1].to_string();

                // Validate boot_id looks like a UUID (32 hex chars)
                if boot_id.len() == 32 && boot_id.chars().all(|c| c.is_ascii_hexdigit()) {
                    boots.push(BootInfo {
                        boot_id,
                        boot_offset: offset,
                        first_entry: None,
                        last_entry: None,
                    });
                }
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

            let priority = get_priority(&value);
            if !matches_post_filters(
                &filter.excluded_units,
                &filter.priorities,
                value.get("_SYSTEMD_UNIT").and_then(|value| value.as_str()),
                priority,
            ) {
                continue;
            }

            total_count += 1;

            let timestamp = get_timestamp(&value, "__REALTIME_TIMESTAMP");
            let timestamp_ms = timestamp / 1000;
            let bucket = (timestamp_ms / granularity_ms) * granularity_ms;
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
