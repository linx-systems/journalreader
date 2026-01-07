//! SSH host key verification and known_hosts file management.
//!
//! This module provides MITM attack protection by verifying SSH host keys
//! against a stored known_hosts file.

use crate::error::JournalError;
use ssh2::Session;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// Represents a stored SSH host key
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredHostKey {
    /// The hostname:port combination
    pub host: String,
    /// The key type (e.g., "ssh-ed25519", "ssh-rsa", "ecdsa-sha2-nistp256")
    pub key_type: String,
    /// Base64-encoded public key
    pub key_data: String,
    /// SHA256 fingerprint for display
    pub fingerprint: String,
    /// When the key was first seen/accepted
    pub first_seen: String,
}

/// Result of host key verification
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum HostKeyStatus {
    /// Host key matches stored key - connection is safe
    #[serde(rename = "verified")]
    Verified,
    /// New host - key needs to be accepted by user
    #[serde(rename = "newHost")]
    NewHost {
        fingerprint: String,
        key_type: String,
    },
    /// Host key changed - potential MITM attack!
    #[serde(rename = "keyChanged")]
    KeyChanged {
        old_fingerprint: String,
        new_fingerprint: String,
        old_key_type: String,
        new_key_type: String,
    },
}

/// Information about a host's SSH key for UI display
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostKeyInfo {
    pub host: String,
    pub port: u16,
    pub fingerprint: String,
    pub key_type: String,
}

/// Storage for known SSH host keys
pub struct KnownHostsStorage {
    hosts: HashMap<String, StoredHostKey>,
    file_path: PathBuf,
}

impl KnownHostsStorage {
    /// Create a new storage instance
    pub fn new() -> Result<Self, JournalError> {
        let file_path = Self::get_file_path()?;
        let hosts = if file_path.exists() {
            let content = fs::read_to_string(&file_path).map_err(|e| {
                JournalError::ConfigError(format!("Failed to read known_hosts: {}", e))
            })?;
            serde_json::from_str(&content).map_err(|e| {
                JournalError::ConfigError(format!("Failed to parse known_hosts: {}", e))
            })?
        } else {
            HashMap::new()
        };

        Ok(Self { hosts, file_path })
    }

    /// Get the path to the known_hosts file
    fn get_file_path() -> Result<PathBuf, JournalError> {
        let config_dir = dirs::config_dir().ok_or_else(|| {
            JournalError::ConfigError("Could not find config directory".to_string())
        })?;

        let app_config_dir = config_dir.join("journal-reader");

        // Create directory if it doesn't exist
        if !app_config_dir.exists() {
            fs::create_dir_all(&app_config_dir).map_err(|e| {
                JournalError::ConfigError(format!("Failed to create config directory: {}", e))
            })?;
        }

        Ok(app_config_dir.join("known_hosts.json"))
    }

    /// Save the known hosts to disk with secure permissions
    fn save(&self) -> Result<(), JournalError> {
        let content = serde_json::to_string_pretty(&self.hosts)
            .map_err(|e| JournalError::ConfigError(format!("Failed to serialize known_hosts: {}", e)))?;

        fs::write(&self.file_path, &content)
            .map_err(|e| JournalError::ConfigError(format!("Failed to write known_hosts: {}", e)))?;

        // Set restrictive permissions (0600) on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = fs::Permissions::from_mode(0o600);
            fs::set_permissions(&self.file_path, perms).map_err(|e| {
                JournalError::ConfigError(format!("Failed to set permissions on known_hosts: {}", e))
            })?;
        }

        Ok(())
    }

    /// Create a host key identifier from hostname and port
    fn make_host_key(hostname: &str, port: u16) -> String {
        format!("[{}]:{}", hostname, port)
    }

    /// Verify a host's key against stored keys
    pub fn verify_host_key(
        &self,
        session: &Session,
        hostname: &str,
        port: u16,
    ) -> Result<HostKeyStatus, JournalError> {
        let (key_type, fingerprint, _key_data) = Self::extract_host_key_info(session)?;
        let host_key = Self::make_host_key(hostname, port);

        match self.hosts.get(&host_key) {
            None => {
                // New host - needs user confirmation
                Ok(HostKeyStatus::NewHost {
                    fingerprint,
                    key_type,
                })
            }
            Some(stored) => {
                if stored.fingerprint == fingerprint {
                    // Key matches - safe to proceed
                    Ok(HostKeyStatus::Verified)
                } else {
                    // Key changed - potential MITM attack!
                    Ok(HostKeyStatus::KeyChanged {
                        old_fingerprint: stored.fingerprint.clone(),
                        new_fingerprint: fingerprint,
                        old_key_type: stored.key_type.clone(),
                        new_key_type: key_type,
                    })
                }
            }
        }
    }

    /// Accept and store a new host key
    pub fn accept_host_key(
        &mut self,
        session: &Session,
        hostname: &str,
        port: u16,
    ) -> Result<(), JournalError> {
        let (key_type, fingerprint, key_data) = Self::extract_host_key_info(session)?;
        let host_key = Self::make_host_key(hostname, port);

        let stored_key = StoredHostKey {
            host: host_key.clone(),
            key_type,
            key_data,
            fingerprint,
            first_seen: chrono::Utc::now().to_rfc3339(),
        };

        self.hosts.insert(host_key, stored_key);
        self.save()
    }

    /// Remove a host key (useful when user wants to re-accept after change)
    pub fn remove_host_key(&mut self, hostname: &str, port: u16) -> Result<bool, JournalError> {
        let host_key = Self::make_host_key(hostname, port);
        let removed = self.hosts.remove(&host_key).is_some();
        if removed {
            self.save()?;
        }
        Ok(removed)
    }

    /// Get stored host key info for a host
    pub fn get_host_key(&self, hostname: &str, port: u16) -> Option<&StoredHostKey> {
        let host_key = Self::make_host_key(hostname, port);
        self.hosts.get(&host_key)
    }

    /// Extract host key information from an SSH session
    fn extract_host_key_info(session: &Session) -> Result<(String, String, String), JournalError> {
        let (key_bytes, key_type) = session.host_key().ok_or_else(|| {
            JournalError::SshConnectionError("No host key available from server".to_string())
        })?;

        let key_type_str = match key_type {
            ssh2::HostKeyType::Rsa => "ssh-rsa",
            ssh2::HostKeyType::Dss => "ssh-dss",
            ssh2::HostKeyType::Ecdsa256 => "ecdsa-sha2-nistp256",
            ssh2::HostKeyType::Ecdsa384 => "ecdsa-sha2-nistp384",
            ssh2::HostKeyType::Ecdsa521 => "ecdsa-sha2-nistp521",
            ssh2::HostKeyType::Ed25519 => "ssh-ed25519",
            ssh2::HostKeyType::Unknown => "unknown",
        };

        // Calculate SHA256 fingerprint
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(key_bytes);
        let hash = hasher.finalize();
        let fingerprint = format!("SHA256:{}", base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD_NO_PAD,
            hash
        ));

        // Base64 encode the key data for storage
        let key_data = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            key_bytes
        );

        Ok((key_type_str.to_string(), fingerprint, key_data))
    }

    /// Get host key info from a session for UI display
    pub fn get_session_host_key_info(
        session: &Session,
        hostname: &str,
        port: u16,
    ) -> Result<HostKeyInfo, JournalError> {
        let (key_type, fingerprint, _) = Self::extract_host_key_info(session)?;
        Ok(HostKeyInfo {
            host: hostname.to_string(),
            port,
            fingerprint,
            key_type,
        })
    }
}

impl Default for KnownHostsStorage {
    fn default() -> Self {
        Self::new().expect("Failed to initialize known hosts storage")
    }
}

/// Thread-safe wrapper for known hosts storage
pub type SharedKnownHostsStorage = Arc<Mutex<KnownHostsStorage>>;

pub fn new_shared_known_hosts_storage() -> Result<SharedKnownHostsStorage, JournalError> {
    let storage = KnownHostsStorage::new()?;
    Ok(Arc::new(Mutex::new(storage)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_make_host_key() {
        assert_eq!(
            KnownHostsStorage::make_host_key("example.com", 22),
            "[example.com]:22"
        );
        assert_eq!(
            KnownHostsStorage::make_host_key("192.168.1.1", 2222),
            "[192.168.1.1]:2222"
        );
    }
}
