use crate::error::JournalError;
use crate::journal::known_hosts::{HostKeyStatus, SharedKnownHostsStorage};
use crate::journal::parser::{matches_post_filters, parse_entry};
use crate::journal::shell_escape::escape_arg;
use crate::journal::types::{AuthMethod, JournalEntry, JournalFilter, RemoteHost};
use regex::Regex;
use ssh2::Session;
use std::io::Read;
use std::net::{Shutdown, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

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

struct RemoteRun {
    session_id: String,
    cancelled: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
    shutdown_socket: Arc<Mutex<Option<TcpStream>>>,
    worker: Option<JoinHandle<()>>,
}

struct ShutdownSocketCleanup(Arc<Mutex<Option<TcpStream>>>);

impl Drop for ShutdownSocketCleanup {
    fn drop(&mut self) {
        RemoteJournalFollower::clear_shutdown_socket(&self.0);
    }
}


/// Each remote follower owns a session-specific worker and its TCP shutdown handle.
pub struct RemoteJournalFollower {
    run: Option<RemoteRun>,
}

impl RemoteJournalFollower {
    pub fn new() -> Self {
        Self { run: None }
    }

    fn clear_shutdown_socket(shutdown_socket: &Arc<Mutex<Option<TcpStream>>>) {
        if let Ok(mut socket) = shutdown_socket.lock() {
            drop(socket.take());
        }
    }


    pub fn start(
        &mut self,
        host: &RemoteHost,
        password: Option<String>,
        filter: &JournalFilter,
        session_id: String,
        known_hosts: SharedKnownHostsStorage,
        app_handle: AppHandle,
    ) -> Result<(), JournalError> {
        self.stop_current();
        if let Some(pattern) = &filter.grep_pattern {
            if !pattern.is_empty() && Regex::new(pattern).is_err() {
                return Err(JournalError::InvalidRegex(pattern.clone()));
            }
        }
        let host = host.clone();
        let filter = filter.clone();
        let host_id = host.id.clone();
        let cancelled = Arc::new(AtomicBool::new(false));
        let running = Arc::new(AtomicBool::new(true));
        let shutdown_socket = Arc::new(Mutex::new(None));
        let worker_cancelled = cancelled.clone();
        let worker_running = running.clone();
        let worker_socket = shutdown_socket.clone();
        let worker_session_id = session_id.clone();
        let worker = std::thread::spawn(move || {
            let _shutdown_socket_cleanup = ShutdownSocketCleanup(worker_socket.clone());
            let result = Self::run_follow_loop(
                &host,
                password.as_deref(),
                &filter,
                &known_hosts,
                &worker_cancelled,
                &worker_socket,
                &host_id,
                &worker_session_id,
                &app_handle,
            );
            worker_running.store(false, Ordering::SeqCst);
            if !worker_cancelled.load(Ordering::SeqCst) {
                if let Err(error) = result {
                    let _ = app_handle.emit("journal-follow-error", FollowErrorEvent {
                        host_id: host_id.clone(), session_id: worker_session_id.clone(), message: error.to_string(),
                    });
                }
                let _ = app_handle.emit("journal-follow-stopped", FollowStoppedEvent {
                    host_id, session_id: worker_session_id,
                });
            }
        });
        self.run = Some(RemoteRun { session_id, cancelled, running, shutdown_socket, worker: Some(worker) });
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    fn run_follow_loop(
        host: &RemoteHost,
        password: Option<&str>,
        filter: &JournalFilter,
        known_hosts: &SharedKnownHostsStorage,
        cancelled: &Arc<AtomicBool>,
        shutdown_socket: &Arc<Mutex<Option<TcpStream>>>,
        host_id: &str,
        session_id: &str,
        app_handle: &AppHandle,
    ) -> Result<(), JournalError> {
        let addr = format!("{}:{}", host.hostname, host.port);
        let tcp = TcpStream::connect_timeout(
            &addr.parse().map_err(|error| JournalError::SshConnectionError(format!("Invalid address: {error}")))?,
            Duration::from_secs(10),
        ).map_err(|error| JournalError::SshConnectionError(format!("Failed to connect: {error}")))?;
        tcp.set_read_timeout(Some(Duration::from_secs(1)))
            .map_err(|error| JournalError::SshConnectionError(format!("Failed to set timeout: {error}")))?;
        let shutdown_clone = tcp.try_clone()
            .map_err(|error| JournalError::SshConnectionError(format!("Failed to retain shutdown socket: {error}")))?;
        if let Ok(mut socket) = shutdown_socket.lock() {
            *socket = Some(shutdown_clone);
        }
        if cancelled.load(Ordering::SeqCst) {
            return Ok(());
        }

        let mut session = Session::new().map_err(|error| JournalError::SshConnectionError(format!("Failed to create session: {error}")))?;
        session.set_tcp_stream(tcp);
        session.set_blocking(true);
        session.handshake().map_err(|error| JournalError::SshConnectionError(format!("SSH handshake failed: {error}")))?;
        if cancelled.load(Ordering::SeqCst) {
            return Ok(());
        }
        {
            let storage = known_hosts.lock().map_err(|error| JournalError::ExecutionError(error.to_string()))?;
            match storage.verify_host_key(&session, &host.hostname, host.port)? {
                HostKeyStatus::Verified => {}
                HostKeyStatus::NewHost { fingerprint, key_type } => return Err(JournalError::HostKeyVerificationRequired(format!("New host key for {}:{}\nType: {}\nFingerprint: {}", host.hostname, host.port, key_type, fingerprint))),
                HostKeyStatus::KeyChanged { old_fingerprint, new_fingerprint, old_key_type, new_key_type } => return Err(JournalError::HostKeyChanged(format!("WARNING: HOST KEY HAS CHANGED for {}:{}!\nPrevious key ({}):\n  {}\nNew key ({}):\n  {}", host.hostname, host.port, old_key_type, old_fingerprint, new_key_type, new_fingerprint))),
            }
        }
        Self::authenticate(&mut session, host, password)?;
        if cancelled.load(Ordering::SeqCst) {
            return Ok(());
        }
        let mut channel = session.channel_session().map_err(|error| JournalError::SshExecError(format!("Failed to open channel: {error}")))?;
        channel.exec(&Self::build_follow_command(host, filter)).map_err(|error| JournalError::SshExecError(format!("Failed to execute command: {error}")))?;
        let excluded_units = filter.excluded_units.clone();
        let priorities = filter.priorities.clone();
        let mut entries = Vec::new();
        let mut last_emit = Instant::now();
        let mut line_buffer = String::new();
        let mut byte_buffer = [0_u8; 4096];
        while !cancelled.load(Ordering::SeqCst) {
            match channel.read(&mut byte_buffer) {
                Ok(0) => break,
                Ok(length) => {
                    line_buffer.push_str(&String::from_utf8_lossy(&byte_buffer[..length]));
                    while let Some(position) = line_buffer.find('\n') {
                        let line = line_buffer[..position].to_string();
                        line_buffer.drain(..=position);
                        if line.trim().is_empty() { continue; }
                        match parse_entry(&line) {
                            Ok(entry) if matches_post_filters(&excluded_units, &priorities, entry.systemd_unit.as_deref(), entry.priority) => entries.push(entry),
                            Ok(_) => {}
                            Err(error) => eprintln!("Warning: Failed to parse journal entry: {error}"),
                        }
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {}
                Err(_error) if cancelled.load(Ordering::SeqCst) => break,
                Err(error) => return Err(JournalError::SshExecError(format!("Read error: {error}"))),
            }
            if !entries.is_empty() && last_emit.elapsed() >= Duration::from_millis(100) {
                let _ = app_handle.emit("journal-follow-entry", FollowEvent {
                    host_id: host_id.to_string(), session_id: session_id.to_string(), entries: std::mem::take(&mut entries),
                });
                last_emit = Instant::now();
            }
        }
        if !entries.is_empty() && !cancelled.load(Ordering::SeqCst) {
            let _ = app_handle.emit("journal-follow-entry", FollowEvent {
                host_id: host_id.to_string(), session_id: session_id.to_string(), entries,
            });
        }
        if !cancelled.load(Ordering::SeqCst) {
            let _ = channel.send_eof();
            let _ = channel.wait_close();
        }
        Ok(())
    }

    fn authenticate(session: &mut Session, host: &RemoteHost, password: Option<&str>) -> Result<(), JournalError> {
        match host.auth_method {
            AuthMethod::Agent => {
                let mut agent = session.agent().map_err(|error| JournalError::SshAuthError(format!("Failed to connect to SSH agent: {error}")))?;
                agent.connect().map_err(|error| JournalError::SshAuthError(format!("Failed to connect to SSH agent: {error}")))?;
                agent.list_identities().map_err(|error| JournalError::SshAuthError(format!("Failed to list identities: {error}")))?;
                let identities = agent.identities().map_err(|error| JournalError::SshAuthError(format!("Failed to get identities: {error}")))?;
                if !identities.into_iter().any(|identity| agent.userauth(&host.username, &identity).is_ok()) {
                    return Err(JournalError::SshAuthError("No suitable key found in SSH agent".into()));
                }
            }
            AuthMethod::Key => {
                let key_path = host.key_path.as_ref().ok_or_else(|| JournalError::SshAuthError("Key path required for key authentication".into()))?;
                let path = if key_path.starts_with('~') { dirs::home_dir().map(|home| home.join(&key_path[2..])).unwrap_or_else(|| PathBuf::from(key_path)) } else { PathBuf::from(key_path) };
                session.userauth_pubkey_file(&host.username, None, &path, password)
                    .map_err(|error| JournalError::SshAuthError(format!("Key authentication failed: {error}")))?;
            }
            AuthMethod::Password => {
                let password = password.ok_or_else(|| JournalError::SshAuthError("Password required for password authentication".into()))?;
                session.userauth_password(&host.username, password)
                    .map_err(|error| JournalError::SshAuthError(format!("Password authentication failed: {error}")))?;
            }
        }
        if !session.authenticated() { return Err(JournalError::SshAuthError("Authentication failed".into())); }
        Ok(())
    }

    fn build_follow_command(host: &RemoteHost, filter: &JournalFilter) -> String {
        let mut arguments = vec!["journalctl".to_string(), "-o".to_string(), "json".to_string(), "-f".to_string(), "-n".to_string(), "0".to_string()];
        for unit in &filter.units { arguments.push("-u".to_string()); arguments.push(escape_arg(unit)); }
        if let (Some(minimum), Some(maximum)) = (filter.priorities.iter().min(), filter.priorities.iter().max()) { arguments.push("-p".to_string()); arguments.push(format!("{}..{}", minimum, maximum)); }
        if let Some(boot_id) = &filter.boot_id { arguments.push("-b".to_string()); arguments.push(escape_arg(boot_id)); } else if let Some(offset) = filter.boot_offset { arguments.push("-b".to_string()); arguments.push(offset.to_string()); }
        if let Some(identifier) = &filter.identifier { arguments.push("-t".to_string()); arguments.push(escape_arg(identifier)); }
        if let Some(pattern) = &filter.grep_pattern { if !pattern.is_empty() { arguments.push("-g".to_string()); arguments.push(escape_arg(pattern)); if !filter.case_sensitive { arguments.push("--case-sensitive=false".to_string()); } } }
        let command = arguments.join(" ");
        if host.sudo_required { format!("sudo {command}") } else { command }
    }

    pub fn stop(&mut self, session_id: &str) {
        if self.run.as_ref().is_some_and(|run| run.session_id == session_id) { self.stop_current(); }
    }

    fn stop_current(&mut self) {
        if let Some(mut run) = self.run.take() {
            run.cancelled.store(true, Ordering::SeqCst);
            let shutdown_socket = run
                .shutdown_socket
                .lock()
                .ok()
                .and_then(|mut socket| socket.take());
            if let Some(socket) = shutdown_socket {
                let _ = socket.shutdown(Shutdown::Both);
            }
            if let Some(worker) = run.worker.take() { let _ = worker.join(); }
            run.running.store(false, Ordering::SeqCst);
        }
    }

    pub fn is_running(&self) -> bool { self.run.as_ref().is_some_and(|run| run.running.load(Ordering::SeqCst)) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn terminal_worker_drops_its_shutdown_socket() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let socket = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
        let (mut peer, _) = listener.accept().unwrap();
        let shutdown_socket = Arc::new(Mutex::new(Some(socket)));

        RemoteJournalFollower::clear_shutdown_socket(&shutdown_socket);

        assert!(matches!(shutdown_socket.lock(), Ok(socket) if socket.is_none()));
        peer.set_read_timeout(Some(Duration::from_secs(1))).unwrap();
        assert_eq!(peer.read(&mut [0_u8; 1]).unwrap(), 0);
    }
}

impl Default for RemoteJournalFollower { fn default() -> Self { Self::new() } }
impl Drop for RemoteJournalFollower { fn drop(&mut self) { self.stop_current(); } }
