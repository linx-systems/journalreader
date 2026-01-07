use thiserror::Error;

#[derive(Error, Debug)]
pub enum JournalError {
    #[error("Failed to execute journalctl: {0}")]
    ExecutionError(String),

    #[error("Failed to parse journal output: {0}")]
    ParseError(String),

    #[error("Permission denied. User may need to be in 'adm' or 'systemd-journal' group")]
    PermissionDenied,

    #[error("Invalid regex pattern: {0}")]
    InvalidRegex(String),

    #[error("Journal not available")]
    JournalNotAvailable,

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    // SSH-related errors
    #[error("SSH connection failed: {0}")]
    SshConnectionError(String),

    #[error("SSH authentication failed: {0}")]
    SshAuthError(String),

    #[error("SSH command execution failed: {0}")]
    SshExecError(String),

    #[error("Not connected to any remote host")]
    NotConnected,

    #[error("Remote host not found: {0}")]
    HostNotFound(String),

    #[error("Configuration error: {0}")]
    ConfigError(String),
}

impl serde::Serialize for JournalError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
