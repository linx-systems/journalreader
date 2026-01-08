//! Retention policy enforcement for offline journal storage.
//!
//! This module implements automatic cleanup of journal entries
//! based on boot count - keeps only the last N boots per host.

use crate::error::JournalError;
use crate::journal::offline_db::OfflineDatabase;
use crate::journal::offline_types::{RetentionPolicy, RetentionResult};
use rusqlite::params;

impl OfflineDatabase {
    /// Apply retention policy for a specific host.
    ///
    /// Keeps only the last N boots per host, deleting entries from older boots.
    ///
    /// # Arguments
    /// * `host_id` - The host ID to apply retention to
    /// * `policy` - The retention policy (number of boots to keep)
    ///
    /// # Returns
    /// The number of entries deleted, or an error.
    pub fn apply_retention(
        &self,
        host_id: &str,
        policy: &RetentionPolicy,
    ) -> Result<u64, JournalError> {
        self.keep_last_n_boots(host_id, policy.boots)
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
                boots_kept: policy.boots,
                error: None,
            },
            Err(e) => RetentionResult {
                host_id: host_id.to_string(),
                entries_deleted: 0,
                boots_kept: policy.boots,
                error: Some(e.to_string()),
            },
        }
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

    /// Apply retention to all hosts using a single policy.
    pub fn apply_retention_all(
        &self,
        policy: &RetentionPolicy,
    ) -> Result<Vec<RetentionResult>, JournalError> {
        let host_ids = self.get_all_host_ids()?;
        let mut results = Vec::new();

        for host_id in host_ids {
            let result = self.apply_retention_with_result(&host_id, policy);
            results.push(result);
        }

        Ok(results)
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
    /// Converts OfflineSettings sync_boots into a RetentionPolicy.
    pub fn get_retention_policy(&self) -> Result<RetentionPolicy, JournalError> {
        let settings = self.get_offline_settings()?;
        Ok(RetentionPolicy {
            boots: settings.sync_boots,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::journal::types::JournalEntry;
    use rusqlite::Connection;
    use std::time::{SystemTime, UNIX_EPOCH};
    use tempfile::tempdir;

    /// Get current timestamp in microseconds
    fn now_micros() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_micros() as i64
    }

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
        let policy = RetentionPolicy { boots: 2 };

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

        // Insert entries for two hosts with different boots
        let entries1 = vec![
            sample_entry("cur1", "Host 1 boot1", now - 3000, "boot1"),
            sample_entry("cur2", "Host 1 boot2", now - 2000, "boot2"),
            sample_entry("cur3", "Host 1 boot3", now - 1000, "boot3"),
        ];
        let entries2 = vec![
            sample_entry("cur4", "Host 2 boot1", now - 3000, "boot1"),
            sample_entry("cur5", "Host 2 boot2", now - 2000, "boot2"),
        ];

        db.insert_entries("host1", &entries1).unwrap();
        db.insert_entries("host2", &entries2).unwrap();

        // Apply retention only to host1, keep 2 boots
        let policy = RetentionPolicy { boots: 2 };

        let deleted = db.apply_retention("host1", &policy).unwrap();
        assert_eq!(deleted, 1); // boot1 entry from host1

        // host1 should have 2 entries, host2 should still have 2
        let stats1 = db.get_storage_stats("host1").unwrap();
        let stats2 = db.get_storage_stats("host2").unwrap();
        assert_eq!(stats1.entry_count, 2);
        assert_eq!(stats2.entry_count, 2);
    }

    #[test]
    fn test_apply_retention_with_result() {
        let (db, _temp_dir) = create_test_db();

        let now = now_micros();
        let entries = vec![
            sample_entry("cur1", "Message", now, "boot1"),
            sample_entry("cur2", "Message 2", now - 1000, "boot2"),
        ];
        db.insert_entries("host1", &entries).unwrap();

        let policy = RetentionPolicy { boots: 5 };

        let result = db.apply_retention_with_result("host1", &policy);
        assert_eq!(result.host_id, "host1");
        assert_eq!(result.entries_deleted, 0); // Only 2 boots, keeping 5
        assert_eq!(result.boots_kept, 5);
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

        // Default settings should give 5 boots
        let policy = db.get_retention_policy().unwrap();
        assert_eq!(policy.boots, 5);
    }

    #[test]
    fn test_apply_retention_all() {
        let (db, _temp_dir) = create_test_db();

        let now = now_micros();

        // Create entries for two hosts with 3 boots each
        let entries1 = vec![
            sample_entry("cur1", "Host 1 boot1", now - 3000, "boot1"),
            sample_entry("cur2", "Host 1 boot2", now - 2000, "boot2"),
            sample_entry("cur3", "Host 1 boot3", now - 1000, "boot3"),
        ];
        let entries2 = vec![
            sample_entry("cur4", "Host 2 boot1", now - 3000, "boot1"),
            sample_entry("cur5", "Host 2 boot2", now - 2000, "boot2"),
            sample_entry("cur6", "Host 2 boot3", now - 1000, "boot3"),
        ];

        db.insert_entries("host1", &entries1).unwrap();
        db.insert_entries("host2", &entries2).unwrap();

        let policy = RetentionPolicy { boots: 2 };

        let results = db.apply_retention_all(&policy).unwrap();
        assert_eq!(results.len(), 2);

        // Both hosts should have 2 entries (oldest boot deleted)
        let stats1 = db.get_storage_stats("host1").unwrap();
        let stats2 = db.get_storage_stats("host2").unwrap();
        assert_eq!(stats1.entry_count, 2);
        assert_eq!(stats2.entry_count, 2);
    }
}
