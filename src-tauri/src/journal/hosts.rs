use crate::error::JournalError;
use crate::journal::types::{RemoteHost, RemoteHostInput};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

/// Get the application config directory path
pub fn get_app_config_dir() -> Result<PathBuf, JournalError> {
    let config_dir = dirs::config_dir()
        .ok_or_else(|| JournalError::ConfigError("Could not find config directory".to_string()))?;

    let app_config_dir = config_dir.join("journal-reader");

    // Create directory if it doesn't exist
    if !app_config_dir.exists() {
        fs::create_dir_all(&app_config_dir).map_err(|e| {
            JournalError::ConfigError(format!("Failed to create config directory: {}", e))
        })?;
    }

    Ok(app_config_dir)
}

/// Get the path to the hosts configuration file
fn get_hosts_file_path() -> Result<PathBuf, JournalError> {
    Ok(get_app_config_dir()?.join("hosts.json"))
}

/// Check if a file has insecure permissions (world-readable)
/// Returns a warning message if the file is world-readable, None otherwise
#[cfg(unix)]
pub fn check_file_permissions(path: &PathBuf) -> Option<String> {
    use std::os::unix::fs::PermissionsExt;

    if !path.exists() {
        return None;
    }

    match fs::metadata(path) {
        Ok(metadata) => {
            let mode = metadata.permissions().mode();
            // Check if group or others have any read permissions (bits 044)
            if mode & 0o044 != 0 {
                Some(format!(
                    "WARNING: {} has insecure permissions (mode {:o}). \
                    This file may contain sensitive data. \
                    Recommend: chmod 600 {}",
                    path.display(),
                    mode & 0o777,
                    path.display()
                ))
            } else {
                None
            }
        }
        Err(_) => None,
    }
}

#[cfg(not(unix))]
pub fn check_file_permissions(_path: &PathBuf) -> Option<String> {
    // Permission checks are only relevant on Unix systems
    None
}

/// Fix insecure file permissions by setting mode 0600
#[cfg(unix)]
#[allow(dead_code)]
pub fn fix_file_permissions(path: &PathBuf) -> Result<(), JournalError> {
    use std::os::unix::fs::PermissionsExt;

    if !path.exists() {
        return Ok(());
    }

    let perms = fs::Permissions::from_mode(0o600);
    fs::set_permissions(path, perms).map_err(|e| {
        JournalError::ConfigError(format!(
            "Failed to fix permissions on {}: {}",
            path.display(),
            e
        ))
    })
}

#[cfg(not(unix))]
#[allow(dead_code)]
pub fn fix_file_permissions(_path: &PathBuf) -> Result<(), JournalError> {
    Ok(())
}

/// Storage for remote hosts
pub struct HostStorage {
    hosts: Vec<RemoteHost>,
}

impl HostStorage {
    pub fn new() -> Self {
        Self { hosts: Vec::new() }
    }

    /// Load hosts from disk
    pub fn load() -> Result<Self, JournalError> {
        let path = get_hosts_file_path()?;

        if !path.exists() {
            return Ok(Self::new());
        }

        let content = fs::read_to_string(&path)
            .map_err(|e| JournalError::ConfigError(format!("Failed to read hosts file: {}", e)))?;

        let hosts: Vec<RemoteHost> = serde_json::from_str(&content)
            .map_err(|e| JournalError::ConfigError(format!("Failed to parse hosts file: {}", e)))?;

        Ok(Self { hosts })
    }

    /// Save hosts to disk with secure permissions
    pub fn save(&self) -> Result<(), JournalError> {
        let path = get_hosts_file_path()?;

        let content = serde_json::to_string_pretty(&self.hosts)
            .map_err(|e| JournalError::ConfigError(format!("Failed to serialize hosts: {}", e)))?;

        fs::write(&path, &content)
            .map_err(|e| JournalError::ConfigError(format!("Failed to write hosts file: {}", e)))?;

        // Set restrictive permissions (0600) on Unix - file contains sensitive data
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = fs::Permissions::from_mode(0o600);
            fs::set_permissions(&path, perms).map_err(|e| {
                JournalError::ConfigError(format!("Failed to set permissions on hosts file: {}", e))
            })?;
        }

        Ok(())
    }

    /// Get all hosts
    pub fn list(&self) -> &[RemoteHost] {
        &self.hosts
    }

    /// Get a host by ID
    pub fn get(&self, id: &str) -> Option<&RemoteHost> {
        self.hosts.iter().find(|h| h.id == id)
    }

    /// Add a new host
    pub fn add(&mut self, input: RemoteHostInput) -> Result<RemoteHost, JournalError> {
        let host = RemoteHost {
            id: Uuid::new_v4().to_string(),
            name: input.name,
            hostname: input.hostname,
            port: input.port,
            username: input.username,
            auth_method: input.auth_method,
            key_path: input.key_path,
            sudo_required: input.sudo_required,
            save_password: input.save_password,
        };

        self.hosts.push(host.clone());
        self.save()?;

        Ok(host)
    }

    /// Update an existing host
    pub fn update(&mut self, id: &str, input: RemoteHostInput) -> Result<RemoteHost, JournalError> {
        let host = self
            .hosts
            .iter_mut()
            .find(|h| h.id == id)
            .ok_or_else(|| JournalError::HostNotFound(id.to_string()))?;

        host.name = input.name;
        host.hostname = input.hostname;
        host.port = input.port;
        host.username = input.username;
        host.auth_method = input.auth_method;
        host.key_path = input.key_path;
        host.sudo_required = input.sudo_required;
        host.save_password = input.save_password;

        let updated = host.clone();
        self.save()?;

        Ok(updated)
    }

    /// Delete a host
    pub fn delete(&mut self, id: &str) -> Result<(), JournalError> {
        let initial_len = self.hosts.len();
        self.hosts.retain(|h| h.id != id);

        if self.hosts.len() == initial_len {
            return Err(JournalError::HostNotFound(id.to_string()));
        }

        self.save()?;
        Ok(())
    }
}

impl Default for HostStorage {
    fn default() -> Self {
        Self::new()
    }
}

/// Thread-safe wrapper for host storage
pub type SharedHostStorage = Arc<Mutex<HostStorage>>;

pub fn new_shared_host_storage() -> Result<SharedHostStorage, JournalError> {
    let storage = HostStorage::load()?;
    Ok(Arc::new(Mutex::new(storage)))
}
