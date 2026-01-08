import { beforeEach, expect, it, vi, describe } from 'vitest';
import { useOfflineStore } from '../offlineStore';
import { DEFAULT_OFFLINE_SETTINGS } from '../../lib/offlineTypes';
import type { SyncState, StorageStats, SyncResult, SyncProgressEvent } from '../../lib/offlineTypes';

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock the offlineTauri module
vi.mock('../../lib/offlineTauri', () => ({
  getAllSyncStates: vi.fn(),
  getAllStorageStats: vi.fn(),
  getOfflineSettings: vi.fn(),
  updateOfflineSettings: vi.fn(),
  isOfflineMode: vi.fn(),
  setOfflineMode: vi.fn(),
  triggerSync: vi.fn(),
  cancelSync: vi.fn(),
  deleteOfflineLogs: vi.fn(),
}));

import {
  getAllSyncStates,
  getAllStorageStats,
  getOfflineSettings,
  updateOfflineSettings,
  isOfflineMode,
  setOfflineMode,
  triggerSync,
  cancelSync,
  deleteOfflineLogs,
} from '../../lib/offlineTauri';

const mockedGetAllSyncStates = vi.mocked(getAllSyncStates);
const mockedGetAllStorageStats = vi.mocked(getAllStorageStats);
const mockedGetOfflineSettings = vi.mocked(getOfflineSettings);
const mockedUpdateOfflineSettings = vi.mocked(updateOfflineSettings);
const mockedIsOfflineMode = vi.mocked(isOfflineMode);
const mockedSetOfflineMode = vi.mocked(setOfflineMode);
const mockedTriggerSync = vi.mocked(triggerSync);
const mockedCancelSync = vi.mocked(cancelSync);
const mockedDeleteOfflineLogs = vi.mocked(deleteOfflineLogs);

const initialState = useOfflineStore.getState();

beforeEach(() => {
  // Reset store to initial state
  useOfflineStore.setState(initialState, true);
  // Reset all mocks
  vi.clearAllMocks();
});

describe('initial state', () => {
  it('initializes with correct defaults', () => {
    const state = useOfflineStore.getState();
    expect(state.isOfflineMode).toBe(false);
    expect(state.syncStates).toEqual(new Map());
    expect(state.storageStats).toEqual(new Map());
    expect(state.settings).toEqual(DEFAULT_OFFLINE_SETTINGS);
    expect(state.currentSync).toBeNull();
    expect(state.isLoadingSyncStates).toBe(false);
    expect(state.isLoadingStorageStats).toBe(false);
    expect(state.isLoadingSettings).toBe(false);
  });
});

describe('setOfflineMode', () => {
  it('sets offline mode to true', async () => {
    mockedSetOfflineMode.mockResolvedValueOnce(undefined);

    await useOfflineStore.getState().setOfflineMode(true);

    expect(mockedSetOfflineMode).toHaveBeenCalledWith(true);
    expect(useOfflineStore.getState().isOfflineMode).toBe(true);
  });

  it('sets offline mode to false', async () => {
    useOfflineStore.setState({ isOfflineMode: true });
    mockedSetOfflineMode.mockResolvedValueOnce(undefined);

    await useOfflineStore.getState().setOfflineMode(false);

    expect(mockedSetOfflineMode).toHaveBeenCalledWith(false);
    expect(useOfflineStore.getState().isOfflineMode).toBe(false);
  });

  it('reverts on error', async () => {
    mockedSetOfflineMode.mockRejectedValueOnce(new Error('Failed'));
    mockedIsOfflineMode.mockResolvedValueOnce(false);

    await expect(useOfflineStore.getState().setOfflineMode(true)).rejects.toThrow('Failed');
    expect(useOfflineStore.getState().isOfflineMode).toBe(false);
  });
});

describe('loadSyncStates', () => {
  it('loads sync states from backend', async () => {
    const syncStates: SyncState[] = [
      {
        hostId: 'host-1',
        lastSyncTimestamp: 1000,
        lastCursor: 'cursor-1',
        syncStatus: 'completed',
        syncError: null,
        entriesSynced: 100,
      },
      {
        hostId: 'host-2',
        lastSyncTimestamp: 2000,
        lastCursor: 'cursor-2',
        syncStatus: 'never',
        syncError: null,
        entriesSynced: 0,
      },
    ];
    mockedGetAllSyncStates.mockResolvedValueOnce(syncStates);

    await useOfflineStore.getState().loadSyncStates();

    const state = useOfflineStore.getState();
    expect(state.isLoadingSyncStates).toBe(false);
    expect(state.syncStates.size).toBe(2);
    expect(state.syncStates.get('host-1')).toEqual(syncStates[0]);
    expect(state.syncStates.get('host-2')).toEqual(syncStates[1]);
  });

  it('sets loading state while loading', async () => {
    let resolvePromise: () => void;
    const promise = new Promise<SyncState[]>((resolve) => {
      resolvePromise = () => resolve([]);
    });
    mockedGetAllSyncStates.mockReturnValueOnce(promise);

    const loadPromise = useOfflineStore.getState().loadSyncStates();
    expect(useOfflineStore.getState().isLoadingSyncStates).toBe(true);

    resolvePromise!();
    await loadPromise;
    expect(useOfflineStore.getState().isLoadingSyncStates).toBe(false);
  });

  it('handles error', async () => {
    mockedGetAllSyncStates.mockRejectedValueOnce(new Error('Network error'));

    await useOfflineStore.getState().loadSyncStates();

    const state = useOfflineStore.getState();
    expect(state.isLoadingSyncStates).toBe(false);
    expect(state.syncStatesError).toBe('Network error');
  });
});

describe('loadStorageStats', () => {
  it('loads storage stats from backend', async () => {
    const stats: StorageStats[] = [
      {
        hostId: 'host-1',
        entryCount: 500,
        oldestTimestamp: 1000,
        newestTimestamp: 2000,
        dbSizeBytes: 1024000,
      },
    ];
    mockedGetAllStorageStats.mockResolvedValueOnce(stats);

    await useOfflineStore.getState().loadStorageStats();

    const state = useOfflineStore.getState();
    expect(state.isLoadingStorageStats).toBe(false);
    expect(state.storageStats.size).toBe(1);
    expect(state.storageStats.get('host-1')).toEqual(stats[0]);
  });

  it('handles error', async () => {
    mockedGetAllStorageStats.mockRejectedValueOnce(new Error('Database error'));

    await useOfflineStore.getState().loadStorageStats();

    const state = useOfflineStore.getState();
    expect(state.isLoadingStorageStats).toBe(false);
    expect(state.storageStatsError).toBe('Database error');
  });
});

describe('loadSettings', () => {
  it('loads settings from backend', async () => {
    const settings = {
      enabled: true,
      retentionDays: 60,
      maxEntries: 50000,
      autoSync: false,
    };
    mockedGetOfflineSettings.mockResolvedValueOnce(settings);

    await useOfflineStore.getState().loadSettings();

    const state = useOfflineStore.getState();
    expect(state.isLoadingSettings).toBe(false);
    expect(state.settings).toEqual(settings);
  });

  it('handles error', async () => {
    mockedGetOfflineSettings.mockRejectedValueOnce(new Error('Config error'));

    await useOfflineStore.getState().loadSettings();

    const state = useOfflineStore.getState();
    expect(state.isLoadingSettings).toBe(false);
    expect(state.settingsError).toBe('Config error');
  });
});

describe('updateSettings', () => {
  it('updates settings', async () => {
    const newSettings = {
      enabled: true,
      retentionDays: 90,
      maxEntries: 200000,
      autoSync: true,
    };
    mockedUpdateOfflineSettings.mockResolvedValueOnce(undefined);

    await useOfflineStore.getState().updateSettings(newSettings);

    expect(mockedUpdateOfflineSettings).toHaveBeenCalledWith(newSettings);
    expect(useOfflineStore.getState().settings).toEqual(newSettings);
  });

  it('reloads settings on error', async () => {
    const currentSettings = useOfflineStore.getState().settings;
    mockedUpdateOfflineSettings.mockRejectedValueOnce(new Error('Failed'));
    mockedGetOfflineSettings.mockResolvedValueOnce(currentSettings);

    const newSettings = { ...currentSettings, retentionDays: 999 };

    await expect(useOfflineStore.getState().updateSettings(newSettings)).rejects.toThrow('Failed');
    expect(mockedGetOfflineSettings).toHaveBeenCalled();
  });
});

describe('triggerSync', () => {
  it('triggers sync and updates state on success', async () => {
    const result: SyncResult = {
      hostId: 'host-1',
      success: true,
      entriesSynced: 50,
      totalEntries: 150,
      error: null,
      cancelled: false,
    };
    mockedTriggerSync.mockResolvedValueOnce(result);
    mockedGetAllStorageStats.mockResolvedValueOnce([]);

    const syncResult = await useOfflineStore.getState().triggerSync('host-1');

    expect(mockedTriggerSync).toHaveBeenCalledWith('host-1');
    expect(syncResult).toEqual(result);

    const state = useOfflineStore.getState();
    const hostState = state.syncStates.get('host-1');
    expect(hostState?.syncStatus).toBe('completed');
    expect(hostState?.entriesSynced).toBe(150);
  });

  it('sets in_progress state during sync', async () => {
    let resolvePromise: (result: SyncResult) => void;
    const promise = new Promise<SyncResult>((resolve) => {
      resolvePromise = resolve;
    });
    mockedTriggerSync.mockReturnValueOnce(promise);

    const syncPromise = useOfflineStore.getState().triggerSync('host-1');

    // Check that state is in_progress
    expect(useOfflineStore.getState().syncStates.get('host-1')?.syncStatus).toBe('in_progress');

    mockedGetAllStorageStats.mockResolvedValueOnce([]);
    resolvePromise!({
      hostId: 'host-1',
      success: true,
      entriesSynced: 10,
      totalEntries: 10,
      error: null,
      cancelled: false,
    });
    await syncPromise;
  });

  it('handles sync failure', async () => {
    mockedTriggerSync.mockRejectedValueOnce(new Error('Connection failed'));

    await expect(useOfflineStore.getState().triggerSync('host-1')).rejects.toThrow('Connection failed');

    const hostState = useOfflineStore.getState().syncStates.get('host-1');
    expect(hostState?.syncStatus).toBe('failed');
    expect(hostState?.syncError).toBe('Connection failed');
  });

  it('handles cancelled sync', async () => {
    const result: SyncResult = {
      hostId: 'host-1',
      success: false,
      entriesSynced: 25,
      totalEntries: 100,
      error: null,
      cancelled: true,
    };
    mockedTriggerSync.mockResolvedValueOnce(result);
    mockedGetAllStorageStats.mockResolvedValueOnce([]);

    await useOfflineStore.getState().triggerSync('host-1');

    const hostState = useOfflineStore.getState().syncStates.get('host-1');
    expect(hostState?.syncStatus).toBe('never');
  });
});

describe('cancelSync', () => {
  it('calls cancel API', async () => {
    mockedCancelSync.mockResolvedValueOnce(undefined);

    await useOfflineStore.getState().cancelSync('host-1');

    expect(mockedCancelSync).toHaveBeenCalledWith('host-1');
  });
});

describe('deleteOfflineLogs', () => {
  it('deletes logs and updates state', async () => {
    // Set up initial state
    const syncStates = new Map<string, SyncState>();
    syncStates.set('host-1', {
      hostId: 'host-1',
      lastSyncTimestamp: 1000,
      lastCursor: 'cursor-1',
      syncStatus: 'completed',
      syncError: null,
      entriesSynced: 100,
    });
    const storageStats = new Map<string, StorageStats>();
    storageStats.set('host-1', {
      hostId: 'host-1',
      entryCount: 100,
      oldestTimestamp: 1000,
      newestTimestamp: 2000,
      dbSizeBytes: 5000,
    });
    useOfflineStore.setState({ syncStates, storageStats });

    mockedDeleteOfflineLogs.mockResolvedValueOnce(100);

    const deleted = await useOfflineStore.getState().deleteOfflineLogs('host-1');

    expect(deleted).toBe(100);
    expect(mockedDeleteOfflineLogs).toHaveBeenCalledWith('host-1');

    const state = useOfflineStore.getState();
    expect(state.storageStats.has('host-1')).toBe(false);
    expect(state.syncStates.get('host-1')?.syncStatus).toBe('never');
    expect(state.syncStates.get('host-1')?.entriesSynced).toBe(0);
  });
});

describe('updateSyncProgress', () => {
  it('updates current sync progress', () => {
    const progress: SyncProgressEvent = {
      hostId: 'host-1',
      status: 'fetching',
      entriesSynced: 50,
      totalEntries: 100,
      batchSize: 50,
      error: null,
    };

    useOfflineStore.getState().updateSyncProgress(progress);

    expect(useOfflineStore.getState().currentSync).toEqual(progress);
  });

  it('clears progress when null', () => {
    useOfflineStore.setState({
      currentSync: {
        hostId: 'host-1',
        status: 'fetching',
        entriesSynced: 50,
        totalEntries: 100,
        batchSize: 50,
        error: null,
      },
    });

    useOfflineStore.getState().updateSyncProgress(null);

    expect(useOfflineStore.getState().currentSync).toBeNull();
  });

  it('updates sync state based on progress status', () => {
    const progress: SyncProgressEvent = {
      hostId: 'host-1',
      status: 'completed',
      entriesSynced: 100,
      totalEntries: 100,
      batchSize: 0,
      error: null,
    };

    useOfflineStore.getState().updateSyncProgress(progress);

    const hostState = useOfflineStore.getState().syncStates.get('host-1');
    expect(hostState?.syncStatus).toBe('completed');
    expect(hostState?.entriesSynced).toBe(100);
  });
});

describe('updateSyncState', () => {
  it('updates sync state for a host', () => {
    useOfflineStore.getState().updateSyncState('host-1', {
      syncStatus: 'completed',
      entriesSynced: 200,
      lastSyncTimestamp: 5000,
    });

    const hostState = useOfflineStore.getState().syncStates.get('host-1');
    expect(hostState?.syncStatus).toBe('completed');
    expect(hostState?.entriesSynced).toBe(200);
    expect(hostState?.lastSyncTimestamp).toBe(5000);
  });

  it('preserves existing values when updating partially', () => {
    useOfflineStore.getState().updateSyncState('host-1', {
      syncStatus: 'completed',
      entriesSynced: 100,
      lastSyncTimestamp: 1000,
      lastCursor: 'cursor-original',
    });

    useOfflineStore.getState().updateSyncState('host-1', {
      syncStatus: 'in_progress',
    });

    const hostState = useOfflineStore.getState().syncStates.get('host-1');
    expect(hostState?.syncStatus).toBe('in_progress');
    expect(hostState?.entriesSynced).toBe(100);
    expect(hostState?.lastCursor).toBe('cursor-original');
  });
});
