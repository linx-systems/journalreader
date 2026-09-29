use crate::error::JournalError;
use crate::journal::types::JournalEntry;
use serde_json::Value;

/// Parse a JSON line from journalctl output into a JournalEntry.
pub fn parse_entry(json_line: &str) -> Result<JournalEntry, JournalError> {
    let value: Value =
        serde_json::from_str(json_line).map_err(|e| JournalError::ParseError(e.to_string()))?;

    Ok(JournalEntry {
        cursor: get_string(&value, "__CURSOR").unwrap_or_default(),
        realtime_timestamp: get_timestamp(&value, "__REALTIME_TIMESTAMP"),
        monotonic_timestamp: get_optional_timestamp(&value, "__MONOTONIC_TIMESTAMP"),
        boot_id: get_string(&value, "_BOOT_ID").unwrap_or_default(),
        message: get_string(&value, "MESSAGE").unwrap_or_default(),
        priority: get_priority(&value),
        syslog_identifier: get_string(&value, "SYSLOG_IDENTIFIER"),
        systemd_unit: get_string(&value, "_SYSTEMD_UNIT"),
        pid: get_u32(&value, "_PID"),
        uid: get_u32(&value, "_UID"),
        gid: get_u32(&value, "_GID"),
        exe: get_string(&value, "_EXE"),
        cmdline: get_string(&value, "_CMDLINE"),
        hostname: get_string(&value, "_HOSTNAME"),
        comm: get_string(&value, "_COMM"),
    })
}

/// Extract a string value from a JSON object.
/// Handles both regular strings and byte arrays (which journalctl sometimes returns).
pub fn get_string(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(|v| {
        if let Some(s) = v.as_str() {
            Some(s.to_string())
        } else if let Some(arr) = v.as_array() {
            // Sometimes journalctl returns arrays of bytes
            let bytes: Vec<u8> = arr.iter().filter_map(|x| x.as_u64().map(|n| n as u8)).collect();
            String::from_utf8(bytes).ok()
        } else {
            None
        }
    })
}

/// Extract a timestamp value from a JSON object, defaulting to 0 if not present.
/// Handles both string and integer representations.
pub fn get_timestamp(value: &Value, key: &str) -> i64 {
    value
        .get(key)
        .and_then(|v| {
            if let Some(s) = v.as_str() {
                s.parse::<i64>().ok()
            } else {
                v.as_i64()
            }
        })
        .unwrap_or(0)
}

/// Extract an optional timestamp value from a JSON object.
/// Handles both string and integer representations.
pub fn get_optional_timestamp(value: &Value, key: &str) -> Option<i64> {
    value.get(key).and_then(|v| {
        if let Some(s) = v.as_str() {
            s.parse::<i64>().ok()
        } else {
            v.as_i64()
        }
    })
}

/// Extract the priority value from a JSON object, defaulting to 6 (info) if not present.
/// Handles both string and integer representations.
pub fn get_priority(value: &Value) -> u8 {
    value
        .get("PRIORITY")
        .and_then(|v| {
            if let Some(s) = v.as_str() {
                s.parse::<u8>().ok()
            } else {
                v.as_u64().map(|n| n as u8)
            }
        })
        .unwrap_or(6) // Default to info
}

/// Apply filters that journalctl cannot represent exactly.
///
/// Unitless records are retained unless a positive unit filter excluded them upstream.
pub fn matches_post_filters(
    excluded_units: &[String],
    priorities: &[u8],
    unit: Option<&str>,
    priority: u8,
) -> bool {
    !unit.is_some_and(|unit| excluded_units.iter().any(|excluded| excluded == unit))
        && (priorities.is_empty() || priorities.contains(&priority))
}

/// Extract an optional u32 value from a JSON object.
/// Handles both string and integer representations.
pub fn get_u32(value: &Value, key: &str) -> Option<u32> {
    value.get(key).and_then(|v| {
        if let Some(s) = v.as_str() {
            s.parse::<u32>().ok()
        } else {
            v.as_u64().map(|n| n as u32)
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_get_string_from_string() {
        let value = json!({"MESSAGE": "Hello, World!"});
        assert_eq!(get_string(&value, "MESSAGE"), Some("Hello, World!".to_string()));
    }

    #[test]
    fn test_get_string_from_byte_array() {
        let value = json!({"MESSAGE": [72, 101, 108, 108, 111]});
        assert_eq!(get_string(&value, "MESSAGE"), Some("Hello".to_string()));
    }

    #[test]
    fn test_get_string_missing_key() {
        let value = json!({});
        assert_eq!(get_string(&value, "MESSAGE"), None);
    }

    #[test]
    fn test_get_timestamp_from_string() {
        let value = json!({"__REALTIME_TIMESTAMP": "1704067200000000"});
        assert_eq!(get_timestamp(&value, "__REALTIME_TIMESTAMP"), 1704067200000000);
    }

    #[test]
    fn test_get_timestamp_from_integer() {
        let value = json!({"__REALTIME_TIMESTAMP": 1704067200000000_i64});
        assert_eq!(get_timestamp(&value, "__REALTIME_TIMESTAMP"), 1704067200000000);
    }

    #[test]
    fn test_get_timestamp_missing_defaults_to_zero() {
        let value = json!({});
        assert_eq!(get_timestamp(&value, "__REALTIME_TIMESTAMP"), 0);
    }

    #[test]
    fn test_get_optional_timestamp_present() {
        let value = json!({"__MONOTONIC_TIMESTAMP": "12345"});
        assert_eq!(get_optional_timestamp(&value, "__MONOTONIC_TIMESTAMP"), Some(12345));
    }

    #[test]
    fn test_get_optional_timestamp_missing() {
        let value = json!({});
        assert_eq!(get_optional_timestamp(&value, "__MONOTONIC_TIMESTAMP"), None);
    }

    #[test]
    fn test_get_priority_from_string() {
        let value = json!({"PRIORITY": "3"});
        assert_eq!(get_priority(&value), 3);
    }

    #[test]
    fn test_get_priority_from_integer() {
        let value = json!({"PRIORITY": 4});
        assert_eq!(get_priority(&value), 4);
    }

    #[test]
    fn test_get_priority_missing_defaults_to_info() {
        let value = json!({});
        assert_eq!(get_priority(&value), 6);
    }

    #[test]
    fn test_get_u32_from_string() {
        let value = json!({"_PID": "1234"});
        assert_eq!(get_u32(&value, "_PID"), Some(1234));
    }

    #[test]
    fn test_get_u32_from_integer() {
        let value = json!({"_PID": 5678});
        assert_eq!(get_u32(&value, "_PID"), Some(5678));
    }

    #[test]
    fn test_get_u32_missing() {
        let value = json!({});
        assert_eq!(get_u32(&value, "_PID"), None);
    }

    #[test]
    fn test_parse_entry_minimal() {
        let json_line = r#"{"__CURSOR":"s=abc123","__REALTIME_TIMESTAMP":"1704067200000000","_BOOT_ID":"boot-1","MESSAGE":"Test message"}"#;
        let entry = parse_entry(json_line).unwrap();

        assert_eq!(entry.cursor, "s=abc123");
        assert_eq!(entry.realtime_timestamp, 1704067200000000);
        assert_eq!(entry.boot_id, "boot-1");
        assert_eq!(entry.message, "Test message");
        assert_eq!(entry.priority, 6); // Default
    }

    #[test]
    fn test_parse_entry_full() {
        let json_line = r#"{
            "__CURSOR": "s=abc123",
            "__REALTIME_TIMESTAMP": "1704067200000000",
            "__MONOTONIC_TIMESTAMP": "12345",
            "_BOOT_ID": "boot-1",
            "MESSAGE": "Test message",
            "PRIORITY": "3",
            "SYSLOG_IDENTIFIER": "myapp",
            "_SYSTEMD_UNIT": "myapp.service",
            "_PID": "1234",
            "_UID": "1000",
            "_GID": "1000",
            "_EXE": "/usr/bin/myapp",
            "_CMDLINE": "/usr/bin/myapp --daemon",
            "_HOSTNAME": "server1",
            "_COMM": "myapp"
        }"#;
        let entry = parse_entry(json_line).unwrap();

        assert_eq!(entry.cursor, "s=abc123");
        assert_eq!(entry.realtime_timestamp, 1704067200000000);
        assert_eq!(entry.monotonic_timestamp, Some(12345));
        assert_eq!(entry.boot_id, "boot-1");
        assert_eq!(entry.message, "Test message");
        assert_eq!(entry.priority, 3);
        assert_eq!(entry.syslog_identifier, Some("myapp".to_string()));
        assert_eq!(entry.systemd_unit, Some("myapp.service".to_string()));
        assert_eq!(entry.pid, Some(1234));
        assert_eq!(entry.uid, Some(1000));
        assert_eq!(entry.gid, Some(1000));
        assert_eq!(entry.exe, Some("/usr/bin/myapp".to_string()));
        assert_eq!(entry.cmdline, Some("/usr/bin/myapp --daemon".to_string()));
        assert_eq!(entry.hostname, Some("server1".to_string()));
        assert_eq!(entry.comm, Some("myapp".to_string()));
    }

    #[test]
    fn test_parse_entry_invalid_json() {
        let result = parse_entry("not valid json");
        assert!(result.is_err());
        if let Err(JournalError::ParseError(_)) = result {
            // Expected error type
        } else {
            panic!("Expected ParseError");
        }
    }

    #[test]
    fn test_parse_entry_with_byte_array_message() {
        let json_line = r#"{"__CURSOR":"s=abc123","__REALTIME_TIMESTAMP":"1704067200000000","_BOOT_ID":"boot-1","MESSAGE":[72,101,108,108,111]}"#;
        let entry = parse_entry(json_line).unwrap();
        assert_eq!(entry.message, "Hello");
    }

    #[test]
    fn matches_post_filters_preserves_unitless_records_and_exact_priorities() {
        let excluded = vec!["skip.service".to_string()];
        assert!(matches_post_filters(&excluded, &[3, 6], None, 3));
        assert!(!matches_post_filters(
            &excluded,
            &[3, 6],
            Some("skip.service"),
            3,
        ));
        assert!(!matches_post_filters(
            &excluded,
            &[3, 6],
            Some("keep.service"),
            4,
        ));
        assert!(matches_post_filters(&excluded, &[], Some("keep.service"), 4));
    }
}
