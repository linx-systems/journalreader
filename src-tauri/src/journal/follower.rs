use crate::error::JournalError;
use crate::journal::types::{JournalEntry, JournalFilter};
use regex::Regex;
use serde_json::Value;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

/// Event payload for new journal entries in follow mode
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FollowEvent {
    pub entries: Vec<JournalEntry>,
}

/// Event payload for follow mode errors
#[derive(Clone, serde::Serialize)]
pub struct FollowErrorEvent {
    pub message: String,
}

/// Manages a persistent journalctl -f process for live streaming
pub struct JournalFollower {
    child: Option<Child>,
    running: Arc<AtomicBool>,
}

impl JournalFollower {
    pub fn new() -> Self {
        Self {
            child: None,
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Start following the journal with the given filter
    pub fn start(
        &mut self,
        filter: &JournalFilter,
        app_handle: AppHandle,
    ) -> Result<(), JournalError> {
        // Stop any existing follow session
        self.stop();

        let mut cmd = Command::new("journalctl");
        cmd.arg("-o").arg("json");
        cmd.arg("-f"); // Follow mode
        cmd.arg("-n").arg("0"); // Don't show existing entries, only new ones

        // Apply unit filters
        for unit in &filter.units {
            cmd.arg("-u").arg(unit);
        }

        // Priority filter
        for priority in &filter.priorities {
            cmd.arg("-p").arg(priority.to_string());
        }

        // Boot filter - for follow mode, default to current boot
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

        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let mut child = cmd.spawn()?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| JournalError::ExecutionError("Failed to capture stdout".into()))?;

        self.child = Some(child);
        self.running.store(true, Ordering::SeqCst);

        let running = self.running.clone();

        // Spawn a thread to read the stream
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            let mut buffer: Vec<JournalEntry> = Vec::new();
            let mut last_emit = std::time::Instant::now();
            const BUFFER_INTERVAL_MS: u128 = 100; // Buffer entries for 100ms to prevent UI lag

            for line in reader.lines() {
                if !running.load(Ordering::SeqCst) {
                    break;
                }

                match line {
                    Ok(line) => {
                        if line.trim().is_empty() {
                            continue;
                        }

                        match parse_entry(&line) {
                            Ok(entry) => {
                                buffer.push(entry);

                                // Emit buffered entries periodically
                                if last_emit.elapsed().as_millis() >= BUFFER_INTERVAL_MS {
                                    if !buffer.is_empty() {
                                        let _ = app_handle.emit(
                                            "journal-follow-entry",
                                            FollowEvent {
                                                entries: buffer.clone(),
                                            },
                                        );
                                        buffer.clear();
                                    }
                                    last_emit = std::time::Instant::now();
                                }
                            }
                            Err(e) => {
                                eprintln!("Warning: Failed to parse journal entry: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        let _ = app_handle.emit(
                            "journal-follow-error",
                            FollowErrorEvent {
                                message: e.to_string(),
                            },
                        );
                        break;
                    }
                }
            }

            // Emit any remaining buffered entries
            if !buffer.is_empty() {
                let _ = app_handle.emit(
                    "journal-follow-entry",
                    FollowEvent { entries: buffer },
                );
            }

            // Notify that follow mode has stopped
            let _ = app_handle.emit("journal-follow-stopped", ());
        });

        Ok(())
    }

    /// Stop following the journal
    pub fn stop(&mut self) {
        self.running.store(false, Ordering::SeqCst);

        if let Some(mut child) = self.child.take() {
            // Try to kill the process gracefully
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    /// Check if follow mode is currently active
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }
}

impl Drop for JournalFollower {
    fn drop(&mut self) {
        self.stop();
    }
}

// Helper functions for parsing (duplicated from reader.rs to avoid circular deps)
fn parse_entry(json_line: &str) -> Result<JournalEntry, JournalError> {
    let value: Value =
        serde_json::from_str(json_line).map_err(|e| JournalError::ParseError(e.to_string()))?;

    let cursor = get_string(&value, "__CURSOR").unwrap_or_default();
    let realtime_timestamp = get_timestamp(&value, "__REALTIME_TIMESTAMP");
    let monotonic_timestamp = get_optional_timestamp(&value, "__MONOTONIC_TIMESTAMP");
    let boot_id = get_string(&value, "_BOOT_ID").unwrap_or_default();

    let message = get_string(&value, "MESSAGE").unwrap_or_default();
    let priority = get_priority(&value);

    let syslog_identifier = get_string(&value, "SYSLOG_IDENTIFIER");
    let systemd_unit = get_string(&value, "_SYSTEMD_UNIT");
    let pid = get_u32(&value, "_PID");
    let uid = get_u32(&value, "_UID");
    let gid = get_u32(&value, "_GID");
    let exe = get_string(&value, "_EXE");
    let cmdline = get_string(&value, "_CMDLINE");
    let hostname = get_string(&value, "_HOSTNAME");
    let comm = get_string(&value, "_COMM");

    Ok(JournalEntry {
        cursor,
        realtime_timestamp,
        monotonic_timestamp,
        boot_id,
        message,
        priority,
        syslog_identifier,
        systemd_unit,
        pid,
        uid,
        gid,
        exe,
        cmdline,
        hostname,
        comm,
    })
}

fn get_string(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(|v| {
        if let Some(s) = v.as_str() {
            Some(s.to_string())
        } else if let Some(arr) = v.as_array() {
            let bytes: Vec<u8> = arr.iter().filter_map(|x| x.as_u64().map(|n| n as u8)).collect();
            String::from_utf8(bytes).ok()
        } else {
            None
        }
    })
}

fn get_timestamp(value: &Value, key: &str) -> i64 {
    value
        .get(key)
        .and_then(|v| {
            if let Some(s) = v.as_str() {
                s.parse::<i64>().ok()
            } else {
                v.as_i64()
            }
        })
        .unwrap_or(0)
}

fn get_optional_timestamp(value: &Value, key: &str) -> Option<i64> {
    value.get(key).and_then(|v| {
        if let Some(s) = v.as_str() {
            s.parse::<i64>().ok()
        } else {
            v.as_i64()
        }
    })
}

fn get_priority(value: &Value) -> u8 {
    value
        .get("PRIORITY")
        .and_then(|v| {
            if let Some(s) = v.as_str() {
                s.parse::<u8>().ok()
            } else {
                v.as_u64().map(|n| n as u8)
            }
        })
        .unwrap_or(6)
}

fn get_u32(value: &Value, key: &str) -> Option<u32> {
    value.get(key).and_then(|v| {
        if let Some(s) = v.as_str() {
            s.parse::<u32>().ok()
        } else {
            v.as_u64().map(|n| n as u32)
        }
    })
}
