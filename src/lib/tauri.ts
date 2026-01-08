import { invoke } from '@tauri-apps/api/core';
import type {
  JournalFilter,
  JournalQueryResult,
  SystemUnit,
  BootInfo,
  StatisticsRequest,
  JournalStatistics,
  RemoteHost,
  RemoteHostInput,
  ConnectionState,
  TestConnectionResult,
  HostKeyInfo,
  StoredHostKey,
} from './types';

// ============================================================================
// Local Journal Commands
// ============================================================================

export async function queryJournal(filter: JournalFilter): Promise<JournalQueryResult> {
  return invoke<JournalQueryResult>('query_journal', { filter });
}

export async function listUnits(): Promise<SystemUnit[]> {
  return invoke<SystemUnit[]>('list_units');
}

export async function listBoots(): Promise<BootInfo[]> {
  return invoke<BootInfo[]>('list_boots');
}

export async function getLogCount(filter: JournalFilter): Promise<number> {
  return invoke<number>('get_log_count', { filter });
}

export async function startFollow(filter: JournalFilter): Promise<void> {
  return invoke<void>('start_follow', { filter });
}

export async function stopFollow(): Promise<void> {
  return invoke<void>('stop_follow');
}

export async function isFollowing(): Promise<boolean> {
  return invoke<boolean>('is_following');
}

export async function getStatistics(
  request: StatisticsRequest
): Promise<JournalStatistics> {
  return invoke<JournalStatistics>('get_statistics', { request });
}

// ============================================================================
// Remote Host Management Commands
// ============================================================================

export async function listRemoteHosts(): Promise<RemoteHost[]> {
  return invoke<RemoteHost[]>('list_remote_hosts');
}

export async function getRemoteHost(id: string): Promise<RemoteHost | null> {
  return invoke<RemoteHost | null>('get_remote_host', { id });
}

export async function addRemoteHost(input: RemoteHostInput): Promise<RemoteHost> {
  return invoke<RemoteHost>('add_remote_host', { input });
}

export async function updateRemoteHost(id: string, input: RemoteHostInput): Promise<RemoteHost> {
  return invoke<RemoteHost>('update_remote_host', { id, input });
}

export async function deleteRemoteHost(id: string): Promise<void> {
  return invoke<void>('delete_remote_host', { id });
}

// ============================================================================
// Remote Connection Commands
// ============================================================================

export async function connectToHost(hostId: string, password?: string): Promise<void> {
  return invoke<void>('connect_to_host', { hostId, password });
}

export async function disconnectFromHost(): Promise<void> {
  return invoke<void>('disconnect_from_host');
}

export async function getConnectionState(): Promise<ConnectionState> {
  return invoke<ConnectionState>('get_connection_state');
}

export async function testHostConnection(
  hostId: string,
  password?: string
): Promise<TestConnectionResult> {
  return invoke<TestConnectionResult>('test_host_connection', { hostId, password });
}

export async function connectToHostAcceptKey(
  hostId: string,
  password?: string
): Promise<void> {
  return invoke<void>('connect_to_host_accept_key', { hostId, password });
}

// ============================================================================
// Host Key Management Commands
// ============================================================================

export async function getHostKeyInfo(
  hostname: string,
  port: number
): Promise<StoredHostKey | null> {
  return invoke<StoredHostKey | null>('get_host_key_info', { hostname, port });
}

export async function fetchHostKey(hostId: string): Promise<HostKeyInfo> {
  return invoke<HostKeyInfo>('fetch_host_key', { hostId });
}

export async function acceptHostKey(hostId: string): Promise<HostKeyInfo> {
  return invoke<HostKeyInfo>('accept_host_key', { hostId });
}

export async function removeHostKey(hostname: string, port: number): Promise<boolean> {
  return invoke<boolean>('remove_host_key', { hostname, port });
}

// ============================================================================
// Remote Journal Commands
// ============================================================================

export async function queryRemoteJournal(filter: JournalFilter): Promise<JournalQueryResult> {
  return invoke<JournalQueryResult>('query_remote_journal', { filter });
}

export async function getRemoteLogCount(filter: JournalFilter): Promise<number> {
  return invoke<number>('get_remote_log_count', { filter });
}

export async function listRemoteUnits(): Promise<SystemUnit[]> {
  return invoke<SystemUnit[]>('list_remote_units');
}

export async function listRemoteBoots(): Promise<BootInfo[]> {
  return invoke<BootInfo[]>('list_remote_boots');
}

export async function getRemoteStatistics(
  request: StatisticsRequest
): Promise<JournalStatistics> {
  return invoke<JournalStatistics>('get_remote_statistics', { request });
}

export async function startRemoteFollow(
  filter: JournalFilter,
  password?: string
): Promise<void> {
  console.log('[tauri] startRemoteFollow called with filter:', JSON.stringify(filter, null, 2));
  console.log('[tauri] filter.priorities:', filter.priorities);
  return invoke<void>('start_remote_follow', { filter, password });
}

export async function stopRemoteFollow(): Promise<void> {
  return invoke<void>('stop_remote_follow');
}

export async function isRemoteFollowing(): Promise<boolean> {
  return invoke<boolean>('is_remote_following');
}

// ============================================================================
// Keyring (Secure Password Storage) Commands
// ============================================================================

/**
 * Check if the system keyring is available for secure password storage.
 * Returns false on headless systems or when no keyring service is available.
 */
export async function isKeyringAvailable(): Promise<boolean> {
  return invoke<boolean>('is_keyring_available');
}

/**
 * Save a password for a host in the system keyring.
 */
export async function saveHostPassword(hostId: string, password: string): Promise<void> {
  return invoke<void>('save_host_password', { hostId, password });
}

/**
 * Retrieve a saved password for a host from the system keyring.
 * Returns null if no password is stored for this host.
 */
export async function getHostPassword(hostId: string): Promise<string | null> {
  return invoke<string | null>('get_host_password', { hostId });
}

/**
 * Delete a saved password for a host from the system keyring.
 * Returns true if a password was deleted, false if no password was stored.
 */
export async function deleteHostPassword(hostId: string): Promise<boolean> {
  return invoke<boolean>('delete_host_password', { hostId });
}
