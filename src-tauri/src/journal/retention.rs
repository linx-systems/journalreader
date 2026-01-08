//! Retention policy enforcement for offline journal storage.
//!
//! This module implements automatic and manual cleanup of journal entries
//! based on configurable retention policies.

use crate::error::JournalError;
use crate::journal::offline_db::OfflineDatabase;
use crate::journal::offline_types::{RetentionMode, RetentionPolicy, RetentionResult};
use rusqlite::params;
use std::time::{SystemTime, UNIX_EPOCH};

/// Get current timestamp in microseconds (matching journal realtime_timestamp format).
fn now_micros() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros() as i64
}

impl OfflineDatabase {
    /// Apply retention policy for a specific host.
    ///
    /// This method enforces the retention policy by deleting old entries
    /// according to the specified mode:
    /// - `Days`: Delete entries older than X days
    /// - `Boots`: Keep only the last X boot_ids per host
    /// - `Size`: Delete oldest entries when database exceeds X MB
    /// - `Unlimited`: No cleanup performed
    ///
    /// # Arguments
    /// * `host_id` - The host ID to apply retention to
    /// * `policy` - The retention policy to enforce
    ///
    /// # Returns
    /// The number of entries deleted, or an error.
    pub fn apply_retention(
        &self,
        host_id: &str,
        policy: &RetentionPolicy,
    ) -> Result<u64, JournalError> {
        match policy.mode {
            RetentionMode::Days => {
                let days = policy.days.unwrap_or(30);
                self.delete_entries_older_than_days(host_id, days)
            }
            RetentionMode::Boots => {
                let boots = policy.boots.unwrap_or(5);
                self.keep_last_n_boots(host_id, boots)
            }
            RetentionMode::Size => {
                let max_mb = policy.max_mb.unwrap_or(500);
                self.delete_until_size_under(max_mb)
            }
            RetentionMode::Unlimited => Ok(0),
        }
    }

    /// Apply retention policy and return a detailed result.
    pub fn apply_retention_with_result(
        &self,
        host_id: &str,
        policy: &RetentionPolicy,
    ) -> RetentionResult {
        match self.apply_retention(host_id, policy) {
            Ok(deleted) => RetentionResult {
                host_id: host_id.to_string(),
                entries_deleted: deleted,
                mode: policy.mode.clone(),
                error: None,
            },
            Err(e) => RetentionResult {
                host_id: host_id.to_string(),
                entries_deleted: 0,
                mode: policy.mode.clone(),
                error: Some(e.to_string()),
            },
        }
    }

    /// Delete entries older than X days for a specific host.
    ///
    /// Uses the realtime_timestamp field which is in microseconds.
    fn delete_entries_older_than_days(
        &self,
        host_id: &str,
        days: u32,
    ) -> Result<u64, JournalError> {
        // Calculate cutoff timestamp: now - (days * 24 * 60 * 60 * 1_000_000) microseconds
        let micros_per_day: i64 = 86_400 * 1_000_000;
        let cutoff = now_micros() - (days as i64 * micros_per_day);

        let deleted = self
            .conn
            .execute(
                "DELETE FROM journal_entries WHERE host_id = ? AND realtime_timestamp < ?",
                params![host_id, cutoff],
            )
            .map_err(|e| {
                JournalError::ConfigError(format!("Failed to delete old entries: {}", e))
            })?;

        Ok(deleted as u64)
    }

    /// Keep only the last N boot_ids for a specific host.
    ///
    /// Identifies the most recent N boot_ids by their maximum timestamp,
    /// then deletes all entries from older boots.
    fn keep_last_n_boots(&self, host_id: &str, n: u32) -> Result<u64, JournalError> {
        if n == 0 {
            return Ok(0);
        }

        // Get the list of boot_ids to keep (most recent N by max timestamp)
        let mut stmt = self
            .conn
            .prepare(
                r#"
                SELECT boot_id
                FROM journal_entries
                WHERE host_id = ?
                GROUP BY boot_id
                ORDER BY MAX(realtime_timestamp) DESC
                LIMIT ?
                "#,
            )
            .map_err(|e| {
                JournalError::ConfigError(format!("Failed to prepare boot query: {}", e))
            })?;

        let boot_ids: Vec<String> = stmt
            .query_map(params![host_id, n], |row| row.get(0))
            .map_err(|e| JournalError::ConfigError(format!("Failed to query boots: {}", e)))?
            .filter_map(|r| r.ok())
            .collect();

        if boot_ids.is_empty() {
            return Ok(0);
        }

        // Build the NOT IN clause with proper placeholders
        let placeholders: Vec<&str> = boot_ids.iter().map(|_| "?").collect();
        let sql = format!(
            "DELETE FROM journal_entries WHERE host_id = ? AND boot_id NOT IN ({})",
            placeholders.join(", ")
        );

        // Build params: host_id followed by all boot_ids to keep
        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        params_vec.push(Box::new(host_id.to_string()));
        for boot_id in &boot_ids {
            params_vec.push(Box::new(boot_id.clone()));
        }

        let params_refs: Vec<&dyn rusqlite::ToSql> =
            params_vec.iter().map(|p| p.as_ref()).collect();

        let deleted = self.conn.execute(&sql, params_refs.as_slice()).map_err(|e| {
            JournalError::ConfigError(format!("Failed to delete old boots: {}", e))
        })?;

        Ok(deleted as u64)
    }

    /// Delete oldest entries until database size is under the specified limit.
    ///
    /// This operates globally across all hosts since the database file size
    /// is shared.
    fn delete_until_size_under(&self, max_mb: u64) -> Result<u64, JournalError> {
        let max_bytes = max_mb * 1024 * 1024;
        let mut total_deleted: u64 = 0;

        // Get current database size
        let db_path = OfflineDatabase::path()?;

        loop {
            let current_size = std::fs::metadata(&db_path)
                .map(|m| m.len())
                .unwrap_or(0);

            if current_size <= max_bytes {
                break;
            }

            // Delete a batch of oldest entries (1000 at a time)
            let deleted = self
                .conn
                .execute(
                    r#"
                    DELETE FROM journal_entries
                    WHERE id IN (
                        SELECT id FROM journal_entries
                        ORDER BY realtime_timestamp ASC
                        LIMIT 1000
                    )
                    "#,
                    [],
                )
                .map_err(|e| {
                    JournalError::ConfigError(format!("Failed to delete entries for size: {}", e))
                })?;

            if deleted == 0 {
                // No more entries to delete
                break;
            }

            total_deleted += deleted as u64;

            // Run VACUUM to actually reclaim space
            // Note: This is expensive, so we only do it after deleting
            self.conn.execute("VACUUM", []).map_err(|e| {
                JournalError::ConfigError(format!("Failed to vacuum database: {}", e))
            })?;
        }

        Ok(total_deleted)
    }

    /// Apply retention to all hosts using a single policy.
    ///
    /// For size-based retention, this operates globally.
    /// For days and boots retention, it applies to each host.
    pub fn apply_retention_all(
        &self,
        policy: &RetentionPolicy,
    ) -> Result<Vec<RetentionResult>, JournalError> {
        match policy.mode {
            RetentionMode::Size => {
                // Size-based retention is global
                let result = self.apply_retention_with_result("*", policy);
                Ok(vec![result])
            }
            RetentionMode::Unlimited => {
                // No-op for unlimited
                Ok(vec![])
            }
            _ => {
                // Get all hosts and apply retention to each
                let host_ids = self.get_all_host_ids()?;
                let mut results = Vec::new();

                for host_id in host_ids {
                    let result = self.apply_retention_with_result(&host_id, policy);
                    results.push(result);
                }

                Ok(results)
            }
        }
    }

    /// Get all unique host IDs in the database.
    fn get_all_host_ids(&self) -> Result<Vec<String>, JournalError> {
        let mut stmt = self
            .conn
            .prepare("SELECT DISTINCT host_id FROM journal_entries ORDER BY host_id")
            .map_err(|e| {
                JournalError::ConfigError(format!("Failed to prepare host query: {}", e))
            })?;

        let host_ids: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| JournalError::ConfigError(format!("Failed to query hosts: {}", e)))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(host_ids)
    }

    /// Get the retention policy from settings.
    ///
    /// Converts OfflineSettings into a RetentionPolicy based on the
    /// configured retention_days. If max_entries is set, uses size mode.
    pub fn get_retention_policy(&self) -> Result<RetentionPolicy, JournalError> {
        let settings = self.get_offline_settings()?;

        // Determine the retention mode based on settings
        if settings.retention_days == 0 && settings.max_entries == 0 {
            // Unlimited mode
            Ok(RetentionPolicy {
                mode: RetentionMode::Unlimited,
                days: None,
                boots: None,
                max_mb: None,
            })
        } else if settings.retention_days > 0 {
            // Days-based retention (primary)
            Ok(RetentionPolicy {
                mode: RetentionMode::Days,
                days: Some(settings.retention_days),
                boots: None,
                max_mb: None,
            })
        } else {
            // Default to 30 days
            Ok(RetentionPolicy::default())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::journal::types::JournalEntry;
    use rusqlite::Connection;
    use tempfile::tempdir;

    /// Helper to create a test database in a temporary directory
    fn create_test_db() -> (OfflineDatabase, tempfile::TempDir) {
        let temp_dir = tempdir().expect("Failed to create temp dir");
        let db_path = temp_dir.path().join("test_retention.db");

        let conn = Connection::open(&db_path).expect("Failed to open test database");
        let db = OfflineDatabase::from_connection(conn);
        db.run_migrations().expect("Failed to run migrations");

        (db, temp_dir)
    }

    fn sample_entry(cursor: &str, message: &str, timestamp: i64, boot_id: &str) -> JournalEntry {
        JournalEntry {
            cursor: cursor.to_string(),
            realtime_timestamp: timestamp,
            monotonic_timestamp: Some(1000),
            boot_id: boot_id.to_string(),
            message: message.to_string(),
            priority: 6,
            syslog_identifier: Some("test".to_string()),
            systemd_unit: Some("test.service".to_string()),
            pid: Some(1234),
            uid: Some(1000),
            gid: Some(1000),
            exe: Some("/usr/bin/test".to_string()),
            cmdline: Some("/usr/bin/test arg1".to_string()),
            hostname: Some("localhost".to_string()),
            comm: Some("test".to_string()),
        }
    }

    #[test]
    fn test_unlimited_retention() {
        let (db, _temp_dir) = create_test_db();

        let entries = vec![
            sample_entry("cur1", "Old message", 1000, "boot1"),
            sample_entry("cur2", "New message", 2000, "boot2"),
        ];
        db.insert_entries("host1", &entries).unwrap();

        let policy = RetentionPolicy {
            mode: RetentionMode::Unlimited,
            days: None,
            boots: None,
            max_mb: None,
        };

        let deleted = db.apply_retention("host1", &policy).unwrap();
        assert_eq!(deleted, 0);

        // Verify no entries were deleted
        let stats = db.get_storage_stats("host1").unwrap();
        assert_eq!(stats.entry_count, 2);
    }

    #[test]
    fn test_days_retention() {
        let (db, _temp_dir) = create_test_db();

        let now = now_micros();
        // Half a day ago (within retention window)
        let half_day_ago = now - (12 * 60 * 60 * 1_000_000); // 12 hours in microseconds
        // Two days ago (outside retention window)
        let two_days_ago = now - (2 * 86_400 * 1_000_000);

        let entries = vec![
            sample_entry("cur1", "Old message", two_days_ago, "boot1"),
            sample_entry("cur2", "Recent message", half_day_ago, "boot1"),
            sample_entry("cur3", "New message", now, "boot1"),
        ];
        db.insert_entries("host1", &entries).unwrap();

        // Keep only entries from last 1 day (should delete the 2-day-old entry)
        let policy = RetentionPolicy {
            mode: RetentionMode::Days,
            days: Some(1),
            boots: None,
            max_mb: None,
        };

        let deleted = db.apply_retention("host1", &policy).unwrap();
        assert_eq!(deleted, 1);

        // Verify correct entry was deleted
        let stats = db.get_storage_stats("host1").unwrap();
        assert_eq!(stats.entry_count, 2);
    }

    #[test]
    fn test_boots_retention() {
        let (db, _temp_dir) = create_test_db();

        let now = now_micros();

        // Create entries from 3 different boots
        let entries = vec![
            sample_entry("cur1", "Boot 1 message", now - 3000, "boot-1"),
            sample_entry("cur2", "Boot 2 message", now - 2000, "boot-2"),
            sample_entry("cur3", "Boot 3 message", now - 1000, "boot-3"),
            sample_entry("cur4", "Boot 3 message 2", now, "boot-3"),
        ];
        db.insert_entries("host1", &entries).unwrap();

        // Keep only the last 2 boots
        let policy = RetentionPolicy {
            mode: RetentionMode::Boots,
            days: None,
            boots: Some(2),
            max_mb: None,
        };

        let deleted = db.apply_retention("host1", &policy).unwrap();
        assert_eq!(deleted, 1); // Only boot-1 entry should be deleted

        // Verify correct entries remain
        let stats = db.get_storage_stats("host1").unwrap();
        assert_eq!(stats.entry_count, 3);
    }

    #[test]
    fn test_retention_host_isolation() {
        let (db, _temp_dir) = create_test_db();

        let now = now_micros();
        let old = now - (10 * 86_400 * 1_000_000); // 10 days ago

        // Insert entries for two hosts
        let entries1 = vec![sample_entry("cur1", "Host 1 old", old, "boot1")];
        let entries2 = vec![sample_entry("cur2", "Host 2 old", old, "boot1")];

        db.insert_entries("host1", &entries1).unwrap();
        db.insert_entries("host2", &entries2).unwrap();

        // Apply retention only to host1
        let policy = RetentionPolicy {
            mode: RetentionMode::Days,
            days: Some(1),
            boots: None,
            max_mb: None,
        };

        let deleted = db.apply_retention("host1", &policy).unwrap();
        assert_eq!(deleted, 1);

        // host1 should have no entries, host2 should still have its entry
        let stats1 = db.get_storage_stats("host1").unwrap();
        let stats2 = db.get_storage_stats("host2").unwrap();
        assert_eq!(stats1.entry_count, 0);
        assert_eq!(stats2.entry_count, 1);
    }

    #[test]
    fn test_apply_retention_with_result() {
        let (db, _temp_dir) = create_test_db();

        let entries = vec![sample_entry("cur1", "Message", 1000, "boot1")];
        db.insert_entries("host1", &entries).unwrap();

        let policy = RetentionPolicy {
            mode: RetentionMode::Unlimited,
            days: None,
            boots: None,
            max_mb: None,
        };

        let result = db.apply_retention_with_result("host1", &policy);
        assert_eq!(result.host_id, "host1");
        assert_eq!(result.entries_deleted, 0);
        assert_eq!(result.mode, RetentionMode::Unlimited);
        assert!(result.error.is_none());
    }

    #[test]
    fn test_get_all_host_ids() {
        let (db, _temp_dir) = create_test_db();

        let entries1 = vec![sample_entry("cur1", "Host 1", 1000, "boot1")];
        let entries2 = vec![sample_entry("cur2", "Host 2", 2000, "boot1")];
        let entries3 = vec![sample_entry("cur3", "Host 3", 3000, "boot1")];

        db.insert_entries("host-a", &entries1).unwrap();
        db.insert_entries("host-b", &entries2).unwrap();
        db.insert_entries("host-c", &entries3).unwrap();

        let host_ids = db.get_all_host_ids().unwrap();
        assert_eq!(host_ids.len(), 3);
        assert!(host_ids.contains(&"host-a".to_string()));
        assert!(host_ids.contains(&"host-b".to_string()));
        assert!(host_ids.contains(&"host-c".to_string()));
    }

    #[test]
    fn test_get_retention_policy_from_settings() {
        let (db, _temp_dir) = create_test_db();

        // Default settings should give days-based retention
        let policy = db.get_retention_policy().unwrap();
        assert_eq!(policy.mode, RetentionMode::Days);
        assert_eq!(policy.days, Some(30));
    }

    #[test]
    fn test_apply_retention_all() {
        let (db, _temp_dir) = create_test_db();

        let now = now_micros();
        let old = now - (10 * 86_400 * 1_000_000);

        let entries1 = vec![sample_entry("cur1", "Host 1", old, "boot1")];
        let entries2 = vec![sample_entry("cur2", "Host 2", old, "boot1")];

        db.insert_entries("host1", &entries1).unwrap();
        db.insert_entries("host2", &entries2).unwrap();

        let policy = RetentionPolicy {
            mode: RetentionMode::Days,
            days: Some(1),
            boots: None,
            max_mb: None,
        };

        let results = db.apply_retention_all(&policy).unwrap();
        assert_eq!(results.len(), 2);

        // Both hosts should have their old entries deleted
        let stats1 = db.get_storage_stats("host1").unwrap();
        let stats2 = db.get_storage_stats("host2").unwrap();
        assert_eq!(stats1.entry_count, 0);
        assert_eq!(stats2.entry_count, 0);
    }
}
