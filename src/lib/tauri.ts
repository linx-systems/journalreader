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
  return invoke<void>('start_remote_follow', { filter, password });
}

export async function stopRemoteFollow(): Promise<void> {
  return invoke<void>('stop_remote_follow');
}

export async function isRemoteFollowing(): Promise<boolean> {
  return invoke<boolean>('is_remote_following');
}
