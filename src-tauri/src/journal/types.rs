use serde::{Deserialize, Serialize};

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

