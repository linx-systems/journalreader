import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RemoteHost, RemoteHostInput, ConnectionStatus } from '../lib/types';
import {
  listRemoteHosts,
  addRemoteHost as addRemoteHostApi,
  updateRemoteHost as updateRemoteHostApi,
  deleteRemoteHost as deleteRemoteHostApi,
  connectToHost as connectToHostApi,
  disconnectFromHost as disconnectFromHostApi,
  getConnectionState,
} from '../lib/tauri';

// Special constant for local machine tab
export const LOCAL_TAB_ID = 'local';

interface ConnectionStore {
  // Remote hosts
  hosts: RemoteHost[];
  isLoadingHosts: boolean;
  hostsError: string | null;

  // Connection state
  connectedHostId: string | null;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;

  // Password for current session (not persisted)
  sessionPassword: string | null;

  // Multi-host tab state
  openTabs: string[];      // Host IDs ('local' | host.id)
  activeTabId: string;     // Currently visible tab

  // Actions
  loadHosts: () => Promise<void>;
  addHost: (input: RemoteHostInput) => Promise<RemoteHost>;
  updateHost: (id: string, input: RemoteHostInput) => Promise<RemoteHost>;
  deleteHost: (id: string) => Promise<void>;
  connect: (hostId: string, password?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  refreshConnectionState: () => Promise<void>;
  setSessionPassword: (password: string | null) => void;
  getConnectedHost: () => RemoteHost | null;

  // Tab actions
  openTab: (hostId: string) => void;
  closeTab: (hostId: string) => void;
  setActiveTab: (hostId: string) => void;
}

export const useConnectionStore = create<ConnectionStore>()(
  persist(
    (set, get) => ({
      // Initial state
      hosts: [],
      isLoadingHosts: false,
      hostsError: null,
      connectedHostId: null,
      connectionStatus: 'disconnected',
      connectionError: null,
      sessionPassword: null,

      // Tab state - always start with local tab open and active
      openTabs: [LOCAL_TAB_ID],
      activeTabId: LOCAL_TAB_ID,

      loadHosts: async () => {
        set({ isLoadingHosts: true, hostsError: null });
        try {
          const hosts = await listRemoteHosts();
          set({ hosts, isLoadingHosts: false });
        } catch (error) {
          set({
            hostsError: error instanceof Error ? error.message : String(error),
            isLoadingHosts: false,
          });
        }
      },

      addHost: async (input: RemoteHostInput) => {
        const host = await addRemoteHostApi(input);
        set((state) => ({ hosts: [...state.hosts, host] }));
        return host;
      },

      updateHost: async (id: string, input: RemoteHostInput) => {
        const host = await updateRemoteHostApi(id, input);
        set((state) => ({
          hosts: state.hosts.map((h) => (h.id === id ? host : h)),
        }));
        return host;
      },

      deleteHost: async (id: string) => {
        await deleteRemoteHostApi(id);
        set((state) => ({
          hosts: state.hosts.filter((h) => h.id !== id),
          // Disconnect if deleting the connected host
          connectedHostId: state.connectedHostId === id ? null : state.connectedHostId,
          connectionStatus: state.connectedHostId === id ? 'disconnected' : state.connectionStatus,
        }));
      },

      connect: async (hostId: string, password?: string) => {
        set({
          connectionStatus: 'connecting',
          connectionError: null,
          sessionPassword: password ?? null,
        });

        try {
          await connectToHostApi(hostId, password);
          set({
            connectedHostId: hostId,
            connectionStatus: 'connected',
            connectionError: null,
            // Clear password immediately after successful connection
            sessionPassword: null,
          });
        } catch (error) {
          set({
            connectedHostId: null,
            connectionStatus: 'error',
            connectionError: error instanceof Error ? error.message : String(error),
            sessionPassword: null,
          });
          throw error;
        }
      },

      disconnect: async () => {
        try {
          await disconnectFromHostApi();
        } finally {
          set({
            connectedHostId: null,
            connectionStatus: 'disconnected',
            connectionError: null,
            sessionPassword: null,
          });
        }
      },

      refreshConnectionState: async () => {
        try {
          const state = await getConnectionState();
          set({
            connectedHostId: state.hostId,
            connectionStatus: state.status,
            connectionError: state.errorMessage,
          });
        } catch (error) {
          // If we can't get the connection state, assume disconnected
          set({
            connectedHostId: null,
            connectionStatus: 'disconnected',
            connectionError: null,
          });
        }
      },

      setSessionPassword: (password: string | null) => {
        set({ sessionPassword: password });
      },

      getConnectedHost: () => {
        const { hosts, connectedHostId } = get();
        if (!connectedHostId) return null;
        return hosts.find((h) => h.id === connectedHostId) ?? null;
      },

      // Tab management actions
      openTab: (hostId: string) => {
        set((state) => {
          // Don't add duplicate tabs
          if (state.openTabs.includes(hostId)) {
            // Just switch to it
            return { activeTabId: hostId };
          }
          return {
            openTabs: [...state.openTabs, hostId],
            activeTabId: hostId,
          };
        });
      },

      closeTab: (hostId: string) => {
        set((state) => {
          const newTabs = state.openTabs.filter((id) => id !== hostId);
          // Always keep at least one tab (local)
          if (newTabs.length === 0) {
            return {
              openTabs: [LOCAL_TAB_ID],
              activeTabId: LOCAL_TAB_ID,
            };
          }
          // If closing the active tab, switch to an adjacent tab
          let newActiveTabId = state.activeTabId;
          if (state.activeTabId === hostId) {
            const closedIndex = state.openTabs.indexOf(hostId);
            // Prefer the tab to the right, otherwise the left
            newActiveTabId = newTabs[Math.min(closedIndex, newTabs.length - 1)];
          }
          return {
            openTabs: newTabs,
            activeTabId: newActiveTabId,
          };
        });
      },

      setActiveTab: (hostId: string) => {
        const { openTabs } = get();
        // Only set active if the tab is open
        if (openTabs.includes(hostId)) {
          set({ activeTabId: hostId });
        }
      },
    }),
    {
      name: 'journal-reader-connection',
      partialize: (state) => ({
        // Only persist hosts list and open tabs
        hosts: state.hosts,
        openTabs: state.openTabs,
        activeTabId: state.activeTabId,
      }),
    }
  )
);
