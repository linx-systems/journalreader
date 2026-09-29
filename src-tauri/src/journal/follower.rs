use crate::error::JournalError;
use crate::journal::parser::{matches_post_filters, parse_entry};
use crate::journal::types::{JournalEntry, JournalFilter};
use regex::Regex;
use std::io::{BufRead, BufReader, Read};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const LOCAL_HOST_ID: &str = "local";

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FollowEvent {
    pub host_id: String,
    pub session_id: String,
    pub entries: Vec<JournalEntry>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FollowErrorEvent {
    pub host_id: String,
    pub session_id: String,
    pub message: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FollowStoppedEvent {
    pub host_id: String,
    pub session_id: String,
}

struct LocalRun {
    session_id: String,
    cancelled: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
    child: Arc<Mutex<Option<Child>>>,
    worker: Option<JoinHandle<()>>,
}

fn kill_and_reap_child(
    child: &Arc<Mutex<Option<Child>>>,
    cancelled: &AtomicBool,
) -> Option<Result<std::process::ExitStatus, std::io::Error>> {
    loop {
        let mut child = child.lock().ok()?;
        let status = {
            let process = child.as_mut()?;
            if cancelled.load(Ordering::SeqCst) {
                let _ = process.kill();
            }
            process.try_wait()
        };
        match status {
            Ok(Some(status)) => {
                child.take();
                return Some(Ok(status));
            }
            Ok(None) => {}
            Err(error) => {
                child.take();
                return Some(Err(error));
            }
        }
        drop(child);
        std::thread::sleep(Duration::from_millis(10));
    }
}

/// Owns exactly one journalctl follower and always reaps its worker.
pub struct JournalFollower {
    run: Option<LocalRun>,
}

impl JournalFollower {
    pub fn new() -> Self {
        Self { run: None }
    }

    pub fn start(
        &mut self,
        filter: &JournalFilter,
        session_id: String,
        app_handle: AppHandle,
    ) -> Result<(), JournalError> {
        self.stop_current();
        if let Some(pattern) = &filter.grep_pattern {
            if !pattern.is_empty() && Regex::new(pattern).is_err() {
                return Err(JournalError::InvalidRegex(pattern.clone()));
            }
        }

        let mut command = Command::new("journalctl");
        command.arg("-o").arg("json").arg("-f").arg("-n").arg("0");
        for unit in &filter.units {
            command.arg("-u").arg(unit);
        }
        if let (Some(minimum), Some(maximum)) = (filter.priorities.iter().min(), filter.priorities.iter().max()) {
            command.arg("-p").arg(format!("{}..{}", minimum, maximum));
        }
        if let Some(boot_id) = &filter.boot_id {
            command.arg("-b").arg(boot_id);
        } else if let Some(offset) = filter.boot_offset {
            command.arg("-b").arg(offset.to_string());
        }
        if let Some(identifier) = &filter.identifier {
            command.arg("-t").arg(identifier);
        }
        if let Some(pattern) = &filter.grep_pattern {
            if !pattern.is_empty() {
                command.arg("-g").arg(pattern);
                if !filter.case_sensitive {
                    command.arg("--case-sensitive=false");
                }
            }
        }
        command.stdout(Stdio::piped()).stderr(Stdio::piped());

        let mut child = command.spawn()?;
        let stdout = child.stdout.take().ok_or_else(|| JournalError::ExecutionError("Failed to capture journalctl stdout".into()))?;
        let stderr = child.stderr.take().ok_or_else(|| JournalError::ExecutionError("Failed to capture journalctl stderr".into()))?;
        let cancelled = Arc::new(AtomicBool::new(false));
        let running = Arc::new(AtomicBool::new(true));
        let child = Arc::new(Mutex::new(Some(child)));
        let excluded_units = filter.excluded_units.clone();
        let priorities = filter.priorities.clone();
        let worker_cancelled = cancelled.clone();
        let worker_running = running.clone();
        let worker_child = child.clone();
        let worker_session_id = session_id.clone();

        let worker = std::thread::spawn(move || {
            let (line_tx, line_rx) = mpsc::sync_channel::<Result<String, std::io::Error>>(1024);
            let stdout_reader = std::thread::spawn(move || {
                for line in BufReader::new(stdout).lines() {
                    if line_tx.send(line).is_err() {
                        break;
                    }
                }
            });
            let stderr_reader = std::thread::spawn(move || {
                let mut output = String::new();
                let _ = BufReader::new(stderr).read_to_string(&mut output);
                output
            });
            let mut entries = Vec::new();
            let mut last_emit = Instant::now();
            let mut error: Option<String> = None;

            loop {
                match line_rx.recv_timeout(Duration::from_millis(100)) {
                    Ok(Ok(line)) => {
                        if !line.trim().is_empty() {
                            match parse_entry(&line) {
                                Ok(entry) if matches_post_filters(&excluded_units, &priorities, entry.systemd_unit.as_deref(), entry.priority) => entries.push(entry),
                                Ok(_) => {}
                                Err(parse_error) => eprintln!("Warning: Failed to parse journal entry: {parse_error}"),
                            }
                        }
                    }
                    Ok(Err(read_error)) => {
                        if !worker_cancelled.load(Ordering::SeqCst) {
                            error = Some(read_error.to_string());
                        }
                        break;
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }
                if !entries.is_empty() && last_emit.elapsed() >= Duration::from_millis(100) {
                    let _ = app_handle.emit("journal-follow-entry", FollowEvent {
                        host_id: LOCAL_HOST_ID.into(), session_id: worker_session_id.clone(), entries: std::mem::take(&mut entries),
                    });
                    last_emit = Instant::now();
                }
                if worker_cancelled.load(Ordering::SeqCst) {
                    break;
                }
            }
            if !entries.is_empty() && !worker_cancelled.load(Ordering::SeqCst) {
                let _ = app_handle.emit("journal-follow-entry", FollowEvent {
                    host_id: LOCAL_HOST_ID.into(), session_id: worker_session_id.clone(), entries,
                });
            }

            let status = kill_and_reap_child(&worker_child, worker_cancelled.as_ref());
            drop(line_rx);
            let _ = stdout_reader.join();
            let stderr = stderr_reader.join().unwrap_or_default();
            worker_running.store(false, Ordering::SeqCst);
            if !worker_cancelled.load(Ordering::SeqCst) {
                match status {
                    Some(Err(wait_error)) => {
                        error.get_or_insert_with(|| wait_error.to_string());
                    }
                    Some(Ok(status)) if !status.success() => {
                        let detail = stderr.trim();
                        error.get_or_insert_with(|| {
                            if detail.is_empty() {
                                format!("journalctl exited with {status}")
                            } else {
                                detail.to_string()
                            }
                        });
                    }
                    _ => {}
                }
                if let Some(message) = error {
                    let _ = app_handle.emit("journal-follow-error", FollowErrorEvent {
                        host_id: LOCAL_HOST_ID.into(), session_id: worker_session_id.clone(), message,
                    });
                }
                let _ = app_handle.emit("journal-follow-stopped", FollowStoppedEvent {
                    host_id: LOCAL_HOST_ID.into(), session_id: worker_session_id,
                });
            }
        });

        self.run = Some(LocalRun { session_id, cancelled, running, child, worker: Some(worker) });
        Ok(())
    }

    pub fn stop(&mut self, session_id: &str) {
        if self.run.as_ref().is_some_and(|run| run.session_id == session_id) {
            self.stop_current();
        }
    }

    fn stop_current(&mut self) {
        if let Some(mut run) = self.run.take() {
            run.cancelled.store(true, Ordering::SeqCst);
            if let Ok(mut child) = run.child.lock() {
                if let Some(child) = child.as_mut() {
                    let _ = child.kill();
                }
            }
            if let Some(worker) = run.worker.take() {
                let _ = worker.join();
            }
            run.running.store(false, Ordering::SeqCst);
        }
    }

    pub fn is_running(&self) -> bool {
        self.run.as_ref().is_some_and(|run| run.running.load(Ordering::SeqCst))
    }
}

impl Drop for JournalFollower {
    fn drop(&mut self) {
        self.stop_current();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancelled_worker_kills_a_child_before_waiting_for_it() {
        let child = Command::new("sleep").arg("30").spawn().unwrap();
        let child = Arc::new(Mutex::new(Some(child)));
        let cancelled = Arc::new(AtomicBool::new(true));
        let worker_child = child.clone();
        let worker_cancelled = cancelled.clone();
        let (finished_tx, finished_rx) = mpsc::channel();

        let worker = std::thread::spawn(move || {
            let _ = kill_and_reap_child(&worker_child, worker_cancelled.as_ref());
            let _ = finished_tx.send(());
        });

        assert!(finished_rx.recv_timeout(Duration::from_secs(2)).is_ok());
        worker.join().unwrap();
        assert!(matches!(child.lock(), Ok(child) if child.is_none()));
    }
}
