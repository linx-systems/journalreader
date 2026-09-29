//! SQLite database for offline journal log storage.
//!
//! This module provides persistent storage for journal entries fetched from remote hosts,
//! enabling offline viewing and analysis of logs when the remote host is unavailable.

use crate::error::JournalError;
use crate::journal::hosts::get_app_config_dir;
use rusqlite::{Connection, OpenFlags, params};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

/// Current schema version for migration tracking
#[cfg(test)]
const SCHEMA_VERSION: i32 = 2;

/// Get the path to the offline database file
fn get_database_path() -> Result<PathBuf, JournalError> {
    Ok(get_app_config_dir()?.join("offline_logs.db"))
}

/// SQLite database for offline journal log storage
pub struct OfflineDatabase {
    pub(crate) conn: Connection,
}

impl OfflineDatabase {
    /// Initialize the writable database, creating tables and indexes as needed.
    pub fn init() -> Result<Self, JournalError> {
        let path = get_database_path()?;
        let conn = Connection::open(&path).map_err(|e| {
            JournalError::ConfigError(format!("Failed to open offline database: {}", e))
        })?;
        conn.execute_batch("PRAGMA journal_mode = WAL;").map_err(|e| {
            JournalError::ConfigError(format!("Failed to enable WAL for offline database: {}", e))
        })?;

        let db = Self { conn };
        db.run_migrations()?;

        Ok(db)
    }

    /// Open an existing database without applying migrations or permitting writes.
    pub fn open_read_only(path: &Path) -> Result<Self, JournalError> {
        let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(
            |e| JournalError::ConfigError(format!("Failed to open offline database read-only: {}", e)),
        )?;

        Ok(Self { conn })
    }

    /// Create from an existing connection (primarily for testing)
    #[cfg(test)]
    pub(crate) fn from_connection(conn: Connection) -> Self {
        Self { conn }
    }

    /// Run database migrations to create or update schema.
    pub(crate) fn run_migrations(&self) -> Result<(), JournalError> {
        let current_version = self.get_schema_version()?;

        if current_version < 1 {
            self.migrate_v1()?;
        }
        if current_version < 2 {
            self.migrate_v2()?;
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

    /// Migration to schema version 1: initial schema.
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

        // This migration must continue to record its own schema version so
        // newly-created databases still run the v2 index replacement.
        self.set_schema_version(1)?;

        Ok(())
    }

    /// Migration to schema version 2: replace timestamp-only paging index.
    fn migrate_v2(&self) -> Result<(), JournalError> {
        let tx = self.conn.unchecked_transaction().map_err(|e| {
            JournalError::ConfigError(format!("Failed to start v2 migration transaction: {}", e))
        })?;

        tx.execute_batch(
            r#"
            DROP INDEX IF EXISTS idx_host_time;
            CREATE INDEX IF NOT EXISTS idx_host_time_cursor
                ON journal_entries(host_id, realtime_timestamp DESC, cursor DESC);
            INSERT OR REPLACE INTO offline_settings (key, value)
                VALUES ('schema_version', '2');
            "#,
        )
        .map_err(|e| JournalError::ConfigError(format!("Failed to apply v2 migration: {}", e)))?;

        tx.commit().map_err(|e| {
            JournalError::ConfigError(format!("Failed to commit v2 migration: {}", e))
        })
    }


    /// Verify the database schema is correct
    #[cfg(test)]
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
            "idx_host_time_cursor",
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

        let obsolete_index_exists: bool = db
            .conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='index' AND name='idx_host_time'",
                [],
                |row| row.get(0),
            )
            .expect("Query failed");
        assert!(!obsolete_index_exists, "obsolete timestamp-only index should be removed");
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

    #[test]
    fn test_v1_to_v2_migration_preserves_rows_and_fts_schema() {
        let temp_dir = tempdir().expect("Failed to create temp dir");
        let path = temp_dir.path().join("offline.db");
        let db = OfflineDatabase {
            conn: Connection::open(&path).expect("Failed to open test database"),
        };
        db.migrate_v1().expect("Failed to create v1 schema");
        assert_eq!(db.get_schema_version().unwrap(), 1);
        db.conn
            .execute(
                "INSERT INTO journal_entries \
                 (host_id, cursor, realtime_timestamp, boot_id, message, priority, synced_at) \
                 VALUES ('host', 'cursor', 100, 'boot', 'preserved', 6, 100)",
                [],
            )
            .expect("Failed to insert v1 row");

        db.run_migrations().expect("Failed to migrate to v2");

        assert_eq!(db.get_schema_version().unwrap(), 2);
        let message: String = db
            .conn
            .query_row(
                "SELECT message FROM journal_entries WHERE host_id = 'host' AND cursor = 'cursor'",
                [],
                |row| row.get(0),
            )
            .expect("Migrated row should remain");
        assert_eq!(message, "preserved");
        let indexed: bool = db
            .conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master \
                 WHERE type = 'index' AND name = 'idx_host_time_cursor')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(indexed);
    }
}
