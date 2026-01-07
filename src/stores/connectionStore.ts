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
    }),
    {
      name: 'journal-reader-connection',
      partialize: (state) => ({
        // Only persist hosts list, not connection state
        hosts: state.hosts,
      }),
    }
  )
);
