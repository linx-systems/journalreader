use crate::error::JournalError;
use crate::journal::parser::parse_entry;
use crate::journal::types::{JournalEntry, JournalFilter};
use regex::Regex;
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
    // Flag to suppress stopped event during restart
    restarting: Arc<AtomicBool>,
}

impl JournalFollower {
    pub fn new() -> Self {
        Self {
            child: None,
            running: Arc::new(AtomicBool::new(false)),
            restarting: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Start following the journal with the given filter
    pub fn start(
        &mut self,
        filter: &JournalFilter,
        app_handle: AppHandle,
    ) -> Result<(), JournalError> {
        // Mark as restarting to suppress the stopped event
        self.restarting.store(true, Ordering::SeqCst);
        // Stop any existing follow session
        self.stop_internal();

        let mut cmd = Command::new("journalctl");
        cmd.arg("-o").arg("json");
        cmd.arg("-f"); // Follow mode
        cmd.arg("-n").arg("0"); // Don't show existing entries, only new ones

        // Apply unit filters
        for unit in &filter.units {
            cmd.arg("-u").arg(unit);
        }

        // Priority filter - use range syntax MIN..MAX
        if !filter.priorities.is_empty() {
            let min = filter.priorities.iter().min().unwrap();
            let max = filter.priorities.iter().max().unwrap();
            cmd.arg("-p").arg(format!("{}..{}", min, max));
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
        self.restarting.store(false, Ordering::SeqCst);

        let running = self.running.clone();
        let restarting = self.restarting.clone();
        let excluded_units = filter.excluded_units.clone();

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
                                // Filter out excluded units (journalctl doesn't support this natively)
                                if !excluded_units.is_empty() {
                                    if let Some(ref unit) = entry.systemd_unit {
                                        if excluded_units.contains(unit) {
                                            continue;
                                        }
                                    }
                                }
                                buffer.push(entry);

                                // Emit buffered entries periodically
                                if last_emit.elapsed().as_millis() >= BUFFER_INTERVAL_MS {
                                    if !buffer.is_empty() {
                                        // Use std::mem::take to avoid clone - moves entries out and replaces with empty vec
                                        let entries = std::mem::take(&mut buffer);
                                        let _ = app_handle.emit(
                                            "journal-follow-entry",
                                            FollowEvent { entries },
                                        );
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

            // Notify that follow mode has stopped (unless we're restarting)
            if !restarting.load(Ordering::SeqCst) {
                let _ = app_handle.emit("journal-follow-stopped", ());
            }
        });

        Ok(())
    }

    /// Internal stop - doesn't clear the restarting flag
    fn stop_internal(&mut self) {
        self.running.store(false, Ordering::SeqCst);

        if let Some(mut child) = self.child.take() {
            // Try to kill the process gracefully
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    /// Stop following the journal
    pub fn stop(&mut self) {
        // Clear restarting flag so the stopped event is emitted
        self.restarting.store(false, Ordering::SeqCst);
        self.stop_internal();
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
