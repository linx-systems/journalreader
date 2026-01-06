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
}

impl serde::Serialize for JournalError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
