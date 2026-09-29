//! CRUD operations for offline journal entry storage.
//!
//! This module provides functions to insert, query, and delete journal entries
//! from the offline SQLite database.

use crate::error::JournalError;
use crate::journal::offline_db::OfflineDatabase;
use crate::journal::offline_types::{OfflineSettings, StorageStats, SyncState, SyncStatus};
use crate::journal::types::{JournalEntry, JournalFilter, JournalQueryResult};
use rusqlite::{params, Row, ToSql};
use std::time::{SystemTime, UNIX_EPOCH};

/// Get current timestamp in milliseconds
fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

impl OfflineDatabase {
    /// Insert multiple journal entries for a host.
    /// Uses ON CONFLICT IGNORE to skip duplicates based on (host_id, cursor).
    /// Returns the number of entries actually inserted.
    #[cfg(test)]
    pub fn insert_entries(
        &self,
        host_id: &str,
        entries: &[JournalEntry],
    ) -> Result<usize, JournalError> {
        if entries.is_empty() {
            return Ok(0);
        }

        let synced_at = now_millis();
        let mut inserted = 0;

        let tx = self.conn.unchecked_transaction().map_err(|e| {
            JournalError::ConfigError(format!("Failed to start transaction: {}", e))
        })?;

        {
            let mut stmt = tx
                .prepare_cached(
                    r#"
                    INSERT OR IGNORE INTO journal_entries (
                        host_id, cursor, realtime_timestamp, monotonic_timestamp, boot_id,
                        message, priority, syslog_identifier, systemd_unit, pid, uid, gid,
                        exe, cmdline, hostname, comm, synced_at
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
                    "#,
                )
                .map_err(|e| {
                    JournalError::ConfigError(format!("Failed to prepare insert statement: {}", e))
                })?;

            for entry in entries {
                let changes = stmt
                    .execute(params![
                        host_id,
                        entry.cursor,
                        entry.realtime_timestamp,
                        entry.monotonic_timestamp,
                        entry.boot_id,
                        entry.message,
                        entry.priority as i32,
                        entry.syslog_identifier,
                        entry.systemd_unit,
                        entry.pid.map(|p| p as i64),
                        entry.uid.map(|u| u as i64),
                        entry.gid.map(|g| g as i64),
                        entry.exe,
                        entry.cmdline,
                        entry.hostname,
                        entry.comm,
                        synced_at,
                    ])
                    .map_err(|e| {
                        JournalError::ConfigError(format!("Failed to insert entry: {}", e))
                    })?;
                inserted += changes;
            }
        }

        tx.commit().map_err(|e| {
            JournalError::ConfigError(format!("Failed to commit transaction: {}", e))
        })?;

        Ok(inserted)
    }

    /// Insert a sync batch and advance its checkpoint atomically.
    ///
    /// The caller's state is changed only after the transaction commits, so a
    /// failed checkpoint write cannot leave entries ahead of the saved cursor.
    pub fn insert_sync_batch(
        &self,
        host_id: &str,
        entries: &[JournalEntry],
        state: &mut SyncState,
    ) -> Result<usize, JournalError> {
        if entries.is_empty() {
            return Ok(0);
        }

        let synced_at = now_millis();
        let tx = self.conn.unchecked_transaction().map_err(|e| {
            JournalError::ConfigError(format!("Failed to start sync batch transaction: {}", e))
        })?;

        let inserted = {
            let mut stmt = tx
                .prepare_cached(
                    r#"
                    INSERT OR IGNORE INTO journal_entries (
                        host_id, cursor, realtime_timestamp, monotonic_timestamp, boot_id,
                        message, priority, syslog_identifier, systemd_unit, pid, uid, gid,
                        exe, cmdline, hostname, comm, synced_at
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
                    "#,
                )
                .map_err(|e| {
                    JournalError::ConfigError(format!("Failed to prepare sync batch insert: {}", e))
                })?;

            let mut inserted = 0;
            for entry in entries {
                inserted += stmt
                    .execute(params![
                        host_id,
                        entry.cursor,
                        entry.realtime_timestamp,
                        entry.monotonic_timestamp,
                        entry.boot_id,
                        entry.message,
                        entry.priority as i32,
                        entry.syslog_identifier,
                        entry.systemd_unit,
                        entry.pid.map(|p| p as i64),
                        entry.uid.map(|u| u as i64),
                        entry.gid.map(|g| g as i64),
                        entry.exe,
                        entry.cmdline,
                        entry.hostname,
                        entry.comm,
                        synced_at,
                    ])
                    .map_err(|e| {
                        JournalError::ConfigError(format!("Failed to insert sync batch entry: {}", e))
                    })?;
            }
            inserted
        };

        let mut updated_state = state.clone();
        updated_state.host_id = host_id.to_string();
        updated_state.last_cursor = entries.last().map(|entry| entry.cursor.clone());
        updated_state.last_sync_timestamp = synced_at;
        updated_state.entries_synced += inserted as i64;
        tx.execute(
            r#"
            INSERT OR REPLACE INTO sync_state
                (host_id, last_sync_timestamp, last_cursor, sync_status, sync_error, entries_synced)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            "#,
            params![
                updated_state.host_id,
                updated_state.last_sync_timestamp,
                updated_state.last_cursor,
                updated_state.sync_status.as_str(),
                updated_state.sync_error,
                updated_state.entries_synced,
            ],
        )
        .map_err(|e| JournalError::ConfigError(format!("Failed to update sync checkpoint: {}", e)))?;

        tx.commit().map_err(|e| {
            JournalError::ConfigError(format!("Failed to commit sync batch transaction: {}", e))
        })?;
        *state = updated_state;

        Ok(inserted)
    }

    /// Query one deterministic page of journal entries for a host.
    pub fn query_page(
        &self,
        host_id: &str,
        filter: &JournalFilter,
    ) -> Result<JournalQueryResult, JournalError> {
        if let Some(cursor) = filter.after_cursor.as_deref() {
            self.ensure_page_cursor_exists(host_id, cursor)?;
        }

        let page_limit = if filter.limit == 0 {
            500
        } else {
            filter.limit.min(10_000)
        };
        let (sql, params) = self.build_query_sql(host_id, filter, QueryKind::Page { page_limit })?;

        let mut stmt = self.conn.prepare(&sql).map_err(|e| {
            JournalError::ConfigError(format!("Failed to prepare page query: {}", e))
        })?;
        let param_refs: Vec<&dyn ToSql> = params.iter().map(|param| param.as_ref()).collect();
        let rows = stmt
            .query_map(param_refs.as_slice(), entry_from_row)
            .map_err(|e| JournalError::ConfigError(format!("Page query failed: {}", e)))?;

        let mut entries = Vec::with_capacity(page_limit.saturating_add(1) as usize);
        for row in rows {
            entries.push(
                row.map_err(|e| JournalError::ConfigError(format!("Failed to read row: {}", e)))?,
            );
        }

        let has_more = entries.len() > page_limit as usize;
        entries.truncate(page_limit as usize);
        let cursor_start = entries.first().map(|entry| entry.cursor.clone());
        let cursor_end = entries.last().map(|entry| entry.cursor.clone());

        Ok(JournalQueryResult {
            entries,
            has_more,
            cursor_start,
            cursor_end,
        })
    }

    fn ensure_page_cursor_exists(&self, host_id: &str, cursor: &str) -> Result<(), JournalError> {
        let exists: bool = self
            .conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM journal_entries WHERE host_id = ? AND cursor = ?)",
                params![host_id, cursor],
                |row| row.get(0),
            )
            .map_err(|error| {
                JournalError::ConfigError(format!("Failed to resolve cached page cursor: {error}"))
            })?;

        if exists {
            Ok(())
        } else {
            Err(JournalError::ExecutionError(
                "Cached page cursor expired; refresh logs.".into(),
            ))
        }
    }

    /// Visit every matching entry in chronological order without buffering the result set.
    ///
    /// Paging controls are intentionally ignored so callers such as exports receive the
    /// complete filtered snapshot.
    pub fn visit_entries<F>(
        &self,
        host_id: &str,
        filter: &JournalFilter,
        mut emit: F,
    ) -> Result<u64, JournalError>
    where
        F: FnMut(&JournalEntry) -> Result<(), JournalError>,
    {
        let (sql, params) = self.build_query_sql(host_id, filter, QueryKind::Visitor)?;
        let mut stmt = self.conn.prepare(&sql).map_err(|e| {
            JournalError::ConfigError(format!("Failed to prepare streaming query: {}", e))
        })?;
        let param_refs: Vec<&dyn ToSql> = params.iter().map(|param| param.as_ref()).collect();
        let mut rows = stmt
            .query(param_refs.as_slice())
            .map_err(|e| JournalError::ConfigError(format!("Streaming query failed: {}", e)))?;

        let mut visited = 0;
        while let Some(row) = rows
            .next()
            .map_err(|e| JournalError::ConfigError(format!("Failed to read row: {}", e)))?
        {
            let entry = entry_from_row(row)
                .map_err(|e| JournalError::ConfigError(format!("Failed to decode row: {}", e)))?;
            emit(&entry)?;
            visited += 1;
        }

        Ok(visited)
    }

    /// Count entries matching the filter criteria.
    pub fn count_entries(&self, host_id: &str, filter: &JournalFilter) -> Result<i64, JournalError> {
        let (sql, params) = self.build_query_sql(host_id, filter, QueryKind::Count)?;

        let params_refs: Vec<&dyn ToSql> = params.iter().map(|p| p.as_ref()).collect();

        let count: i64 = self
            .conn
            .query_row(&sql, params_refs.as_slice(), |row: &Row| row.get(0))
            .map_err(|e| JournalError::ConfigError(format!("Count query failed: {}", e)))?;

        Ok(count)
    }

    /// Delete entries older than a given timestamp for a host.
    /// Returns the number of entries deleted.
    #[cfg(test)]
    pub fn delete_entries_before(
        &self,
        host_id: &str,
        timestamp: i64,
    ) -> Result<usize, JournalError> {
        let deleted = self
            .conn
            .execute(
                "DELETE FROM journal_entries WHERE host_id = ? AND realtime_timestamp < ?",
                params![host_id, timestamp],
            )
            .map_err(|e| JournalError::ConfigError(format!("Delete failed: {}", e)))?;

        Ok(deleted)
    }

    /// Delete all entries for a host.
    /// Returns the number of entries deleted.
    pub fn delete_all_entries(&self, host_id: &str) -> Result<usize, JournalError> {
        let deleted = self
            .conn
            .execute(
                "DELETE FROM journal_entries WHERE host_id = ?",
                params![host_id],
            )
            .map_err(|e| JournalError::ConfigError(format!("Delete failed: {}", e)))?;

        Ok(deleted)
    }

    /// Get storage statistics for a host.
    pub fn get_storage_stats(&self, host_id: &str) -> Result<StorageStats, JournalError> {
        let (entry_count, oldest, newest): (i64, Option<i64>, Option<i64>) = self
            .conn
            .query_row(
                r#"
                SELECT
                    COUNT(*),
                    MIN(realtime_timestamp),
                    MAX(realtime_timestamp)
                FROM journal_entries
                WHERE host_id = ?
                "#,
                params![host_id],
                |row: &Row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|e| JournalError::ConfigError(format!("Stats query failed: {}", e)))?;

        // Get database file size
        let db_path = OfflineDatabase::path()?;
        let db_size_bytes = std::fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);

        Ok(StorageStats {
            host_id: host_id.to_string(),
            entry_count,
            oldest_timestamp: oldest,
            newest_timestamp: newest,
            db_size_bytes,
        })
    }

    /// Get sync state for a host.
    pub fn get_sync_state(&self, host_id: &str) -> Result<SyncState, JournalError> {
        let result = self.conn.query_row(
            r#"
            SELECT host_id, last_sync_timestamp, last_cursor, sync_status, sync_error, entries_synced
            FROM sync_state
            WHERE host_id = ?
            "#,
            params![host_id],
            |row: &Row| {
                let status_str: String = row.get(3)?;
                Ok(SyncState {
                    host_id: row.get(0)?,
                    last_sync_timestamp: row.get(1)?,
                    last_cursor: row.get(2)?,
                    sync_status: SyncStatus::from(status_str.as_str()),
                    sync_error: row.get(4)?,
                    entries_synced: row.get(5)?,
                })
            },
        );

        match result {
            Ok(state) => Ok(state),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(SyncState {
                host_id: host_id.to_string(),
                ..Default::default()
            }),
            Err(e) => Err(JournalError::ConfigError(format!(
                "Failed to get sync state: {}",
                e
            ))),
        }
    }

    /// Update sync state for a host.
    pub fn update_sync_state(&self, state: &SyncState) -> Result<(), JournalError> {
        self.conn
            .execute(
                r#"
                INSERT OR REPLACE INTO sync_state
                    (host_id, last_sync_timestamp, last_cursor, sync_status, sync_error, entries_synced)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                "#,
                params![
                    state.host_id,
                    state.last_sync_timestamp,
                    state.last_cursor,
                    state.sync_status.as_str(),
                    state.sync_error,
                    state.entries_synced,
                ],
            )
            .map_err(|e| JournalError::ConfigError(format!("Failed to update sync state: {}", e)))?;

        Ok(())
    }

    /// Get sync states for all hosts.
    pub fn get_all_sync_states(&self) -> Result<Vec<SyncState>, JournalError> {
        let mut stmt = self
            .conn
            .prepare(
                r#"
                SELECT host_id, last_sync_timestamp, last_cursor, sync_status, sync_error, entries_synced
                FROM sync_state
                ORDER BY host_id
                "#,
            )
            .map_err(|e| JournalError::ConfigError(format!("Failed to prepare query: {}", e)))?;

        let rows = stmt
            .query_map([], |row: &Row| {
                let status_str: String = row.get(3)?;
                Ok(SyncState {
                    host_id: row.get(0)?,
                    last_sync_timestamp: row.get(1)?,
                    last_cursor: row.get(2)?,
                    sync_status: SyncStatus::from(status_str.as_str()),
                    sync_error: row.get(4)?,
                    entries_synced: row.get(5)?,
                })
            })
            .map_err(|e| JournalError::ConfigError(format!("Query failed: {}", e)))?;

        let mut states = Vec::new();
        for row_result in rows {
            states.push(
                row_result.map_err(|e| JournalError::ConfigError(format!("Failed to read row: {}", e)))?,
            );
        }

        Ok(states)
    }

    /// Get storage statistics for all hosts.
    pub fn get_all_storage_stats(&self) -> Result<Vec<StorageStats>, JournalError> {
        let mut stmt = self
            .conn
            .prepare(
                r#"
                SELECT
                    host_id,
                    COUNT(*) as entry_count,
                    MIN(realtime_timestamp) as oldest,
                    MAX(realtime_timestamp) as newest
                FROM journal_entries
                GROUP BY host_id
                ORDER BY host_id
                "#,
            )
            .map_err(|e| JournalError::ConfigError(format!("Failed to prepare query: {}", e)))?;

        // Get database file size once
        let db_path = OfflineDatabase::path()?;
        let db_size_bytes = std::fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);

        let rows = stmt
            .query_map([], |row: &Row| {
                Ok(StorageStats {
                    host_id: row.get(0)?,
                    entry_count: row.get(1)?,
                    oldest_timestamp: row.get(2)?,
                    newest_timestamp: row.get(3)?,
                    db_size_bytes,
                })
            })
            .map_err(|e| JournalError::ConfigError(format!("Query failed: {}", e)))?;

        let mut stats = Vec::new();
        for row_result in rows {
            stats.push(
                row_result.map_err(|e| JournalError::ConfigError(format!("Failed to read row: {}", e)))?,
            );
        }

        Ok(stats)
    }

    /// Get offline settings.
    pub fn get_offline_settings(&self) -> Result<OfflineSettings, JournalError> {
        let mut settings = OfflineSettings::default();

        // Load each setting from the database
        if let Ok(enabled) = self.get_setting("enabled") {
            settings.enabled = enabled == "true";
        }
        if let Ok(sync_boots) = self.get_setting("sync_boots") {
            if let Ok(boots) = sync_boots.parse::<u32>() {
                settings.sync_boots = boots;
            }
        }
        if let Ok(auto_sync) = self.get_setting("auto_sync") {
            settings.auto_sync = auto_sync == "true";
        }

        Ok(settings)
    }

    /// Update offline settings.
    pub fn update_offline_settings(&self, settings: &OfflineSettings) -> Result<(), JournalError> {
        self.set_setting("enabled", &settings.enabled.to_string())?;
        self.set_setting("sync_boots", &settings.sync_boots.to_string())?;
        self.set_setting("auto_sync", &settings.auto_sync.to_string())?;
        Ok(())
    }

    /// Get a setting value from the database.
    fn get_setting(&self, key: &str) -> Result<String, JournalError> {
        self.conn
            .query_row(
                "SELECT value FROM offline_settings WHERE key = ?",
                params![key],
                |row: &Row| row.get(0),
            )
            .map_err(|e| JournalError::ConfigError(format!("Failed to get setting '{}': {}", key, e)))
    }

    /// Set a setting value in the database.
    fn set_setting(&self, key: &str, value: &str) -> Result<(), JournalError> {
        self.conn
            .execute(
                "INSERT OR REPLACE INTO offline_settings (key, value) VALUES (?, ?)",
                params![key, value],
            )
            .map_err(|e| JournalError::ConfigError(format!("Failed to set setting '{}': {}", key, e)))?;
        Ok(())
    }

    /// Build the SQL and bound parameters for an offline query.
    fn build_query_sql(
        &self,
        host_id: &str,
        filter: &JournalFilter,
        kind: QueryKind,
    ) -> Result<(String, Vec<Box<dyn ToSql>>), JournalError> {
        let mut conditions = vec!["journal_entries.host_id = ?".to_string()];
        let mut params: Vec<Box<dyn ToSql>> = vec![Box::new(host_id.to_string())];

        if !filter.units.is_empty() {
            let placeholders = vec!["?"; filter.units.len()].join(", ");
            conditions.push(format!("journal_entries.systemd_unit IN ({placeholders})"));
            params.extend(filter.units.iter().cloned().map(|unit| Box::new(unit) as Box<dyn ToSql>));
        }

        if !filter.excluded_units.is_empty() {
            let placeholders = vec!["?"; filter.excluded_units.len()].join(", ");
            conditions.push(format!(
                "(journal_entries.systemd_unit IS NULL OR journal_entries.systemd_unit NOT IN ({placeholders}))"
            ));
            params.extend(
                filter
                    .excluded_units
                    .iter()
                    .cloned()
                    .map(|unit| Box::new(unit) as Box<dyn ToSql>),
            );
        }

        if !filter.priorities.is_empty() {
            let placeholders = vec!["?"; filter.priorities.len()].join(", ");
            conditions.push(format!("journal_entries.priority IN ({placeholders})"));
            params.extend(
                filter
                    .priorities
                    .iter()
                    .map(|priority| Box::new(*priority as i32) as Box<dyn ToSql>),
            );
        }

        if let Some(since) = &filter.since {
            if let Ok(timestamp) = parse_timestamp(since) {
                conditions.push("journal_entries.realtime_timestamp >= ?".to_string());
                params.push(Box::new(timestamp));
            }
        }

        if let Some(until) = &filter.until {
            if let Ok(timestamp) = parse_timestamp(until) {
                conditions.push("journal_entries.realtime_timestamp <= ?".to_string());
                params.push(Box::new(timestamp));
            }
        }

        if let Some(boot_id) = &filter.boot_id {
            conditions.push("journal_entries.boot_id = ?".to_string());
            params.push(Box::new(boot_id.clone()));
        }

        if let Some(identifier) = &filter.identifier {
            conditions.push("journal_entries.syslog_identifier = ?".to_string());
            params.push(Box::new(identifier.clone()));
        }

        let page_limit = match kind {
            QueryKind::Page { page_limit } => {
                if let Some(cursor) = &filter.after_cursor {
                    let comparison = if filter.reverse { "<" } else { ">" };
                    conditions.push(format!(
                        "(journal_entries.realtime_timestamp, journal_entries.cursor) {comparison} \
                         (SELECT realtime_timestamp, cursor FROM journal_entries \
                          WHERE host_id = ? AND cursor = ?)"
                    ));
                    params.push(Box::new(host_id.to_string()));
                    params.push(Box::new(cursor.clone()));
                }
                Some(page_limit)
            }
            QueryKind::Count | QueryKind::Visitor => None,
        };

        let mut fts_join = "";
        if let Some(pattern) = filter.grep_pattern.as_deref().filter(|pattern| !pattern.is_empty()) {
            if is_simple_pattern(pattern) {
                fts_join =
                    " INNER JOIN journal_entries_fts ON journal_entries.id = journal_entries_fts.rowid";
                conditions.push("journal_entries_fts.message MATCH ?".to_string());
                params.push(Box::new(format!("\"{}\"", pattern.replace('"', "\"\""))));
            } else {
                let collation = if filter.case_sensitive {
                    ""
                } else {
                    " COLLATE NOCASE"
                };
                conditions.push(format!(
                    "journal_entries.message LIKE ? ESCAPE '\\'{}",
                    collation
                ));
                params.push(Box::new(format!("%{}%", escape_like_pattern(pattern))));
            }
        }

        let where_clause = conditions.join(" AND ");
        let sql = match page_limit {
            Some(page_limit) => {
                let order = if filter.reverse { "DESC" } else { "ASC" };
                params.push(Box::new(i64::from(page_limit) + 1));
                format!(
                    "{ENTRY_SELECT} FROM journal_entries{fts_join} WHERE {where_clause} \
                     ORDER BY journal_entries.realtime_timestamp {order}, journal_entries.cursor {order} LIMIT ?"
                )
            }
            None => match kind {
                QueryKind::Count => {
                    format!("SELECT COUNT(*) FROM journal_entries{fts_join} WHERE {where_clause}")
                }
                QueryKind::Visitor => format!(
                    "{ENTRY_SELECT} FROM journal_entries{fts_join} WHERE {where_clause} \
                     ORDER BY journal_entries.realtime_timestamp ASC, journal_entries.cursor ASC"
                ),
                QueryKind::Page { .. } => unreachable!("page queries always have a limit"),
            },
        };

        Ok((sql, params))
    }
}

#[derive(Clone, Copy)]
enum QueryKind {
    Count,
    Page { page_limit: u32 },
    Visitor,
}

const ENTRY_SELECT: &str = "\
SELECT journal_entries.cursor, journal_entries.realtime_timestamp, \
journal_entries.monotonic_timestamp, journal_entries.boot_id, \
journal_entries.message, journal_entries.priority, \
journal_entries.syslog_identifier, journal_entries.systemd_unit, \
journal_entries.pid, journal_entries.uid, journal_entries.gid, \
journal_entries.exe, journal_entries.cmdline, journal_entries.hostname, journal_entries.comm";

fn entry_from_row(row: &Row<'_>) -> rusqlite::Result<JournalEntry> {
    Ok(JournalEntry {
        cursor: row.get(0)?,
        realtime_timestamp: row.get(1)?,
        monotonic_timestamp: row.get(2)?,
        boot_id: row.get(3)?,
        message: row.get(4)?,
        priority: row.get::<_, i32>(5)? as u8,
        syslog_identifier: row.get(6)?,
        systemd_unit: row.get(7)?,
        pid: row.get::<_, Option<i64>>(8)?.map(|value| value as u32),
        uid: row.get::<_, Option<i64>>(9)?.map(|value| value as u32),
        gid: row.get::<_, Option<i64>>(10)?.map(|value| value as u32),
        exe: row.get(11)?,
        cmdline: row.get(12)?,
        hostname: row.get(13)?,
        comm: row.get(14)?,
    })
}

/// Check if a pattern is simple enough for FTS5 (no regex metacharacters)
fn is_simple_pattern(pattern: &str) -> bool {
    // FTS5 doesn't support regex, only simple word matching
    !pattern
        .chars()
        .any(|c| matches!(c, '*' | '?' | '[' | ']' | '(' | ')' | '{' | '}' | '|' | '^' | '$' | '.'))
}

/// Escape special characters for SQL LIKE pattern
fn escape_like_pattern(pattern: &str) -> String {
    pattern
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

/// Parse a timestamp string to microseconds.
/// Supports ISO 8601 format (YYYY-MM-DDTHH:MM:SS) and Unix timestamps.
fn parse_timestamp(s: &str) -> Result<i64, JournalError> {
    // Try parsing as Unix timestamp first
    if let Ok(ts) = s.parse::<i64>() {
        return Ok(ts);
    }

    // Try parsing as ISO 8601 datetime
    // Format: YYYY-MM-DDTHH:MM:SS or YYYY-MM-DD HH:MM:SS
    use chrono::{NaiveDateTime, TimeZone, Utc};

    let datetime = if s.contains('T') {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S")
            .or_else(|_| NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.f"))
    } else {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S")
            .or_else(|_| NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S%.f"))
    };

    match datetime {
        Ok(dt) => {
            let utc = Utc.from_utc_datetime(&dt);
            Ok(utc.timestamp_micros())
        }
        Err(e) => Err(JournalError::ConfigError(format!(
            "Failed to parse timestamp '{}': {}",
            s, e
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use tempfile::tempdir;

    /// Helper to create a test database in a temporary directory
    fn create_test_db() -> (OfflineDatabase, tempfile::TempDir) {
        let temp_dir = tempdir().expect("Failed to create temp dir");
        let db_path = temp_dir.path().join("test_offline.db");

        let conn = Connection::open(&db_path).expect("Failed to open test database");
        let db = OfflineDatabase::from_connection(conn);
        db.run_migrations().expect("Failed to run migrations");

        (db, temp_dir)
    }

    fn sample_entry(cursor: &str, message: &str, timestamp: i64) -> JournalEntry {
        JournalEntry {
            cursor: cursor.to_string(),
            realtime_timestamp: timestamp,
            monotonic_timestamp: Some(1000),
            boot_id: "boot-123".to_string(),
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
    fn test_insert_entries() {
        let (db, _temp_dir) = create_test_db();

        let entries = vec![
            sample_entry("cur1", "First message", 1000000),
            sample_entry("cur2", "Second message", 1001000),
            sample_entry("cur3", "Third message", 1002000),
        ];

        let inserted = db.insert_entries("host1", &entries).unwrap();
        assert_eq!(inserted, 3);

        // Verify entries are in database
        let stats = db.get_storage_stats("host1").unwrap();
        assert_eq!(stats.entry_count, 3);
    }

    #[test]
    fn test_insert_entries_ignores_duplicates() {
        let (db, _temp_dir) = create_test_db();

        let entries = vec![sample_entry("cur1", "First message", 1000000)];

        let inserted1 = db.insert_entries("host1", &entries).unwrap();
        assert_eq!(inserted1, 1);

        // Insert same entry again - should be ignored
        let inserted2 = db.insert_entries("host1", &entries).unwrap();
        assert_eq!(inserted2, 0);

        let stats = db.get_storage_stats("host1").unwrap();
        assert_eq!(stats.entry_count, 1);
    }

    #[test]
    fn test_insert_empty_entries() {
        let (db, _temp_dir) = create_test_db();

        let entries: Vec<JournalEntry> = vec![];
        let inserted = db.insert_entries("host1", &entries).unwrap();
        assert_eq!(inserted, 0);
    }

    #[test]
    fn sync_batch_commits_entries_and_checkpoint_together() {
        let (db, _temp_dir) = create_test_db();
        let entries = vec![
            sample_entry("cur1", "first", 1),
            sample_entry("cur2", "second", 2),
        ];
        let mut state = SyncState {
            host_id: "host1".to_string(),
            sync_status: SyncStatus::InProgress,
            ..Default::default()
        };

        assert_eq!(db.insert_sync_batch("host1", &entries, &mut state).unwrap(), 2);
        assert_eq!(state.last_cursor.as_deref(), Some("cur2"));
        assert_eq!(state.entries_synced, 2);
        assert_eq!(db.get_storage_stats("host1").unwrap().entry_count, 2);
        assert_eq!(db.get_sync_state("host1").unwrap().last_cursor.as_deref(), Some("cur2"));

        assert_eq!(db.insert_sync_batch("host1", &entries, &mut state).unwrap(), 0);
        assert_eq!(state.entries_synced, 2);
        assert_eq!(state.last_cursor.as_deref(), Some("cur2"));
    }

    #[test]
    fn checkpoint_failure_rolls_back_the_entire_sync_batch() {
        let (db, _temp_dir) = create_test_db();
        db.conn
            .execute_batch(
                "CREATE TRIGGER fail_checkpoint BEFORE INSERT ON sync_state \
                 BEGIN SELECT RAISE(FAIL, 'checkpoint failure'); END;",
            )
            .unwrap();
        let mut state = SyncState {
            host_id: "host1".to_string(),
            sync_status: SyncStatus::InProgress,
            ..Default::default()
        };
        let entries = vec![sample_entry("cur1", "first", 1)];

        assert!(db.insert_sync_batch("host1", &entries, &mut state).is_err());
        assert_eq!(db.get_storage_stats("host1").unwrap().entry_count, 0);
        assert!(state.last_cursor.is_none());
        assert_eq!(state.entries_synced, 0);
    }

    #[test]
    fn test_query_page_no_filter() {
        let (db, _temp_dir) = create_test_db();

        let entries = vec![
            sample_entry("cur1", "First message", 1000000),
            sample_entry("cur2", "Second message", 1001000),
        ];
        db.insert_entries("host1", &entries).unwrap();

        let filter = JournalFilter::default();
        let results = db.query_page("host1", &filter).unwrap().entries;
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_query_page_by_priority() {
        let (db, _temp_dir) = create_test_db();

        let mut entry1 = sample_entry("cur1", "Error message", 1000000);
        entry1.priority = 3; // Error
        let mut entry2 = sample_entry("cur2", "Info message", 1001000);
        entry2.priority = 6; // Info

        db.insert_entries("host1", &[entry1, entry2]).unwrap();

        let mut filter = JournalFilter::default();
        filter.priorities = vec![3];

        let results = db.query_page("host1", &filter).unwrap().entries;
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].cursor, "cur1");
    }

    #[test]
    fn test_query_page_by_unit() {
        let (db, _temp_dir) = create_test_db();

        let mut entry1 = sample_entry("cur1", "Service A log", 1000000);
        entry1.systemd_unit = Some("serviceA.service".to_string());
        let mut entry2 = sample_entry("cur2", "Service B log", 1001000);
        entry2.systemd_unit = Some("serviceB.service".to_string());

        db.insert_entries("host1", &[entry1, entry2]).unwrap();

        let mut filter = JournalFilter::default();
        filter.units = vec!["serviceA.service".to_string()];

        let results = db.query_page("host1", &filter).unwrap().entries;
        assert_eq!(results.len(), 1);
        assert_eq!(
            results[0].systemd_unit,
            Some("serviceA.service".to_string())
        );
    }

    #[test]
    fn test_query_page_excluded_units() {
        let (db, _temp_dir) = create_test_db();

        let mut entry1 = sample_entry("cur1", "Service A log", 1000000);
        entry1.systemd_unit = Some("serviceA.service".to_string());
        let mut entry2 = sample_entry("cur2", "Service B log", 1001000);
        entry2.systemd_unit = Some("serviceB.service".to_string());

        db.insert_entries("host1", &[entry1, entry2]).unwrap();

        let mut filter = JournalFilter::default();
        filter.excluded_units = vec!["serviceA.service".to_string()];

        let results = db.query_page("host1", &filter).unwrap().entries;
        assert_eq!(results.len(), 1);
        assert_eq!(
            results[0].systemd_unit,
            Some("serviceB.service".to_string())
        );
    }

    #[test]
    fn test_query_page_by_boot_id() {
        let (db, _temp_dir) = create_test_db();

        let mut entry1 = sample_entry("cur1", "Boot 1 log", 1000000);
        entry1.boot_id = "boot-1".to_string();
        let mut entry2 = sample_entry("cur2", "Boot 2 log", 1001000);
        entry2.boot_id = "boot-2".to_string();

        db.insert_entries("host1", &[entry1, entry2]).unwrap();

        let mut filter = JournalFilter::default();
        filter.boot_id = Some("boot-1".to_string());

        let results = db.query_page("host1", &filter).unwrap().entries;
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].boot_id, "boot-1");
    }

    #[test]
    fn test_query_page_with_grep_pattern() {
        let (db, _temp_dir) = create_test_db();

        let entries = vec![
            sample_entry("cur1", "Error in systemd service", 1000000),
            sample_entry("cur2", "Service started successfully", 1001000),
            sample_entry("cur3", "Another error occurred", 1002000),
        ];
        db.insert_entries("host1", &entries).unwrap();

        let mut filter = JournalFilter::default();
        filter.grep_pattern = Some("error".to_string());

        let results = db.query_page("host1", &filter).unwrap().entries;
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_query_page_pagination() {
        let (db, _temp_dir) = create_test_db();

        let entries: Vec<JournalEntry> = (0..10)
            .map(|i| sample_entry(&format!("cur{}", i), &format!("Message {}", i), 1000000 + i))
            .collect();
        db.insert_entries("host1", &entries).unwrap();

        let mut filter = JournalFilter::default();
        filter.limit = 5;
        filter.reverse = false;

        let result = db.query_page("host1", &filter).unwrap();
        assert!(result.has_more);
        assert_eq!(result.entries.len(), 5);
        assert_eq!(result.entries[0].cursor, "cur0");
    }

    #[test]
    fn test_query_page_paginates_by_timestamp_and_cursor() {
        let (db, _temp_dir) = create_test_db();
        let entries = vec![
            sample_entry("cursor-a", "First", 1_000_000),
            sample_entry("cursor-b", "Second", 1_000_000),
            sample_entry("cursor-c", "Third", 1_000_001),
        ];
        db.insert_entries("host1", &entries).unwrap();

        let filter = JournalFilter {
            after_cursor: Some("cursor-a".to_string()),
            limit: 10,
            reverse: false,
            ..Default::default()
        };
        let result = db.query_page("host1", &filter).unwrap();

        assert_eq!(
            result.entries.iter().map(|entry| entry.cursor.as_str()).collect::<Vec<_>>(),
            vec!["cursor-b", "cursor-c"]
        );
    }

    #[test]
    fn test_query_page_visits_tuple_order_once_in_both_directions() {
        let (db, _temp_dir) = create_test_db();
        db.insert_entries(
            "host-a",
            &[
                sample_entry("z", "first", 100),
                sample_entry("a", "second", 200),
                sample_entry("m", "third", 200),
            ],
        )
        .unwrap();
        db.insert_entries("host-b", &[sample_entry("z", "other host", 999)]).unwrap();

        let mut forward = JournalFilter {
            limit: 1,
            reverse: false,
            ..Default::default()
        };
        let first = db.query_page("host-a", &forward).unwrap();
        assert_eq!(first.entries[0].cursor, "z");
        assert!(first.has_more);
        forward.after_cursor = first.cursor_end;
        let second = db.query_page("host-a", &forward).unwrap();
        assert_eq!(second.entries[0].cursor, "a");
        forward.after_cursor = second.cursor_end;
        let final_page = db.query_page("host-a", &forward).unwrap();
        assert_eq!(final_page.entries[0].cursor, "m");
        assert!(!final_page.has_more);

        let mut reverse = JournalFilter {
            limit: 1,
            reverse: true,
            ..Default::default()
        };
        let newest = db.query_page("host-a", &reverse).unwrap();
        assert_eq!(newest.entries[0].cursor, "m");
        reverse.after_cursor = newest.cursor_end;
        let middle = db.query_page("host-a", &reverse).unwrap();
        assert_eq!(middle.entries[0].cursor, "a");
        reverse.after_cursor = middle.cursor_end;
        let oldest = db.query_page("host-a", &reverse).unwrap();
        assert_eq!(oldest.entries[0].cursor, "z");
        assert!(!oldest.has_more);
    }

    #[test]
    fn test_query_page_rejects_missing_or_foreign_anchor() {
        let (db, _temp_dir) = create_test_db();
        db.insert_entries("host-a", &[sample_entry("a", "entry", 100)]).unwrap();
        db.insert_entries("host-b", &[sample_entry("b", "entry", 200)]).unwrap();

        for cursor in ["missing", "b"] {
            let error = match db.query_page(
                "host-a",
                &JournalFilter {
                    after_cursor: Some(cursor.to_string()),
                    ..Default::default()
                },
            ) {
                Err(error) => error,
                Ok(_) => panic!("missing cursor should fail"),
            };
            assert!(matches!(
                error,
                JournalError::ExecutionError(message)
                    if message == "Cached page cursor expired; refresh logs."
            ));
        }
    }

    #[test]
    fn test_query_page_exclusion_keeps_unitless_records() {
        let (db, _temp_dir) = create_test_db();
        let mut excluded = sample_entry("excluded", "excluded", 100);
        excluded.systemd_unit = Some("skip.service".to_string());
        let unitless = sample_entry("unitless", "kept", 101);
        db.insert_entries("host", &[excluded, unitless]).unwrap();

        let result = db
            .query_page(
                "host",
                &JournalFilter {
                    excluded_units: vec!["skip.service".to_string()],
                    reverse: false,
                    ..Default::default()
                },
            )
            .unwrap();
        assert_eq!(result.entries.len(), 1);
        assert_eq!(result.entries[0].cursor, "unitless");
    }

    #[test]
    fn test_visit_entries_is_chronological_and_ignores_page_controls() {
        let (db, _temp_dir) = create_test_db();
        let entries = vec![
            sample_entry("cursor-c", "Third", 1_000_002),
            sample_entry("cursor-a", "First", 1_000_000),
            sample_entry("cursor-b", "Second", 1_000_001),
        ];
        db.insert_entries("host1", &entries).unwrap();

        let filter = JournalFilter {
            after_cursor: Some("cursor-b".to_string()),
            limit: 1,
            reverse: true,
            ..Default::default()
        };
        let mut cursors = Vec::new();
        let visited = db
            .visit_entries("host1", &filter, |entry| {
                cursors.push(entry.cursor.clone());
                Ok(())
            })
            .unwrap();

        assert_eq!(visited, 3);
        assert_eq!(cursors, vec!["cursor-a", "cursor-b", "cursor-c"]);
    }

    #[test]
    fn test_count_entries() {
        let (db, _temp_dir) = create_test_db();

        let entries = vec![
            sample_entry("cur1", "Error message", 1000000),
            sample_entry("cur2", "Info message", 1001000),
            sample_entry("cur3", "Warning message", 1002000),
        ];
        db.insert_entries("host1", &entries).unwrap();

        let filter = JournalFilter::default();
        let count = db.count_entries("host1", &filter).unwrap();
        assert_eq!(count, 3);
    }

    #[test]
    fn test_delete_entries_before() {
        let (db, _temp_dir) = create_test_db();

        let entries = vec![
            sample_entry("cur1", "Old message", 1000000),
            sample_entry("cur2", "New message", 2000000),
            sample_entry("cur3", "Newest message", 3000000),
        ];
        db.insert_entries("host1", &entries).unwrap();

        let deleted = db.delete_entries_before("host1", 2000000).unwrap();
        assert_eq!(deleted, 1);

        let stats = db.get_storage_stats("host1").unwrap();
        assert_eq!(stats.entry_count, 2);
    }

    #[test]
    fn test_delete_all_entries() {
        let (db, _temp_dir) = create_test_db();

        let entries = vec![
            sample_entry("cur1", "Message 1", 1000000),
            sample_entry("cur2", "Message 2", 1001000),
        ];
        db.insert_entries("host1", &entries).unwrap();

        let deleted = db.delete_all_entries("host1").unwrap();
        assert_eq!(deleted, 2);

        let stats = db.get_storage_stats("host1").unwrap();
        assert_eq!(stats.entry_count, 0);
    }

    #[test]
    fn test_get_storage_stats() {
        let (db, _temp_dir) = create_test_db();

        let entries = vec![
            sample_entry("cur1", "First", 1000000),
            sample_entry("cur2", "Second", 2000000),
            sample_entry("cur3", "Third", 3000000),
        ];
        db.insert_entries("host1", &entries).unwrap();

        let stats = db.get_storage_stats("host1").unwrap();
        assert_eq!(stats.host_id, "host1");
        assert_eq!(stats.entry_count, 3);
        assert_eq!(stats.oldest_timestamp, Some(1000000));
        assert_eq!(stats.newest_timestamp, Some(3000000));
    }

    #[test]
    fn test_sync_state_crud() {
        let (db, _temp_dir) = create_test_db();

        // Initially should return default state
        let state = db.get_sync_state("host1").unwrap();
        assert_eq!(state.host_id, "host1");
        assert_eq!(state.sync_status, SyncStatus::Never);

        // Update sync state
        let new_state = SyncState {
            host_id: "host1".to_string(),
            last_sync_timestamp: 1234567890,
            last_cursor: Some("cursor-123".to_string()),
            sync_status: SyncStatus::Completed,
            sync_error: None,
            entries_synced: 100,
        };
        db.update_sync_state(&new_state).unwrap();

        // Verify update
        let state = db.get_sync_state("host1").unwrap();
        assert_eq!(state.last_sync_timestamp, 1234567890);
        assert_eq!(state.last_cursor, Some("cursor-123".to_string()));
        assert_eq!(state.sync_status, SyncStatus::Completed);
        assert_eq!(state.entries_synced, 100);
    }

    #[test]
    fn test_is_simple_pattern() {
        assert!(is_simple_pattern("error"));
        assert!(is_simple_pattern("service started"));
        assert!(!is_simple_pattern("error.*"));
        assert!(!is_simple_pattern("file[0-9]"));
        assert!(!is_simple_pattern("(test|prod)"));
    }

    #[test]
    fn test_escape_like_pattern() {
        assert_eq!(escape_like_pattern("test"), "test");
        assert_eq!(escape_like_pattern("test%"), "test\\%");
        assert_eq!(escape_like_pattern("test_name"), "test\\_name");
        assert_eq!(escape_like_pattern("test\\path"), "test\\\\path");
    }

    #[test]
    fn test_parse_timestamp() {
        // Unix timestamp
        assert_eq!(parse_timestamp("1234567890").unwrap(), 1234567890);

        // ISO 8601
        let ts = parse_timestamp("2024-01-15T10:30:00").unwrap();
        assert!(ts > 0);
    }

    #[test]
    fn test_query_page_host_isolation() {
        let (db, _temp_dir) = create_test_db();

        // Insert entries for two different hosts
        let entries1 = vec![sample_entry("cur1", "Host 1 message", 1000000)];
        let entries2 = vec![sample_entry("cur2", "Host 2 message", 1001000)];

        db.insert_entries("host1", &entries1).unwrap();
        db.insert_entries("host2", &entries2).unwrap();

        // Query should only return entries for requested host
        let filter = JournalFilter::default();
        let results = db.query_page("host1", &filter).unwrap().entries;
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].message, "Host 1 message");
    }

    #[test]
    fn test_get_all_sync_states() {
        let (db, _temp_dir) = create_test_db();

        // Initially should return empty list
        let states = db.get_all_sync_states().unwrap();
        assert!(states.is_empty());

        // Add sync states for multiple hosts
        let state1 = SyncState {
            host_id: "host1".to_string(),
            last_sync_timestamp: 1000,
            sync_status: SyncStatus::Completed,
            ..Default::default()
        };
        let state2 = SyncState {
            host_id: "host2".to_string(),
            last_sync_timestamp: 2000,
            sync_status: SyncStatus::InProgress,
            ..Default::default()
        };

        db.update_sync_state(&state1).unwrap();
        db.update_sync_state(&state2).unwrap();

        // Should return all sync states
        let states = db.get_all_sync_states().unwrap();
        assert_eq!(states.len(), 2);
        assert_eq!(states[0].host_id, "host1");
        assert_eq!(states[1].host_id, "host2");
    }

    #[test]
    fn test_get_all_storage_stats() {
        let (db, _temp_dir) = create_test_db();

        // Initially should return empty list (no entries)
        let stats = db.get_all_storage_stats().unwrap();
        assert!(stats.is_empty());

        // Add entries for multiple hosts
        let entries1 = vec![
            sample_entry("cur1", "Host 1 message 1", 1000000),
            sample_entry("cur2", "Host 1 message 2", 2000000),
        ];
        let entries2 = vec![sample_entry("cur3", "Host 2 message", 3000000)];

        db.insert_entries("host1", &entries1).unwrap();
        db.insert_entries("host2", &entries2).unwrap();

        // Should return stats for all hosts
        let stats = db.get_all_storage_stats().unwrap();
        assert_eq!(stats.len(), 2);
        assert_eq!(stats[0].host_id, "host1");
        assert_eq!(stats[0].entry_count, 2);
        assert_eq!(stats[1].host_id, "host2");
        assert_eq!(stats[1].entry_count, 1);
    }

    #[test]
    fn test_offline_settings_crud() {
        let (db, _temp_dir) = create_test_db();

        // Initially should return default settings
        let settings = db.get_offline_settings().unwrap();
        assert!(settings.enabled);
        assert_eq!(settings.sync_boots, 5);
        assert!(settings.auto_sync);

        // Update settings
        let new_settings = OfflineSettings {
            enabled: false,
            sync_boots: 10,
            auto_sync: false,
        };
        db.update_offline_settings(&new_settings).unwrap();

        // Verify update
        let settings = db.get_offline_settings().unwrap();
        assert!(!settings.enabled);
        assert_eq!(settings.sync_boots, 10);
        assert!(!settings.auto_sync);
    }
}
