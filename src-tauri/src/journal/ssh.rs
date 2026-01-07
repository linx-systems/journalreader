use crate::error::JournalError;
use crate::journal::types::{AuthMethod, RemoteHost, TestConnectionResult};
use ssh2::Session;
use std::io::Read;
use std::net::TcpStream;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// SSH connection manager
pub struct SshConnection {
    session: Session,
    host: RemoteHost,
}

impl SshConnection {
    /// Create a new SSH connection to a remote host
    pub fn connect(host: &RemoteHost, password: Option<&str>) -> Result<Self, JournalError> {
        let addr = format!("{}:{}", host.hostname, host.port);

        // Connect with timeout
        let tcp = TcpStream::connect_timeout(
            &addr.parse().map_err(|e| {
                JournalError::SshConnectionError(format!("Invalid address: {}", e))
            })?,
            Duration::from_secs(10),
        )
        .map_err(|e| JournalError::SshConnectionError(format!("Failed to connect: {}", e)))?;

        tcp.set_read_timeout(Some(Duration::from_secs(30)))
            .map_err(|e| JournalError::SshConnectionError(format!("Failed to set timeout: {}", e)))?;

        let mut session = Session::new()
            .map_err(|e| JournalError::SshConnectionError(format!("Failed to create session: {}", e)))?;

        session.set_tcp_stream(tcp);
        session
            .handshake()
            .map_err(|e| JournalError::SshConnectionError(format!("SSH handshake failed: {}", e)))?;

        // Authenticate based on method
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

                // Expand ~ to home directory
                let expanded_path = if key_path.starts_with('~') {
                    if let Some(home) = dirs::home_dir() {
                        home.join(&key_path[2..])
                    } else {
                        PathBuf::from(key_path)
                    }
                } else {
                    PathBuf::from(key_path)
                };

                // Try with passphrase from password field if provided
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

        Ok(Self {
            session,
            host: host.clone(),
        })
    }

    /// Execute a command on the remote host and return stdout
    pub fn run_command(&self, command: &str) -> Result<String, JournalError> {
        let full_command = if self.host.sudo_required {
            format!("sudo {}", command)
        } else {
            command.to_string()
        };

        let mut channel = self.session.channel_session().map_err(|e| {
            JournalError::SshExecError(format!("Failed to open channel: {}", e))
        })?;

        channel.exec(&full_command).map_err(|e| {
            JournalError::SshExecError(format!("Failed to execute command: {}", e))
        })?;

        let mut output = String::new();
        channel.read_to_string(&mut output).map_err(|e| {
            JournalError::SshExecError(format!("Failed to read output: {}", e))
        })?;

        channel.wait_close().ok();

        let exit_status = channel.exit_status().unwrap_or(-1);
        if exit_status != 0 {
            let mut stderr = String::new();
            channel.stderr().read_to_string(&mut stderr).ok();

            // Check for common error patterns
            if stderr.contains("Permission denied") || stderr.contains("access denied") {
                return Err(JournalError::PermissionDenied);
            }
            if stderr.contains("No journal files were found") || stderr.contains("Failed to open journal") {
                return Err(JournalError::JournalNotAvailable);
            }

            // Non-zero exit with some output is still valid for journalctl in some cases
            if !output.is_empty() && stderr.is_empty() {
                return Ok(output);
            }

            return Err(JournalError::SshExecError(format!(
                "Command failed (exit {}): {}",
                exit_status,
                if stderr.is_empty() { "unknown error" } else { stderr.trim() }
            )));
        }

        Ok(output)
    }

    /// Test the connection and check if journalctl is available
    pub fn test(&self) -> TestConnectionResult {
        // Test basic command execution
        match self.run_command("echo 'test'") {
            Ok(_) => {}
            Err(e) => {
                return TestConnectionResult {
                    success: false,
                    message: format!("Command execution failed: {}", e),
                    journalctl_available: false,
                };
            }
        }

        // Check if journalctl is available
        let journalctl_available = match self.run_command("which journalctl") {
            Ok(output) => !output.trim().is_empty(),
            Err(_) => false,
        };

        if !journalctl_available {
            return TestConnectionResult {
                success: true,
                message: "Connected successfully, but journalctl not found on remote host".to_string(),
                journalctl_available: false,
            };
        }

        // Try to read at least one log entry to verify permissions
        match self.run_command("journalctl -n 1 -o json --no-pager") {
            Ok(_) => TestConnectionResult {
                success: true,
                message: "Connected successfully and journalctl is accessible".to_string(),
                journalctl_available: true,
            },
            Err(JournalError::PermissionDenied) => TestConnectionResult {
                success: true,
                message: "Connected successfully, but user lacks permission to read journal. Consider enabling sudo.".to_string(),
                journalctl_available: true,
            },
            Err(e) => TestConnectionResult {
                success: true,
                message: format!("Connected successfully, but journalctl test failed: {}", e),
                journalctl_available: true,
            },
        }
    }

    /// Get reference to the host config
    pub fn host(&self) -> &RemoteHost {
        &self.host
    }
}

/// Global connection manager that holds the active SSH connection
pub struct ConnectionManager {
    connection: Option<SshConnection>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self { connection: None }
    }

    pub fn connect(
        &mut self,
        host: &RemoteHost,
        password: Option<&str>,
    ) -> Result<(), JournalError> {
        // Disconnect any existing connection
        self.disconnect();

        let conn = SshConnection::connect(host, password)?;
        self.connection = Some(conn);
        Ok(())
    }

    pub fn disconnect(&mut self) {
        self.connection = None;
    }

    pub fn is_connected(&self) -> bool {
        self.connection.is_some()
    }

    pub fn current_host(&self) -> Option<&RemoteHost> {
        self.connection.as_ref().map(|c| c.host())
    }

    pub fn run_command(&self, command: &str) -> Result<String, JournalError> {
        match &self.connection {
            Some(conn) => conn.run_command(command),
            None => Err(JournalError::NotConnected),
        }
    }

    #[allow(dead_code)]
    pub fn test_connection(&self) -> Result<TestConnectionResult, JournalError> {
        match &self.connection {
            Some(conn) => Ok(conn.test()),
            None => Err(JournalError::NotConnected),
        }
    }
}

impl Default for ConnectionManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Thread-safe wrapper for the connection manager
pub type SharedConnectionManager = Arc<Mutex<ConnectionManager>>;

pub fn new_shared_connection_manager() -> SharedConnectionManager {
    Arc::new(Mutex::new(ConnectionManager::new()))
}
