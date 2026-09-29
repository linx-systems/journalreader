use crate::error::JournalError;
use crate::journal::parser::matches_post_filters;
use crate::journal::types::{JournalEntry, JournalFilter, JournalQueryResult};

const RAW_PAGE_SIZE: u32 = 1_000;
const DEFAULT_PAGE_SIZE: u32 = 500;
const MAX_PAGE_SIZE: u32 = 10_000;

pub(crate) struct RawPage {
    pub entries: Vec<JournalEntry>,
    pub scanned: usize,
    pub last_cursor: Option<String>,
}

pub(crate) fn scan_page(
    filter: &JournalFilter,
    minimum_timestamp: Option<i64>,
    mut fetch: impl FnMut(Option<&str>, u32) -> Result<RawPage, JournalError>,
) -> Result<JournalQueryResult, JournalError> {
    let page_size = normalize_page_size(filter.limit) as usize;
    let mut accepted = Vec::with_capacity(page_size.saturating_add(1));
    let mut after_cursor = filter.after_cursor.clone();

    loop {
        let page = fetch(after_cursor.as_deref(), RAW_PAGE_SIZE)?;

        if page.entries.is_empty() {
            if page.scanned == 0 {
                break;
            }
            return Err(JournalError::ExecutionError(
                "journalctl returned entries without a cursor".into(),
            ));
        }

        let last_cursor = page.last_cursor.ok_or_else(|| {
            JournalError::ExecutionError("journalctl returned entries without a cursor".into())
        })?;
        if after_cursor.as_deref() == Some(last_cursor.as_str()) {
            return Err(JournalError::ExecutionError(
                "journalctl pagination cursor did not advance".into(),
            ));
        }

        let mut reached_lower_bound = false;
        for entry in page.entries {
            if let Some(minimum_timestamp) = minimum_timestamp {
                if entry.realtime_timestamp < minimum_timestamp {
                    if filter.reverse {
                        reached_lower_bound = true;
                        break;
                    }
                    continue;
                }
            }

            if matches_post_filters(
                &filter.excluded_units,
                &filter.priorities,
                entry.systemd_unit.as_deref(),
                entry.priority,
            ) {
                accepted.push(entry);
                if accepted.len() > page_size {
                    return Ok(result_from_entries(accepted, true));
                }
            }
        }

        if reached_lower_bound || page.scanned < RAW_PAGE_SIZE as usize {
            break;
        }
        after_cursor = Some(last_cursor);
    }

    Ok(result_from_entries(accepted, false))
}

fn normalize_page_size(limit: u32) -> u32 {
    match limit {
        0 => DEFAULT_PAGE_SIZE,
        limit => limit.min(MAX_PAGE_SIZE),
    }
}

fn result_from_entries(mut entries: Vec<JournalEntry>, has_more: bool) -> JournalQueryResult {
    if has_more {
        entries.pop();
    }
    let cursor_start = entries.first().map(|entry| entry.cursor.clone());
    let cursor_end = entries.last().map(|entry| entry.cursor.clone());
    JournalQueryResult {
        entries,
        has_more,
        cursor_start,
        cursor_end,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(cursor: &str, timestamp: i64, unit: Option<&str>, priority: u8) -> JournalEntry {
        JournalEntry {
            cursor: cursor.into(),
            realtime_timestamp: timestamp,
            monotonic_timestamp: None,
            boot_id: String::new(),
            message: String::new(),
            priority,
            syslog_identifier: None,
            systemd_unit: unit.map(str::to_owned),
            pid: None,
            uid: None,
            gid: None,
            exe: None,
            cmdline: None,
            hostname: None,
            comm: None,
        }
    }

    #[test]
    fn continues_after_filtered_raw_rows_without_skipping_the_page_cursor() {
        let filter = JournalFilter {
            limit: 2,
            excluded_units: vec!["skip.service".into()],
            priorities: vec![3],
            ..Default::default()
        };
        let mut calls = 0;
        let result = scan_page(&filter, None, |cursor, _| {
            calls += 1;
            match calls {
                1 => {
                    assert_eq!(cursor, None);
                    Ok(RawPage {
                        entries: vec![
                            entry("skip", 1, Some("skip.service"), 3),
                            entry("wide", 2, Some("keep.service"), 4),
                            entry("first", 3, None, 3),
                        ],
                        scanned: 1_000,
                        last_cursor: Some("first".into()),
                    })
                }
                2 => {
                    assert_eq!(cursor, Some("first"));
                    Ok(RawPage {
                        entries: vec![
                            entry("second", 4, Some("keep.service"), 3),
                            entry("third", 5, Some("keep.service"), 3),
                        ],
                        scanned: 2,
                        last_cursor: Some("third".into()),
                    })
                }
                _ => panic!("unexpected scan"),
            }
        })
        .unwrap();

        assert_eq!(calls, 2);
        assert_eq!(result.entries.iter().map(|entry| entry.cursor.as_str()).collect::<Vec<_>>(), ["first", "second"]);
        assert!(result.has_more);
        assert_eq!(result.cursor_end.as_deref(), Some("second"));
    }

    #[test]
    fn reverse_scan_stops_before_entries_older_than_since_probe() {
        let filter = JournalFilter {
            limit: 3,
            reverse: true,
            ..Default::default()
        };
        let result = scan_page(&filter, Some(20), |_, _| {
            Ok(RawPage {
                entries: vec![entry("new", 30, None, 6), entry("boundary", 20, None, 6), entry("old", 19, None, 6)],
                scanned: 1_000,
                last_cursor: Some("old".into()),
            })
        })
        .unwrap();

        assert_eq!(result.entries.iter().map(|entry| entry.cursor.as_str()).collect::<Vec<_>>(), ["new", "boundary"]);
        assert!(!result.has_more);
    }

    #[test]
    fn rejects_a_non_advancing_raw_cursor() {
        let filter = JournalFilter {
            after_cursor: Some("same".into()),
            ..Default::default()
        };
        let error = match scan_page(&filter, None, |_, _| {
            Ok(RawPage {
                entries: vec![entry("same", 1, None, 6)],
                scanned: 1_000,
                last_cursor: Some("same".into()),
            })
        }) {
            Err(error) => error,
            Ok(_) => panic!("non-advancing cursor should fail"),
        };

        assert!(matches!(error, JournalError::ExecutionError(_)));
    }

    #[test]
    fn rejects_nonempty_raw_pages_without_a_cursor() {
        let error = match scan_page(&JournalFilter::default(), None, |_, _| {
            Ok(RawPage {
                entries: vec![entry("entry", 1, None, 6)],
                scanned: 1,
                last_cursor: None,
            })
        }) {
            Err(error) => error,
            Ok(_) => panic!("missing cursor should fail"),
        };

        assert!(matches!(error, JournalError::ExecutionError(_)));
    }
}
