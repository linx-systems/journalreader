//! Types for offline storage and sync state management.

use serde::{Deserialize, Serialize};

// ============================================================================
// Retention Policy Types
// ============================================================================

/// Retention mode determining how old entries are cleaned up.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RetentionMode {
    /// Delete entries older than X days
    Days,
    /// Keep only the last X boot_ids per host
    Boots,
    /// Delete oldest entries when database exceeds X MB
    Size,
    /// No automatic cleanup
    Unlimited,
}

impl Default for RetentionMode {
    fn default() -> Self {
        RetentionMode::Days
    }
}

impl From<&str> for RetentionMode {
    fn from(s: &str) -> Self {
        match s {
            "days" => RetentionMode::Days,
            "boots" => RetentionMode::Boots,
            "size" => RetentionMode::Size,
            "unlimited" => RetentionMode::Unlimited,
            _ => RetentionMode::Days,
        }
    }
}

impl RetentionMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            RetentionMode::Days => "days",
            RetentionMode::Boots => "boots",
            RetentionMode::Size => "size",
            RetentionMode::Unlimited => "unlimited",
        }
    }
}

/// Retention policy configuration for automatic cleanup of old journal entries.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetentionPolicy {
    /// The retention mode (days, boots, size, unlimited)
    pub mode: RetentionMode,
    /// Number of days to keep entries (used when mode is Days)
    pub days: Option<u32>,
    /// Number of boot_ids to keep per host (used when mode is Boots)
    pub boots: Option<u32>,
    /// Maximum database size in MB (used when mode is Size)
    pub max_mb: Option<u64>,
}

impl Default for RetentionPolicy {
    fn default() -> Self {
        Self {
            mode: RetentionMode::Days,
            days: Some(30),
            boots: None,
            max_mb: None,
        }
    }
}

/// Result of a retention cleanup operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetentionResult {
    /// Host ID that was cleaned up
    pub host_id: String,
    /// Number of entries deleted
    pub entries_deleted: u64,
    /// Retention mode that was applied
    pub mode: RetentionMode,
    /// Error message if cleanup failed
    pub error: Option<String>,
}

/// Sync status for a host
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SyncStatus {
    /// Never synced
    Never,
    /// Currently syncing
    InProgress,
    /// Sync completed successfully
    Completed,
    /// Sync failed with error
    Failed,
}

impl Default for SyncStatus {
    fn default() -> Self {
        SyncStatus::Never
    }
}

impl From<&str> for SyncStatus {
    fn from(s: &str) -> Self {
        match s {
            "in_progress" => SyncStatus::InProgress,
            "completed" => SyncStatus::Completed,
            "failed" => SyncStatus::Failed,
            _ => SyncStatus::Never,
        }
    }
}

impl SyncStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            SyncStatus::Never => "never",
            SyncStatus::InProgress => "in_progress",
            SyncStatus::Completed => "completed",
            SyncStatus::Failed => "failed",
        }
    }
}

/// Sync state for a host
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncState {
    /// Host ID
    pub host_id: String,
    /// Last successful sync timestamp (Unix millis)
    pub last_sync_timestamp: i64,
    /// Last cursor synced
    pub last_cursor: Option<String>,
    /// Current sync status
    pub sync_status: SyncStatus,
    /// Error message if sync failed
    pub sync_error: Option<String>,
    /// Total entries synced for this host
    pub entries_synced: i64,
}

impl Default for SyncState {
    fn default() -> Self {
        Self {
            host_id: String::new(),
            last_sync_timestamp: 0,
            last_cursor: None,
            sync_status: SyncStatus::Never,
            sync_error: None,
            entries_synced: 0,
        }
    }
}

/// Storage statistics for a host
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStats {
    /// Host ID
    pub host_id: String,
    /// Total entry count
    pub entry_count: i64,
    /// Oldest entry timestamp (Unix micros)
    pub oldest_timestamp: Option<i64>,
    /// Newest entry timestamp (Unix micros)
    pub newest_timestamp: Option<i64>,
    /// Database file size in bytes (global, not per-host)
    pub db_size_bytes: u64,
}

/// Offline settings for a host
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineSettings {
    /// Whether offline mode is enabled for this host
    pub enabled: bool,
    /// Retention period in days (0 = no limit)
    pub retention_days: u32,
    /// Maximum entries to store (0 = no limit)
    pub max_entries: u64,
    /// Whether to sync automatically when connected
    pub auto_sync: bool,
}

impl Default for OfflineSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            retention_days: 30,
            max_entries: 100_000,
            auto_sync: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sync_status_from_str() {
        assert_eq!(SyncStatus::from("never"), SyncStatus::Never);
        assert_eq!(SyncStatus::from("in_progress"), SyncStatus::InProgress);
        assert_eq!(SyncStatus::from("completed"), SyncStatus::Completed);
        assert_eq!(SyncStatus::from("failed"), SyncStatus::Failed);
        assert_eq!(SyncStatus::from("unknown"), SyncStatus::Never);
    }

    #[test]
    fn test_sync_status_as_str() {
        assert_eq!(SyncStatus::Never.as_str(), "never");
        assert_eq!(SyncStatus::InProgress.as_str(), "in_progress");
        assert_eq!(SyncStatus::Completed.as_str(), "completed");
        assert_eq!(SyncStatus::Failed.as_str(), "failed");
    }

    #[test]
    fn test_sync_state_default() {
        let state = SyncState::default();
        assert_eq!(state.host_id, "");
        assert_eq!(state.last_sync_timestamp, 0);
        assert!(state.last_cursor.is_none());
        assert_eq!(state.sync_status, SyncStatus::Never);
        assert!(state.sync_error.is_none());
        assert_eq!(state.entries_synced, 0);
    }

    #[test]
    fn test_offline_settings_default() {
        let settings = OfflineSettings::default();
        assert!(settings.enabled);
        assert_eq!(settings.retention_days, 30);
        assert_eq!(settings.max_entries, 100_000);
        assert!(settings.auto_sync);
    }

    #[test]
    fn test_retention_mode_from_str() {
        assert_eq!(RetentionMode::from("days"), RetentionMode::Days);
        assert_eq!(RetentionMode::from("boots"), RetentionMode::Boots);
        assert_eq!(RetentionMode::from("size"), RetentionMode::Size);
        assert_eq!(RetentionMode::from("unlimited"), RetentionMode::Unlimited);
        assert_eq!(RetentionMode::from("unknown"), RetentionMode::Days);
    }

    #[test]
    fn test_retention_mode_as_str() {
        assert_eq!(RetentionMode::Days.as_str(), "days");
        assert_eq!(RetentionMode::Boots.as_str(), "boots");
        assert_eq!(RetentionMode::Size.as_str(), "size");
        assert_eq!(RetentionMode::Unlimited.as_str(), "unlimited");
    }

    #[test]
    fn test_retention_policy_default() {
        let policy = RetentionPolicy::default();
        assert_eq!(policy.mode, RetentionMode::Days);
        assert_eq!(policy.days, Some(30));
        assert!(policy.boots.is_none());
        assert!(policy.max_mb.is_none());
    }

    #[test]
    fn test_retention_result_serialize() {
        let result = RetentionResult {
            host_id: "host-1".to_string(),
            entries_deleted: 100,
            mode: RetentionMode::Days,
            error: None,
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"hostId\":\"host-1\""));
        assert!(json.contains("\"entriesDeleted\":100"));
        assert!(json.contains("\"mode\":\"days\""));
    }
}
