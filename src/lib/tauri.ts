import { invoke } from '@tauri-apps/api/core';
import type { JournalFilter, JournalQueryResult, SystemUnit, BootInfo } from './types';

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
