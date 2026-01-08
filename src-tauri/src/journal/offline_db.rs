//! SQLite database for offline journal log storage.
//!
//! This module provides persistent storage for journal entries fetched from remote hosts,
//! enabling offline viewing and analysis of logs when the remote host is unavailable.

use crate::error::JournalError;
use crate::journal::hosts::get_app_config_dir;
use rusqlite::{Connection, params};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// Current schema version for migration tracking
const SCHEMA_VERSION: i32 = 1;

/// Get the path to the offline database file
fn get_database_path() -> Result<PathBuf, JournalError> {
    Ok(get_app_config_dir()?.join("offline_logs.db"))
}

/// SQLite database for offline journal log storage
pub struct OfflineDatabase {
    conn: Connection,
}

impl OfflineDatabase {
    /// Initialize the database, creating tables if they don't exist
    pub fn init() -> Result<Self, JournalError> {
        let path = get_database_path()?;
        let conn = Connection::open(&path).map_err(|e| {
            JournalError::ConfigError(format!("Failed to open offline database: {}", e))
        })?;

        let db = Self { conn };
        db.run_migrations()?;

        Ok(db)
    }

    /// Run database migrations to create or update schema
    fn run_migrations(&self) -> Result<(), JournalError> {
        let current_version = self.get_schema_version()?;

        if current_version < 1 {
            self.migrate_v1()?;
        }

        Ok(())
    }

    /// Get current schema version (0 if not set)
    fn get_schema_version(&self) -> Result<i32, JournalError> {
        // Check if offline_settings table exists
        let table_exists: bool = self
            .conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='offline_settings'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| JournalError::ConfigError(format!("Failed to check schema: {}", e)))?;

        if !table_exists {
            return Ok(0);
        }

        // Get schema version from settings
        let version: Result<i32, _> = self.conn.query_row(
            "SELECT CAST(value AS INTEGER) FROM offline_settings WHERE key = 'schema_version'",
            [],
            |row| row.get(0),
        );

        match version {
            Ok(v) => Ok(v),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(0),
            Err(e) => Err(JournalError::ConfigError(format!(
                "Failed to get schema version: {}",
                e
            ))),
        }
    }

    /// Set schema version in settings
    fn set_schema_version(&self, version: i32) -> Result<(), JournalError> {
        self.conn
            .execute(
                "INSERT OR REPLACE INTO offline_settings (key, value) VALUES ('schema_version', ?)",
                params![version.to_string()],
            )
            .map_err(|e| {
                JournalError::ConfigError(format!("Failed to set schema version: {}", e))
            })?;
        Ok(())
    }

    /// Migration to schema version 1: Initial schema
    fn migrate_v1(&self) -> Result<(), JournalError> {
        // Create journal entries table
        self.conn
            .execute(
                r#"
                CREATE TABLE IF NOT EXISTS journal_entries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    host_id TEXT NOT NULL,
                    cursor TEXT NOT NULL,
                    realtime_timestamp INTEGER NOT NULL,
                    monotonic_timestamp INTEGER,
                    boot_id TEXT NOT NULL,
                    message TEXT NOT NULL,
                    priority INTEGER NOT NULL DEFAULT 6,
                    syslog_identifier TEXT,
                    systemd_unit TEXT,
                    pid INTEGER,
                    uid INTEGER,
                    gid INTEGER,
                    exe TEXT,
                    cmdline TEXT,
                    hostname TEXT,
                    comm TEXT,
                    synced_at INTEGER NOT NULL,
                    UNIQUE(host_id, cursor)
                )
                "#,
                [],
            )
            .map_err(|e| {
                JournalError::ConfigError(format!("Failed to create journal_entries table: {}", e))
            })?;

        // Create indexes for common query patterns
        self.conn
            .execute(
                "CREATE INDEX IF NOT EXISTS idx_host_time ON journal_entries(host_id, realtime_timestamp DESC)",
                [],
            )
            .map_err(|e| {
                JournalError::ConfigError(format!("Failed to create idx_host_time index: {}", e))
            })?;

        self.conn
            .execute(
                "CREATE INDEX IF NOT EXISTS idx_host_unit ON journal_entries(host_id, systemd_unit)",
                [],
            )
            .map_err(|e| {
                JournalError::ConfigError(format!("Failed to create idx_host_unit index: {}", e))
            })?;

        self.conn
            .execute(
                "CREATE INDEX IF NOT EXISTS idx_host_priority ON journal_entries(host_id, priority)",
                [],
            )
            .map_err(|e| {
                JournalError::ConfigError(format!(
                    "Failed to create idx_host_priority index: {}",
                    e
                ))
            })?;

        self.conn
            .execute(
                "CREATE INDEX IF NOT EXISTS idx_host_boot ON journal_entries(host_id, boot_id)",
                [],
            )
            .map_err(|e| {
                JournalError::ConfigError(format!("Failed to create idx_host_boot index: {}", e))
            })?;

        // Create FTS5 virtual table for full-text search
        self.conn
            .execute(
                r#"
                CREATE VIRTUAL TABLE IF NOT EXISTS journal_entries_fts USING fts5(
                    message,
                    content='journal_entries',
                    content_rowid='id'
                )
                "#,
                [],
            )
            .map_err(|e| {
                JournalError::ConfigError(format!("Failed to create FTS5 table: {}", e))
            })?;

        // Create triggers to keep FTS index in sync
        self.conn
            .execute(
                r#"
                CREATE TRIGGER IF NOT EXISTS journal_entries_ai AFTER INSERT ON journal_entries BEGIN
                    INSERT INTO journal_entries_fts(rowid, message) VALUES (new.id, new.message);
                END
                "#,
                [],
            )
            .map_err(|e| {
                JournalError::ConfigError(format!("Failed to create FTS insert trigger: {}", e))
            })?;

        self.conn
            .execute(
                r#"
                CREATE TRIGGER IF NOT EXISTS journal_entries_ad AFTER DELETE ON journal_entries BEGIN
                    INSERT INTO journal_entries_fts(journal_entries_fts, rowid, message) VALUES('delete', old.id, old.message);
                END
                "#,
                [],
            )
            .map_err(|e| {
                JournalError::ConfigError(format!("Failed to create FTS delete trigger: {}", e))
            })?;

        self.conn
            .execute(
                r#"
                CREATE TRIGGER IF NOT EXISTS journal_entries_au AFTER UPDATE ON journal_entries BEGIN
                    INSERT INTO journal_entries_fts(journal_entries_fts, rowid, message) VALUES('delete', old.id, old.message);
                    INSERT INTO journal_entries_fts(rowid, message) VALUES (new.id, new.message);
                END
                "#,
                [],
            )
            .map_err(|e| {
                JournalError::ConfigError(format!("Failed to create FTS update trigger: {}", e))
            })?;

        // Create sync state table
        self.conn
            .execute(
                r#"
                CREATE TABLE IF NOT EXISTS sync_state (
                    host_id TEXT PRIMARY KEY,
                    last_sync_timestamp INTEGER DEFAULT 0,
                    last_cursor TEXT,
                    sync_status TEXT DEFAULT 'never',
                    sync_error TEXT,
                    entries_synced INTEGER DEFAULT 0
                )
                "#,
                [],
            )
            .map_err(|e| {
                JournalError::ConfigError(format!("Failed to create sync_state table: {}", e))
            })?;

        // Create offline settings table
        self.conn
            .execute(
                r#"
                CREATE TABLE IF NOT EXISTS offline_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
                "#,
                [],
            )
            .map_err(|e| {
                JournalError::ConfigError(format!("Failed to create offline_settings table: {}", e))
            })?;

        // Set schema version
        self.set_schema_version(SCHEMA_VERSION)?;

        Ok(())
    }

    /// Get a reference to the database connection
    pub fn connection(&self) -> &Connection {
        &self.conn
    }

    /// Verify the database schema is correct
    pub fn verify_schema(&self) -> Result<bool, JournalError> {
        // Check that all required tables exist
        let tables = ["journal_entries", "sync_state", "offline_settings"];

        for table in tables {
            let exists: bool = self
                .conn
                .query_row(
                    "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name=?",
                    params![table],
                    |row| row.get(0),
                )
                .map_err(|e| {
                    JournalError::ConfigError(format!("Failed to verify table {}: {}", table, e))
                })?;

            if !exists {
                return Ok(false);
            }
        }

        // Check FTS table exists
        let fts_exists: bool = self
            .conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='journal_entries_fts'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| {
                JournalError::ConfigError(format!("Failed to verify FTS table: {}", e))
            })?;

        if !fts_exists {
            return Ok(false);
        }

        // Check schema version
        let version = self.get_schema_version()?;
        Ok(version == SCHEMA_VERSION)
    }

    /// Get the database file path
    pub fn path() -> Result<PathBuf, JournalError> {
        get_database_path()
    }
}

/// Thread-safe wrapper for offline database
pub type SharedOfflineDatabase = Arc<Mutex<OfflineDatabase>>;

/// Create a new shared offline database instance
pub fn new_shared_offline_database() -> Result<SharedOfflineDatabase, JournalError> {
    let db = OfflineDatabase::init()?;
    Ok(Arc::new(Mutex::new(db)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    /// Helper to create a test database in a temporary directory
    fn create_test_db() -> (OfflineDatabase, tempfile::TempDir) {
        let temp_dir = tempdir().expect("Failed to create temp dir");
        let db_path = temp_dir.path().join("test_offline.db");

        let conn = Connection::open(&db_path).expect("Failed to open test database");
        let db = OfflineDatabase { conn };
        db.run_migrations().expect("Failed to run migrations");

        (db, temp_dir)
    }

    #[test]
    fn test_database_initialization() {
        let (db, _temp_dir) = create_test_db();
        assert!(db.verify_schema().expect("Failed to verify schema"));
    }

    #[test]
    fn test_schema_version() {
        let (db, _temp_dir) = create_test_db();
        let version = db.get_schema_version().expect("Failed to get schema version");
        assert_eq!(version, SCHEMA_VERSION);
    }

    #[test]
    fn test_tables_created() {
        let (db, _temp_dir) = create_test_db();

        // Verify journal_entries table
        let journal_exists: bool = db
            .conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='journal_entries'",
                [],
                |row| row.get(0),
            )
            .expect("Query failed");
        assert!(journal_exists, "journal_entries table should exist");

        // Verify sync_state table
        let sync_exists: bool = db
            .conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='sync_state'",
                [],
                |row| row.get(0),
            )
            .expect("Query failed");
        assert!(sync_exists, "sync_state table should exist");

        // Verify offline_settings table
        let settings_exists: bool = db
            .conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='offline_settings'",
                [],
                |row| row.get(0),
            )
            .expect("Query failed");
        assert!(settings_exists, "offline_settings table should exist");

        // Verify FTS table
        let fts_exists: bool = db
            .conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='journal_entries_fts'",
                [],
                |row| row.get(0),
            )
            .expect("Query failed");
        assert!(fts_exists, "journal_entries_fts table should exist");
    }

    #[test]
    fn test_indexes_created() {
        let (db, _temp_dir) = create_test_db();

        let indexes = [
            "idx_host_time",
            "idx_host_unit",
            "idx_host_priority",
            "idx_host_boot",
        ];

        for index in indexes {
            let exists: bool = db
                .conn
                .query_row(
                    "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='index' AND name=?",
                    params![index],
                    |row| row.get(0),
                )
                .expect("Query failed");
            assert!(exists, "Index {} should exist", index);
        }
    }

    #[test]
    fn test_journal_entries_schema() {
        let (db, _temp_dir) = create_test_db();

        // Insert a test entry to verify schema
        let result = db.conn.execute(
            r#"
            INSERT INTO journal_entries (
                host_id, cursor, realtime_timestamp, monotonic_timestamp, boot_id,
                message, priority, syslog_identifier, systemd_unit, pid, uid, gid,
                exe, cmdline, hostname, comm, synced_at
            ) VALUES (
                'test-host', 'test-cursor', 1234567890, 1000, 'boot-123',
                'Test message', 6, 'test', 'test.service', 1234, 1000, 1000,
                '/usr/bin/test', '/usr/bin/test arg1', 'localhost', 'test', 1234567890
            )
            "#,
            [],
        );

        assert!(result.is_ok(), "Insert should succeed: {:?}", result.err());

        // Verify uniqueness constraint
        let dup_result = db.conn.execute(
            r#"
            INSERT INTO journal_entries (
                host_id, cursor, realtime_timestamp, boot_id, message, priority, synced_at
            ) VALUES (
                'test-host', 'test-cursor', 1234567890, 'boot-123', 'Duplicate', 6, 1234567890
            )
            "#,
            [],
        );

        assert!(
            dup_result.is_err(),
            "Duplicate (host_id, cursor) should fail"
        );
    }

    #[test]
    fn test_sync_state_schema() {
        let (db, _temp_dir) = create_test_db();

        // Insert a sync state entry
        let result = db.conn.execute(
            r#"
            INSERT INTO sync_state (host_id, last_sync_timestamp, last_cursor, sync_status, entries_synced)
            VALUES ('test-host', 1234567890, 'cursor-123', 'completed', 100)
            "#,
            [],
        );

        assert!(result.is_ok(), "Insert should succeed");

        // Verify upsert behavior (primary key constraint)
        let upsert_result = db.conn.execute(
            r#"
            INSERT OR REPLACE INTO sync_state (host_id, last_sync_timestamp, sync_status)
            VALUES ('test-host', 1234567891, 'in_progress')
            "#,
            [],
        );

        assert!(upsert_result.is_ok(), "Upsert should succeed");
    }

    #[test]
    fn test_fts_search() {
        let (db, _temp_dir) = create_test_db();

        // Insert entries with different messages
        db.conn
            .execute(
                r#"
            INSERT INTO journal_entries (
                host_id, cursor, realtime_timestamp, boot_id, message, priority, synced_at
            ) VALUES ('host1', 'cur1', 1000, 'boot1', 'Error in systemd service', 3, 1000)
            "#,
                [],
            )
            .expect("Insert failed");

        db.conn
            .execute(
                r#"
            INSERT INTO journal_entries (
                host_id, cursor, realtime_timestamp, boot_id, message, priority, synced_at
            ) VALUES ('host1', 'cur2', 1001, 'boot1', 'Service started successfully', 6, 1001)
            "#,
                [],
            )
            .expect("Insert failed");

        // Search for 'error' using FTS
        let count: i32 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM journal_entries_fts WHERE message MATCH 'error'",
                [],
                |row| row.get(0),
            )
            .expect("FTS query failed");

        assert_eq!(count, 1, "Should find 1 entry with 'error'");

        // Search for 'service' using FTS
        let count: i32 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM journal_entries_fts WHERE message MATCH 'service'",
                [],
                |row| row.get(0),
            )
            .expect("FTS query failed");

        assert_eq!(count, 2, "Should find 2 entries with 'service'");
    }

    #[test]
    fn test_migration_idempotency() {
        let (db, _temp_dir) = create_test_db();

        // Run migrations again - should be idempotent
        let result = db.run_migrations();
        assert!(
            result.is_ok(),
            "Running migrations twice should succeed: {:?}",
            result.err()
        );

        // Schema should still be valid
        assert!(db.verify_schema().expect("Verify failed"));
    }
}
