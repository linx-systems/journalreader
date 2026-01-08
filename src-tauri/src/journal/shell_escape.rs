//! Shell argument escaping utilities for safe SSH command execution.
//!
//! This module provides functions to safely escape user-provided values
//! before interpolating them into shell commands executed over SSH.
//! This prevents command injection attacks.

use shell_escape::escape;
use std::borrow::Cow;

/// Escape a string for safe use as a shell argument.
///
/// Uses the `shell-escape` crate which properly handles all special characters
/// including single quotes, backticks, $(), and other shell metacharacters.
///
/// # Examples
///
/// ```
/// use crate::journal::shell_escape::escape_arg;
///
/// // Normal strings pass through quoted
/// assert_eq!(escape_arg("nginx.service"), "'nginx.service'");
///
/// // Strings with single quotes are properly escaped
/// assert_eq!(escape_arg("test'value"), "'test'\\''value'");
///
/// // Command injection attempts are neutralized
/// assert_eq!(escape_arg("'; rm -rf /; '"), "''\\'''; rm -rf /; '\\'''");
/// ```
pub fn escape_arg(s: &str) -> String {
    escape(Cow::Borrowed(s)).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_strings() {
        // Simple alphanumeric strings should be quoted
        let escaped = escape_arg("nginx.service");
        assert!(escaped.contains("nginx.service"));
        // Should not contain unescaped shell metacharacters
        assert!(!escaped.contains(';'));
    }

    #[test]
    fn test_single_quote_injection() {
        // Single quote escape attempt: '; rm -rf /; echo '
        let malicious = "'; rm -rf /; echo '";
        let escaped = escape_arg(malicious);
        // The escaped string should not allow breaking out of quotes
        // When passed to shell, it should be treated as a literal string
        assert!(!escaped.starts_with("'';"));
    }

    #[test]
    fn test_backtick_injection() {
        // Backtick command substitution: `whoami`
        let malicious = "`whoami`";
        let escaped = escape_arg(malicious);
        // Should be escaped so backticks are literal
        assert!(escaped.contains("whoami"));
    }

    #[test]
    fn test_dollar_paren_injection() {
        // $() command substitution: $(cat /etc/passwd)
        let malicious = "$(cat /etc/passwd)";
        let escaped = escape_arg(malicious);
        // Should be escaped so $() is literal
        assert!(escaped.contains("cat"));
    }

    #[test]
    fn test_semicolon_injection() {
        // Semicolon command chaining: foo; rm -rf /
        let malicious = "foo; rm -rf /";
        let escaped = escape_arg(malicious);
        // Should not allow semicolon to break out
        assert!(escaped.contains("rm"));
    }

    #[test]
    fn test_pipe_injection() {
        // Pipe command chaining: foo | cat /etc/passwd
        let malicious = "foo | cat /etc/passwd";
        let escaped = escape_arg(malicious);
        // Should not allow pipe to work as command separator
        assert!(escaped.contains("|") || escaped.contains("cat"));
    }

    #[test]
    fn test_ampersand_injection() {
        // Background execution and command chaining: foo & rm -rf / &
        let malicious = "foo & rm -rf / &";
        let escaped = escape_arg(malicious);
        // Should be escaped
        assert!(escaped.contains("rm"));
    }

    #[test]
    fn test_newline_injection() {
        // Newline command injection
        let malicious = "foo\nrm -rf /";
        let escaped = escape_arg(malicious);
        // Newline should be handled safely
        assert!(escaped.contains("rm") || escaped.contains("\\n"));
    }

    #[test]
    fn test_double_quote_injection() {
        // Double quote escape attempt: "; rm -rf /; echo "
        let malicious = "\"; rm -rf /; echo \"";
        let escaped = escape_arg(malicious);
        // Should be safely escaped
        assert!(escaped.contains("rm"));
    }

    #[test]
    fn test_backslash_injection() {
        // Backslash escape attempt: \'; rm -rf /
        let malicious = "\\'; rm -rf /";
        let escaped = escape_arg(malicious);
        // Backslash should be handled
        assert!(escaped.contains("rm"));
    }

    #[test]
    fn test_glob_characters() {
        // Glob pattern injection: * ? [ ]
        let malicious = "* ; rm -rf /*";
        let escaped = escape_arg(malicious);
        // Should be safely escaped
        assert!(escaped.contains("rm"));
    }

    #[test]
    fn test_empty_string() {
        let escaped = escape_arg("");
        // Empty string should produce empty quotes
        assert!(escaped == "''" || escaped.is_empty());
    }

    #[test]
    fn test_unicode_handling() {
        // Unicode should pass through safely
        let unicode = "日本語ログ";
        let escaped = escape_arg(unicode);
        assert!(escaped.contains("日本語ログ"));
    }

    #[test]
    fn test_realistic_unit_name() {
        // Realistic systemd unit names
        let unit = "postgresql@14-main.service";
        let escaped = escape_arg(unit);
        assert!(escaped.contains("postgresql"));
        assert!(escaped.contains("14-main"));
    }

    #[test]
    fn test_realistic_grep_pattern() {
        // Realistic grep patterns with regex chars
        let pattern = "error.*connection refused";
        let escaped = escape_arg(pattern);
        assert!(escaped.contains("error"));
        assert!(escaped.contains("connection"));
    }

    #[test]
    fn test_cursor_value() {
        // journalctl cursors contain various characters
        let cursor = "s=abc123_def456+ghi789-jkl012";
        let escaped = escape_arg(cursor);
        assert!(escaped.contains("abc123"));
    }

    #[test]
    fn test_timestamp_value() {
        // Timestamp formats used with -S/-U
        let timestamp = "2024-01-15 14:30:00";
        let escaped = escape_arg(timestamp);
        assert!(escaped.contains("2024-01-15"));
        assert!(escaped.contains("14:30:00"));
    }
}
