//! Secure password storage using the system keyring.
//!
//! This module provides functionality to securely store and retrieve passwords
//! for remote hosts using the operating system's native credential storage:
//! - Linux: Secret Service (GNOME Keyring, KWallet, etc.)
//! - macOS: Keychain
//! - Windows: Credential Manager

use crate::error::JournalError;

/// Service name used for keyring entries
const SERVICE_NAME: &str = "journal-reader";

/// Generate a unique key for a host's password in the keyring
fn make_key(host_id: &str) -> String {
    format!("host-password-{}", host_id)
}

/// Check if the system keyring is available and functional.
///
/// Returns true if passwords can be stored securely, false otherwise.
/// On systems without a keyring service (e.g., headless servers),
/// this will return false.
pub fn is_keyring_available() -> bool {
    // Try to create a test entry to verify keyring is working
    let entry = match keyring::Entry::new(SERVICE_NAME, "availability-test") {
        Ok(e) => e,
        Err(_) => return false,
    };

    // Try to set and then delete a test credential
    // This verifies the keyring service is actually functional
    match entry.set_password("test") {
        Ok(_) => {
            // Clean up the test entry
            let _ = entry.delete_credential();
            true
        }
        Err(_) => false,
    }
}

/// Save a password for a host in the system keyring.
///
/// # Arguments
/// * `host_id` - The unique identifier of the host
/// * `password` - The password to store
///
/// # Errors
/// Returns an error if the keyring is not available or the operation fails.
pub fn save_password(host_id: &str, password: &str) -> Result<(), JournalError> {
    let key = make_key(host_id);
    let entry = keyring::Entry::new(SERVICE_NAME, &key)
        .map_err(|e| JournalError::KeyringError(format!("Failed to create keyring entry: {}", e)))?;

    entry
        .set_password(password)
        .map_err(|e| JournalError::KeyringError(format!("Failed to save password: {}", e)))?;

    Ok(())
}

/// Retrieve a password for a host from the system keyring.
///
/// # Arguments
/// * `host_id` - The unique identifier of the host
///
/// # Returns
/// * `Ok(Some(password))` - If the password was found
/// * `Ok(None)` - If no password is stored for this host
/// * `Err(...)` - If an error occurred accessing the keyring
pub fn get_password(host_id: &str) -> Result<Option<String>, JournalError> {
    let key = make_key(host_id);
    let entry = keyring::Entry::new(SERVICE_NAME, &key)
        .map_err(|e| JournalError::KeyringError(format!("Failed to create keyring entry: {}", e)))?;

    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(JournalError::KeyringError(format!(
            "Failed to retrieve password: {}",
            e
        ))),
    }
}

/// Delete a password for a host from the system keyring.
///
/// # Arguments
/// * `host_id` - The unique identifier of the host
///
/// # Returns
/// * `Ok(true)` - If the password was deleted
/// * `Ok(false)` - If no password was stored for this host
/// * `Err(...)` - If an error occurred accessing the keyring
pub fn delete_password(host_id: &str) -> Result<bool, JournalError> {
    let key = make_key(host_id);
    let entry = keyring::Entry::new(SERVICE_NAME, &key)
        .map_err(|e| JournalError::KeyringError(format!("Failed to create keyring entry: {}", e)))?;

    match entry.delete_credential() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(JournalError::KeyringError(format!(
            "Failed to delete password: {}",
            e
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_make_key() {
        assert_eq!(make_key("test-id"), "host-password-test-id");
        assert_eq!(
            make_key("550e8400-e29b-41d4-a716-446655440000"),
            "host-password-550e8400-e29b-41d4-a716-446655440000"
        );
    }

    // Note: Integration tests for actual keyring operations would require
    // a running keyring service and are better suited for manual testing
    // or CI environments with keyring support.
}
