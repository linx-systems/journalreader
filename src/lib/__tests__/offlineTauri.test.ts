import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  queryOfflineJournal,
  getOfflineLogCount,
  getSyncState,
  getAllSyncStates,
  getStorageStats,
  getAllStorageStats,
  deleteOfflineLogs,
  getOfflineSettings,
  updateOfflineSettings,
  isOfflineMode,
  setOfflineMode,
  triggerSync,
  triggerSyncAll,
  cancelSync,
  canResumeSync,
  exportOfflineLogs,
} from '../offlineTauri';
import type {
  SyncState,
  StorageStats,
  OfflineSettings,
  SyncResult,
  ExportFormat,
} from '../offlineTypes';
import type { JournalFilter, JournalQueryResult } from '../types';
import { DEFAULT_FILTER } from '../types';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

beforeEach(() => {
  invokeMock.mockReset();
});

// ============================================================================
// Offline Journal Query Commands
// ============================================================================

describe('queryOfflineJournal', () => {
  it('calls invoke with hostId and filter', async () => {
    const result: JournalQueryResult = { entries: [], hasMore: false };
    const filter: JournalFilter = { ...DEFAULT_FILTER };
    invokeMock.mockResolvedValueOnce(result);

    const response = await queryOfflineJournal('host-1', filter);

    expect(invokeMock).toHaveBeenCalledWith('query_offline_journal', {
      hostId: 'host-1',
      filter,
    });
    expect(response).toBe(result);
  });

  it('returns entries when present', async () => {
    const result: JournalQueryResult = {
      entries: [
        {
          cursor: 'cursor-1',
          realtimeTimestamp: 1234567890,
          bootId: 'boot-123',
          message: 'Test message',
          priority: 6,
        },
      ],
      hasMore: true,
      cursorStart: 'cursor-1',
      cursorEnd: 'cursor-1',
    };
    const filter: JournalFilter = { ...DEFAULT_FILTER, limit: 100 };
    invokeMock.mockResolvedValueOnce(result);

    const response = await queryOfflineJournal('host-2', filter);

    expect(response.entries).toHaveLength(1);
    expect(response.hasMore).toBe(true);
  });

  it('propagates errors from invoke', async () => {
    const filter: JournalFilter = { ...DEFAULT_FILTER };
    invokeMock.mockRejectedValueOnce(new Error('Database error'));

    await expect(queryOfflineJournal('host-1', filter)).rejects.toThrow(
      'Database error'
    );
  });
});

describe('getOfflineLogCount', () => {
  it('calls invoke with hostId and filter', async () => {
    const filter: JournalFilter = { ...DEFAULT_FILTER };
    invokeMock.mockResolvedValueOnce(42);

    const response = await getOfflineLogCount('host-1', filter);

    expect(invokeMock).toHaveBeenCalledWith('get_offline_log_count', {
      hostId: 'host-1',
      filter,
    });
    expect(response).toBe(42);
  });

  it('returns zero when no entries match', async () => {
    const filter: JournalFilter = { ...DEFAULT_FILTER };
    invokeMock.mockResolvedValueOnce(0);

    const response = await getOfflineLogCount('host-1', filter);

    expect(response).toBe(0);
  });
});

// ============================================================================
// Sync State Commands
// ============================================================================

describe('getSyncState', () => {
  it('calls invoke with hostId', async () => {
    const syncState: SyncState = {
      hostId: 'host-1',
      lastSyncTimestamp: 1234567890,
      lastCursor: 'cursor-abc',
      syncStatus: 'completed',
      syncError: null,
      entriesSynced: 100,
    };
    invokeMock.mockResolvedValueOnce(syncState);

    const response = await getSyncState('host-1');

    expect(invokeMock).toHaveBeenCalledWith('get_sync_state', {
      hostId: 'host-1',
    });
    expect(response).toBe(syncState);
  });

  it('returns state with in_progress status', async () => {
    const syncState: SyncState = {
      hostId: 'host-1',
      lastSyncTimestamp: 0,
      lastCursor: null,
      syncStatus: 'in_progress',
      syncError: null,
      entriesSynced: 50,
    };
    invokeMock.mockResolvedValueOnce(syncState);

    const response = await getSyncState('host-1');

    expect(response.syncStatus).toBe('in_progress');
  });

  it('returns state with failed status and error', async () => {
    const syncState: SyncState = {
      hostId: 'host-1',
      lastSyncTimestamp: 1234567890,
      lastCursor: 'cursor-abc',
      syncStatus: 'failed',
      syncError: 'Connection lost',
      entriesSynced: 75,
    };
    invokeMock.mockResolvedValueOnce(syncState);

    const response = await getSyncState('host-1');

    expect(response.syncStatus).toBe('failed');
    expect(response.syncError).toBe('Connection lost');
  });
});

describe('getAllSyncStates', () => {
  it('calls invoke without arguments', async () => {
    const syncStates: SyncState[] = [
      {
        hostId: 'host-1',
        lastSyncTimestamp: 1234567890,
        lastCursor: 'cursor-1',
        syncStatus: 'completed',
        syncError: null,
        entriesSynced: 100,
      },
      {
        hostId: 'host-2',
        lastSyncTimestamp: 1234567891,
        lastCursor: 'cursor-2',
        syncStatus: 'never',
        syncError: null,
        entriesSynced: 0,
      },
    ];
    invokeMock.mockResolvedValueOnce(syncStates);

    const response = await getAllSyncStates();

    expect(invokeMock).toHaveBeenCalledWith('get_all_sync_states');
    expect(response).toBe(syncStates);
  });

  it('returns empty array when no hosts have been synced', async () => {
    invokeMock.mockResolvedValueOnce([]);

    const response = await getAllSyncStates();

    expect(response).toEqual([]);
  });
});

// ============================================================================
// Storage Statistics Commands
// ============================================================================

describe('getStorageStats', () => {
  it('calls invoke with hostId', async () => {
    const stats: StorageStats = {
      hostId: 'host-1',
      entryCount: 1000,
      oldestTimestamp: 1234567890000,
      newestTimestamp: 1234567899000,
      dbSizeBytes: 1048576,
    };
    invokeMock.mockResolvedValueOnce(stats);

    const response = await getStorageStats('host-1');

    expect(invokeMock).toHaveBeenCalledWith('get_storage_stats', {
      hostId: 'host-1',
    });
    expect(response).toBe(stats);
  });

  it('returns stats with null timestamps for empty storage', async () => {
    const stats: StorageStats = {
      hostId: 'host-1',
      entryCount: 0,
      oldestTimestamp: null,
      newestTimestamp: null,
      dbSizeBytes: 4096,
    };
    invokeMock.mockResolvedValueOnce(stats);

    const response = await getStorageStats('host-1');

    expect(response.entryCount).toBe(0);
    expect(response.oldestTimestamp).toBeNull();
    expect(response.newestTimestamp).toBeNull();
  });
});

describe('getAllStorageStats', () => {
  it('calls invoke without arguments', async () => {
    const stats: StorageStats[] = [
      {
        hostId: 'host-1',
        entryCount: 1000,
        oldestTimestamp: 1234567890000,
        newestTimestamp: 1234567899000,
        dbSizeBytes: 1048576,
      },
      {
        hostId: 'host-2',
        entryCount: 500,
        oldestTimestamp: 1234567880000,
        newestTimestamp: 1234567895000,
        dbSizeBytes: 524288,
      },
    ];
    invokeMock.mockResolvedValueOnce(stats);

    const response = await getAllStorageStats();

    expect(invokeMock).toHaveBeenCalledWith('get_all_storage_stats');
    expect(response).toBe(stats);
  });

  it('returns empty array when no storage stats exist', async () => {
    invokeMock.mockResolvedValueOnce([]);

    const response = await getAllStorageStats();

    expect(response).toEqual([]);
  });
});

// ============================================================================
// Data Management Commands
// ============================================================================

describe('deleteOfflineLogs', () => {
  it('calls invoke with hostId', async () => {
    invokeMock.mockResolvedValueOnce(150);

    const response = await deleteOfflineLogs('host-1');

    expect(invokeMock).toHaveBeenCalledWith('delete_offline_logs', {
      hostId: 'host-1',
    });
    expect(response).toBe(150);
  });

  it('returns zero when no logs to delete', async () => {
    invokeMock.mockResolvedValueOnce(0);

    const response = await deleteOfflineLogs('host-1');

    expect(response).toBe(0);
  });
});

// ============================================================================
// Offline Settings Commands
// ============================================================================

describe('getOfflineSettings', () => {
  it('calls invoke without arguments', async () => {
    const settings: OfflineSettings = {
      enabled: true,
      syncBoots: 5,
      autoSync: true,
    };
    invokeMock.mockResolvedValueOnce(settings);

    const response = await getOfflineSettings();

    expect(invokeMock).toHaveBeenCalledWith('get_offline_settings');
    expect(response).toBe(settings);
  });

  it('returns settings with disabled offline mode', async () => {
    const settings: OfflineSettings = {
      enabled: false,
      syncBoots: 3,
      autoSync: false,
    };
    invokeMock.mockResolvedValueOnce(settings);

    const response = await getOfflineSettings();

    expect(response.enabled).toBe(false);
    expect(response.autoSync).toBe(false);
  });
});

describe('updateOfflineSettings', () => {
  it('calls invoke with settings', async () => {
    const settings: OfflineSettings = {
      enabled: true,
      syncBoots: 10,
      autoSync: false,
    };
    invokeMock.mockResolvedValueOnce(undefined);

    await updateOfflineSettings(settings);

    expect(invokeMock).toHaveBeenCalledWith('update_offline_settings', {
      settings,
    });
  });

  it('propagates errors from invoke', async () => {
    const settings: OfflineSettings = {
      enabled: true,
      syncBoots: 5,
      autoSync: true,
    };
    invokeMock.mockRejectedValueOnce(new Error('Settings save failed'));

    await expect(updateOfflineSettings(settings)).rejects.toThrow(
      'Settings save failed'
    );
  });
});

// ============================================================================
// Offline Mode Commands
// ============================================================================

describe('isOfflineMode', () => {
  it('calls invoke without arguments', async () => {
    invokeMock.mockResolvedValueOnce(true);

    const response = await isOfflineMode();

    expect(invokeMock).toHaveBeenCalledWith('is_offline_mode');
    expect(response).toBe(true);
  });

  it('returns false when not in offline mode', async () => {
    invokeMock.mockResolvedValueOnce(false);

    const response = await isOfflineMode();

    expect(response).toBe(false);
  });
});

describe('setOfflineMode', () => {
  it('calls invoke with offline true', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await setOfflineMode(true);

    expect(invokeMock).toHaveBeenCalledWith('set_offline_mode', {
      offline: true,
    });
  });

  it('calls invoke with offline false', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await setOfflineMode(false);

    expect(invokeMock).toHaveBeenCalledWith('set_offline_mode', {
      offline: false,
    });
  });
});

// ============================================================================
// Sync Commands
// ============================================================================

describe('triggerSync', () => {
  it('calls invoke with hostId', async () => {
    const result: SyncResult = {
      hostId: 'host-1',
      success: true,
      entriesSynced: 100,
      totalEntries: 500,
      error: null,
      cancelled: false,
    };
    invokeMock.mockResolvedValueOnce(result);

    const response = await triggerSync('host-1');

    expect(invokeMock).toHaveBeenCalledWith('trigger_sync', {
      hostId: 'host-1',
    });
    expect(response).toBe(result);
  });

  it('returns result with failed sync', async () => {
    const result: SyncResult = {
      hostId: 'host-1',
      success: false,
      entriesSynced: 50,
      totalEntries: 450,
      error: 'Connection timeout',
      cancelled: false,
    };
    invokeMock.mockResolvedValueOnce(result);

    const response = await triggerSync('host-1');

    expect(response.success).toBe(false);
    expect(response.error).toBe('Connection timeout');
  });

  it('returns result with cancelled sync', async () => {
    const result: SyncResult = {
      hostId: 'host-1',
      success: false,
      entriesSynced: 25,
      totalEntries: 425,
      error: null,
      cancelled: true,
    };
    invokeMock.mockResolvedValueOnce(result);

    const response = await triggerSync('host-1');

    expect(response.success).toBe(false);
    expect(response.cancelled).toBe(true);
  });
});

describe('triggerSyncAll', () => {
  it('calls invoke without arguments', async () => {
    const results: SyncResult[] = [
      {
        hostId: 'host-1',
        success: true,
        entriesSynced: 100,
        totalEntries: 500,
        error: null,
        cancelled: false,
      },
      {
        hostId: 'host-2',
        success: true,
        entriesSynced: 50,
        totalEntries: 200,
        error: null,
        cancelled: false,
      },
    ];
    invokeMock.mockResolvedValueOnce(results);

    const response = await triggerSyncAll();

    expect(invokeMock).toHaveBeenCalledWith('trigger_sync_all');
    expect(response).toBe(results);
  });

  it('returns mixed success/failure results', async () => {
    const results: SyncResult[] = [
      {
        hostId: 'host-1',
        success: true,
        entriesSynced: 100,
        totalEntries: 500,
        error: null,
        cancelled: false,
      },
      {
        hostId: 'host-2',
        success: false,
        entriesSynced: 0,
        totalEntries: 150,
        error: 'Host unreachable',
        cancelled: false,
      },
    ];
    invokeMock.mockResolvedValueOnce(results);

    const response = await triggerSyncAll();

    expect(response).toHaveLength(2);
    expect(response[0].success).toBe(true);
    expect(response[1].success).toBe(false);
    expect(response[1].error).toBe('Host unreachable');
  });

  it('returns empty array when no hosts configured', async () => {
    invokeMock.mockResolvedValueOnce([]);

    const response = await triggerSyncAll();

    expect(response).toEqual([]);
  });
});

describe('cancelSync', () => {
  it('calls invoke with hostId', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await cancelSync('host-1');

    expect(invokeMock).toHaveBeenCalledWith('cancel_sync', {
      hostId: 'host-1',
    });
  });

  it('propagates errors from invoke', async () => {
    invokeMock.mockRejectedValueOnce(new Error('No sync in progress'));

    await expect(cancelSync('host-1')).rejects.toThrow('No sync in progress');
  });
});

describe('canResumeSync', () => {
  it('calls invoke with hostId', async () => {
    invokeMock.mockResolvedValueOnce(true);

    const response = await canResumeSync('host-1');

    expect(invokeMock).toHaveBeenCalledWith('can_resume_sync', {
      hostId: 'host-1',
    });
    expect(response).toBe(true);
  });

  it('returns false when sync cannot be resumed', async () => {
    invokeMock.mockResolvedValueOnce(false);

    const response = await canResumeSync('host-1');

    expect(response).toBe(false);
  });
});

// ============================================================================
// Export Commands
// ============================================================================

describe('exportOfflineLogs', () => {
  it('calls invoke with all parameters for json format', async () => {
    const filter: JournalFilter = { ...DEFAULT_FILTER };
    const format: ExportFormat = 'json';
    const path = '/tmp/export.json';
    invokeMock.mockResolvedValueOnce(100);

    const response = await exportOfflineLogs('host-1', filter, format, path);

    expect(invokeMock).toHaveBeenCalledWith('export_offline_logs', {
      hostId: 'host-1',
      filter,
      format,
      path,
    });
    expect(response).toBe(100);
  });

  it('calls invoke with text format', async () => {
    const filter: JournalFilter = { ...DEFAULT_FILTER };
    const format: ExportFormat = 'text';
    const path = '/tmp/export.txt';
    invokeMock.mockResolvedValueOnce(50);

    const response = await exportOfflineLogs('host-1', filter, format, path);

    expect(invokeMock).toHaveBeenCalledWith('export_offline_logs', {
      hostId: 'host-1',
      filter,
      format,
      path,
    });
    expect(response).toBe(50);
  });

  it('calls invoke with csv format', async () => {
    const filter: JournalFilter = { ...DEFAULT_FILTER };
    const format: ExportFormat = 'csv';
    const path = '/tmp/export.csv';
    invokeMock.mockResolvedValueOnce(75);

    const response = await exportOfflineLogs('host-1', filter, format, path);

    expect(invokeMock).toHaveBeenCalledWith('export_offline_logs', {
      hostId: 'host-1',
      filter,
      format,
      path,
    });
    expect(response).toBe(75);
  });

  it('returns zero when no entries match filter', async () => {
    const filter: JournalFilter = { ...DEFAULT_FILTER };
    const format: ExportFormat = 'json';
    const path = '/tmp/export.json';
    invokeMock.mockResolvedValueOnce(0);

    const response = await exportOfflineLogs('host-1', filter, format, path);

    expect(response).toBe(0);
  });

  it('propagates errors from invoke', async () => {
    const filter: JournalFilter = { ...DEFAULT_FILTER };
    const format: ExportFormat = 'json';
    const path = '/invalid/path/export.json';
    invokeMock.mockRejectedValueOnce(new Error('Permission denied'));

    await expect(
      exportOfflineLogs('host-1', filter, format, path)
    ).rejects.toThrow('Permission denied');
  });
});
