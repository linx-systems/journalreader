//! Types for offline storage and sync state management.

use serde::{Deserialize, Serialize};

// ============================================================================
// Retention Policy Types
// ============================================================================

/// Retention policy configuration for automatic cleanup of old journal entries.
/// Only boot-based retention is supported - keeps the last N boots per host.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetentionPolicy {
    /// Number of boot_ids to keep per host (default: 5)
    pub boots: u32,
}

impl Default for RetentionPolicy {
    fn default() -> Self {
        Self { boots: 5 }
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
    /// Number of boots kept
    pub boots_kept: u32,
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
    /// Number of boots to sync and retain (default: 5)
    pub sync_boots: u32,
    /// Whether to sync automatically when connected
    pub auto_sync: bool,
}

impl Default for OfflineSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            sync_boots: 5,
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
        assert_eq!(settings.sync_boots, 5);
        assert!(settings.auto_sync);
    }

    #[test]
    fn test_retention_policy_default() {
        let policy = RetentionPolicy::default();
        assert_eq!(policy.boots, 5);
    }

    #[test]
    fn test_retention_result_serialize() {
        let result = RetentionResult {
            host_id: "host-1".to_string(),
            entries_deleted: 100,
            boots_kept: 5,
            error: None,
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"hostId\":\"host-1\""));
        assert!(json.contains("\"entriesDeleted\":100"));
        assert!(json.contains("\"bootsKept\":5"));
    }
}
