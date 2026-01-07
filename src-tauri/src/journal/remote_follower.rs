use crate::error::JournalError;
use crate::journal::parser::parse_entry;
use crate::journal::types::{AuthMethod, JournalEntry, JournalFilter, RemoteHost};
use regex::Regex;
use ssh2::Session;
use std::io::Read;
use std::net::TcpStream;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
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

/// Remote journal follower that streams logs over SSH
pub struct RemoteJournalFollower {
    running: Arc<AtomicBool>,
    restarting: Arc<AtomicBool>,
}

impl RemoteJournalFollower {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            restarting: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Start following the remote journal with the given filter
    pub fn start(
        &mut self,
        host: &RemoteHost,
        password: Option<String>,
        filter: &JournalFilter,
        app_handle: AppHandle,
    ) -> Result<(), JournalError> {
        // Mark as restarting to suppress the stopped event
        self.restarting.store(true, Ordering::SeqCst);
        self.stop_internal();

        // Validate regex if present
        if let Some(pattern) = &filter.grep_pattern {
            if !pattern.is_empty() && Regex::new(pattern).is_err() {
                return Err(JournalError::InvalidRegex(pattern.clone()));
            }
        }

        // Clone data for the thread
        let host = host.clone();
        let filter = filter.clone();
        let running = self.running.clone();
        let restarting = self.restarting.clone();

        running.store(true, Ordering::SeqCst);
        restarting.store(false, Ordering::SeqCst);

        // Spawn a thread to handle the SSH connection and streaming
        std::thread::spawn(move || {
            let result = Self::run_follow_loop(&host, password.as_deref(), &filter, &running, &restarting, &app_handle);

            if let Err(e) = result {
                let _ = app_handle.emit(
                    "journal-follow-error",
                    FollowErrorEvent {
                        message: e.to_string(),
                    },
                );
            }

            // Notify that follow mode has stopped
            if !restarting.load(Ordering::SeqCst) {
                let _ = app_handle.emit("journal-follow-stopped", ());
            }
        });

        Ok(())
    }

    fn run_follow_loop(
        host: &RemoteHost,
        password: Option<&str>,
        filter: &JournalFilter,
        running: &Arc<AtomicBool>,
        _restarting: &Arc<AtomicBool>,
        app_handle: &AppHandle,
    ) -> Result<(), JournalError> {
        // Establish SSH connection
        let addr = format!("{}:{}", host.hostname, host.port);
        let tcp = TcpStream::connect_timeout(
            &addr.parse().map_err(|e| {
                JournalError::SshConnectionError(format!("Invalid address: {}", e))
            })?,
            Duration::from_secs(10),
        )
        .map_err(|e| JournalError::SshConnectionError(format!("Failed to connect: {}", e)))?;

        // Set a shorter read timeout for responsive stopping
        tcp.set_read_timeout(Some(Duration::from_secs(1)))
            .map_err(|e| JournalError::SshConnectionError(format!("Failed to set timeout: {}", e)))?;

        let mut session = Session::new()
            .map_err(|e| JournalError::SshConnectionError(format!("Failed to create session: {}", e)))?;

        session.set_tcp_stream(tcp);
        session.set_blocking(true);
        session
            .handshake()
            .map_err(|e| JournalError::SshConnectionError(format!("SSH handshake failed: {}", e)))?;

        // Authenticate
        Self::authenticate(&mut session, host, password)?;

        // Build the journalctl follow command
        let cmd = Self::build_follow_command(host, filter);

        // Open a channel and execute the command
        let mut channel = session.channel_session().map_err(|e| {
            JournalError::SshExecError(format!("Failed to open channel: {}", e))
        })?;

        channel.exec(&cmd).map_err(|e| {
            JournalError::SshExecError(format!("Failed to execute command: {}", e))
        })?;

        // Read from the channel
        let excluded_units = filter.excluded_units.clone();
        let mut buffer: Vec<JournalEntry> = Vec::new();
        let mut last_emit = std::time::Instant::now();
        const BUFFER_INTERVAL_MS: u128 = 100;

        let mut line_buffer = String::new();
        let mut byte_buffer = [0u8; 4096];

        while running.load(Ordering::SeqCst) {
            match channel.read(&mut byte_buffer) {
                Ok(0) => {
                    // EOF - channel closed
                    break;
                }
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&byte_buffer[..n]);
                    line_buffer.push_str(&chunk);

                    // Process complete lines
                    while let Some(pos) = line_buffer.find('\n') {
                        let line = line_buffer[..pos].to_string();
                        line_buffer = line_buffer[pos + 1..].to_string();

                        if line.trim().is_empty() {
                            continue;
                        }

                        match parse_entry(&line) {
                            Ok(entry) => {
                                // Filter out excluded units
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
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    // Timeout - check if we should stop, then emit any buffered entries
                    if !buffer.is_empty() && last_emit.elapsed().as_millis() >= BUFFER_INTERVAL_MS {
                        let _ = app_handle.emit(
                            "journal-follow-entry",
                            FollowEvent {
                                entries: buffer.clone(),
                            },
                        );
                        buffer.clear();
                        last_emit = std::time::Instant::now();
                    }
                    continue;
                }
                Err(e) => {
                    return Err(JournalError::SshExecError(format!("Read error: {}", e)));
                }
            }
        }

        // Emit any remaining buffered entries
        if !buffer.is_empty() {
            let _ = app_handle.emit("journal-follow-entry", FollowEvent { entries: buffer });
        }

        // Close the channel
        channel.send_eof().ok();
        channel.wait_close().ok();

        Ok(())
    }

    fn authenticate(session: &mut Session, host: &RemoteHost, password: Option<&str>) -> Result<(), JournalError> {
        match host.auth_method {
            AuthMethod::Agent => {
                let mut agent = session.agent().map_err(|e| {
                    JournalError::SshAuthError(format!("Failed to connect to SSH agent: {}", e))
                })?;

                agent.connect().map_err(|e| {
                    JournalError::SshAuthError(format!("Failed to connect to SSH agent: {}", e))
                })?;

                agent.list_identities().map_err(|e| {
                    JournalError::SshAuthError(format!("Failed to list identities: {}", e))
                })?;

                let identities = agent.identities().map_err(|e| {
                    JournalError::SshAuthError(format!("Failed to get identities: {}", e))
                })?;

                let mut authenticated = false;
                for identity in identities {
                    if agent.userauth(&host.username, &identity).is_ok() {
                        authenticated = true;
                        break;
                    }
                }

                if !authenticated {
                    return Err(JournalError::SshAuthError(
                        "No suitable key found in SSH agent".to_string(),
                    ));
                }
            }
            AuthMethod::Key => {
                let key_path = host.key_path.as_ref().ok_or_else(|| {
                    JournalError::SshAuthError("Key path required for key authentication".to_string())
                })?;

                let expanded_path = if key_path.starts_with('~') {
                    if let Some(home) = dirs::home_dir() {
                        home.join(&key_path[2..])
                    } else {
                        PathBuf::from(key_path)
                    }
                } else {
                    PathBuf::from(key_path)
                };

                session
                    .userauth_pubkey_file(&host.username, None, &expanded_path, password)
                    .map_err(|e| {
                        JournalError::SshAuthError(format!("Key authentication failed: {}", e))
                    })?;
            }
            AuthMethod::Password => {
                let pwd = password.ok_or_else(|| {
                    JournalError::SshAuthError("Password required for password authentication".to_string())
                })?;

                session
                    .userauth_password(&host.username, pwd)
                    .map_err(|e| {
                        JournalError::SshAuthError(format!("Password authentication failed: {}", e))
                    })?;
            }
        }

        if !session.authenticated() {
            return Err(JournalError::SshAuthError("Authentication failed".to_string()));
        }

        Ok(())
    }

    fn build_follow_command(host: &RemoteHost, filter: &JournalFilter) -> String {
        let mut args = vec!["journalctl".to_string()];
        args.push("-o".to_string());
        args.push("json".to_string());
        args.push("-f".to_string());
        args.push("-n".to_string());
        args.push("0".to_string());

        // Apply unit filters
        for unit in &filter.units {
            args.push("-u".to_string());
            args.push(unit.clone());
        }

        // Priority filter
        if !filter.priorities.is_empty() {
            let min = filter.priorities.iter().min().unwrap();
            let max = filter.priorities.iter().max().unwrap();
            args.push("-p".to_string());
            args.push(format!("{}..{}", min, max));
        }

        // Boot filter
        if let Some(boot_id) = &filter.boot_id {
            args.push("-b".to_string());
            args.push(boot_id.clone());
        } else if let Some(offset) = filter.boot_offset {
            args.push("-b".to_string());
            args.push(offset.to_string());
        }

        // Identifier filter
        if let Some(identifier) = &filter.identifier {
            args.push("-t".to_string());
            args.push(identifier.clone());
        }

        // Grep pattern
        if let Some(pattern) = &filter.grep_pattern {
            if !pattern.is_empty() {
                args.push("-g".to_string());
                args.push(format!("'{}'", pattern));
                if !filter.case_sensitive {
                    args.push("--case-sensitive=false".to_string());
                }
            }
        }

        let cmd = args.join(" ");
        if host.sudo_required {
            format!("sudo {}", cmd)
        } else {
            cmd
        }
    }

    fn stop_internal(&mut self) {
        self.running.store(false, Ordering::SeqCst);
    }

    pub fn stop(&mut self) {
        self.restarting.store(false, Ordering::SeqCst);
        self.stop_internal();
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }
}

impl Default for RemoteJournalFollower {
    fn default() -> Self {
        Self::new()
    }
}
