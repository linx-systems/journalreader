use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Authentication method for SSH connections
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AuthMethod {
    Password,
    Key,
    Agent,
}

impl Default for AuthMethod {
    fn default() -> Self {
        AuthMethod::Agent
    }
}

/// Remote host configuration for SSH connections
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteHost {
    pub id: String,
    pub name: String,
    pub hostname: String,
    #[serde(default = "default_port")]
    pub port: u16,
    pub username: String,
    #[serde(default)]
    pub auth_method: AuthMethod,
    pub key_path: Option<String>,
    #[serde(default)]
    pub sudo_required: bool,
    /// Whether to save password in system keyring (only for password auth)
    #[serde(default)]
    pub save_password: bool,
}

fn default_port() -> u16 {
    22
}

impl RemoteHost {
    /// Create a new RemoteHost with default settings (port 22, agent auth, no sudo)
    #[allow(dead_code)]
    pub fn new(name: String, hostname: String, username: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            hostname,
            port: 22,
            username,
            auth_method: AuthMethod::Agent,
            key_path: None,
            sudo_required: false,
            save_password: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_remote_host_new_defaults() {
        let host = RemoteHost::new(
            "test-server".to_string(),
            "192.168.1.100".to_string(),
            "admin".to_string(),
        );

        assert_eq!(host.name, "test-server");
        assert_eq!(host.hostname, "192.168.1.100");
        assert_eq!(host.username, "admin");
        assert_eq!(host.port, 22);
        assert_eq!(host.auth_method, AuthMethod::Agent);
        assert!(host.key_path.is_none());
        assert!(!host.sudo_required);
        assert!(!host.id.is_empty());
    }

    #[test]
    fn test_auth_method_default() {
        assert_eq!(AuthMethod::default(), AuthMethod::Agent);
    }

    #[test]
    fn test_connection_status_default() {
        assert_eq!(ConnectionStatus::default(), ConnectionStatus::Disconnected);
    }

    #[test]
    fn test_connection_state_default() {
        let state = ConnectionState::default();
        assert!(state.host_id.is_none());
        assert_eq!(state.status, ConnectionStatus::Disconnected);
        assert!(state.error_message.is_none());
    }
}

/// Request to create or update a remote host
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteHostInput {
    pub name: String,
    pub hostname: String,
    #[serde(default = "default_port")]
    pub port: u16,
    pub username: String,
    #[serde(default)]
    pub auth_method: AuthMethod,
    pub key_path: Option<String>,
    #[serde(default)]
    pub sudo_required: bool,
    /// Whether to save password in system keyring (only for password auth)
    #[serde(default)]
    pub save_password: bool,
}

/// Connection status for a remote host
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionStatus {
    Disconnected,
    Connecting,
    Connected,
    Error,
}

impl Default for ConnectionStatus {
    fn default() -> Self {
        ConnectionStatus::Disconnected
    }
}

/// Connection state information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionState {
    pub host_id: Option<String>,
    pub status: ConnectionStatus,
    pub error_message: Option<String>,
}

impl Default for ConnectionState {
    fn default() -> Self {
        Self {
            host_id: None,
            status: ConnectionStatus::Disconnected,
            error_message: None,
        }
    }
}

/// Test connection result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestConnectionResult {
    pub success: bool,
    pub message: String,
    pub journalctl_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub cursor: String,
    pub realtime_timestamp: i64,
    pub monotonic_timestamp: Option<i64>,
    pub boot_id: String,
    pub message: String,
    pub priority: u8,
    pub syslog_identifier: Option<String>,
    pub systemd_unit: Option<String>,
    pub pid: Option<u32>,
    pub uid: Option<u32>,
    pub gid: Option<u32>,
    pub exe: Option<String>,
    pub cmdline: Option<String>,
    pub hostname: Option<String>,
    pub comm: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct JournalFilter {
    #[serde(default)]
    pub units: Vec<String>,
    #[serde(default)]
    pub excluded_units: Vec<String>,
    #[serde(default)]
    pub priorities: Vec<u8>,
    pub since: Option<String>,
    pub until: Option<String>,
    pub grep_pattern: Option<String>,
    #[serde(default)]
    pub case_sensitive: bool,
    pub boot_id: Option<String>,
    pub boot_offset: Option<i32>,
    pub identifier: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: u32,
    #[serde(default = "default_true")]
    pub reverse: bool,
    pub after_cursor: Option<String>,
}

fn default_limit() -> u32 {
    500
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalQueryResult {
    pub entries: Vec<JournalEntry>,
    pub has_more: bool,
    pub cursor_start: Option<String>,
    pub cursor_end: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemUnit {
    pub name: String,
    pub description: Option<String>,
    pub load_state: Option<String>,
    pub active_state: Option<String>,
    pub sub_state: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootInfo {
    pub boot_id: String,
    pub boot_offset: i32,
    pub first_entry: Option<i64>,
    pub last_entry: Option<i64>,
}

// Statistics types

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatisticsRequest {
    #[serde(flatten)]
    pub filter: JournalFilter,
    pub granularity_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeseriesPoint {
    pub timestamp: i64,
    pub count: u64,
    pub error_count: u64,
    pub warning_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PriorityCount {
    pub priority: u8,
    pub label: String,
    pub count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceCount {
    pub service: String,
    pub count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalStatistics {
    pub timeseries: Vec<TimeseriesPoint>,
    pub priority_distribution: Vec<PriorityCount>,
    pub top_services: Vec<ServiceCount>,
    pub total_count: u64,
    pub error_rate: f64,
}

