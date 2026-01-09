import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStore, LOCAL_TAB_ID } from "../connectionStore";
import type { RemoteHost, ConnectionState } from "../../lib/types";

// Mock the tauri module
vi.mock("../../lib/tauri", () => ({
  listRemoteHosts: vi.fn(),
  addRemoteHost: vi.fn(),
  updateRemoteHost: vi.fn(),
  deleteRemoteHost: vi.fn(),
  connectToHost: vi.fn(),
  disconnectFromHost: vi.fn(),
  getConnectionState: vi.fn(),
}));

import {
  listRemoteHosts,
  addRemoteHost,
  updateRemoteHost,
  deleteRemoteHost,
  connectToHost,
  disconnectFromHost,
  getConnectionState,
} from "../../lib/tauri";

// Helper to create test hosts
function createTestHost(id: string, hostname: string): RemoteHost {
  return {
    id,
    name: `Test Host ${id}`,
    hostname,
    port: 22,
    username: "testuser",
    authMethod: "password",
    sudoRequired: false,
    savePassword: false,
  };
}

const initialState = useConnectionStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  useConnectionStore.setState(initialState, true);
});

describe("connectionStore", () => {
  describe("initial state", () => {
    it("initializes with default values", () => {
      const state = useConnectionStore.getState();
      expect(state.hosts).toEqual([]);
      expect(state.isLoadingHosts).toBe(false);
      expect(state.hostsError).toBeNull();
      expect(state.connectedHostId).toBeNull();
      expect(state.connectionStatus).toBe("disconnected");
      expect(state.connectionError).toBeNull();
      expect(state.sessionPassword).toBeNull();
      expect(state.openTabs).toEqual([LOCAL_TAB_ID]);
      expect(state.activeTabId).toBe(LOCAL_TAB_ID);
    });

    it("exports LOCAL_TAB_ID constant", () => {
      expect(LOCAL_TAB_ID).toBe("local");
    });
  });

  describe("loadHosts", () => {
    it("loads hosts successfully", async () => {
      const hosts = [createTestHost("1", "host1.example.com")];
      vi.mocked(listRemoteHosts).mockResolvedValue(hosts);

      const store = useConnectionStore.getState();
      await store.loadHosts();

      const state = useConnectionStore.getState();
      expect(state.hosts).toEqual(hosts);
      expect(state.isLoadingHosts).toBe(false);
      expect(state.hostsError).toBeNull();
    });

    it("sets loading state while fetching", async () => {
      let resolvePromise: (value: RemoteHost[]) => void;
      const promise = new Promise<RemoteHost[]>((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(listRemoteHosts).mockReturnValue(promise);

      const store = useConnectionStore.getState();
      const loadPromise = store.loadHosts();

      expect(useConnectionStore.getState().isLoadingHosts).toBe(true);

      resolvePromise!([]);
      await loadPromise;

      expect(useConnectionStore.getState().isLoadingHosts).toBe(false);
    });

    it("handles errors when loading hosts", async () => {
      vi.mocked(listRemoteHosts).mockRejectedValue(new Error("Network error"));

      const store = useConnectionStore.getState();
      await store.loadHosts();

      const state = useConnectionStore.getState();
      expect(state.hosts).toEqual([]);
      expect(state.isLoadingHosts).toBe(false);
      expect(state.hostsError).toBe("Network error");
    });

    it("handles non-Error thrown values", async () => {
      vi.mocked(listRemoteHosts).mockRejectedValue("String error");

      const store = useConnectionStore.getState();
      await store.loadHosts();

      const state = useConnectionStore.getState();
      expect(state.hostsError).toBe("String error");
    });
  });

  describe("addHost", () => {
    it("adds a new host", async () => {
      const newHost = createTestHost("new", "newhost.example.com");
      vi.mocked(addRemoteHost).mockResolvedValue(newHost);

      const store = useConnectionStore.getState();
      const result = await store.addHost({
        name: newHost.name,
        hostname: newHost.hostname,
        port: newHost.port,
        username: newHost.username,
        authMethod: "password",
        sudoRequired: false,
        savePassword: false,
      });

      expect(result).toEqual(newHost);
      expect(useConnectionStore.getState().hosts).toContainEqual(newHost);
    });

    it("appends to existing hosts", async () => {
      const existingHost = createTestHost("1", "existing.example.com");
      const newHost = createTestHost("2", "new.example.com");

      useConnectionStore.setState({ hosts: [existingHost] });
      vi.mocked(addRemoteHost).mockResolvedValue(newHost);

      const store = useConnectionStore.getState();
      await store.addHost({
        name: newHost.name,
        hostname: newHost.hostname,
        port: 22,
        username: "user",
        authMethod: "password",
        sudoRequired: false,
        savePassword: false,
      });

      expect(useConnectionStore.getState().hosts).toHaveLength(2);
    });
  });

  describe("updateHost", () => {
    it("updates an existing host", async () => {
      const originalHost = createTestHost("1", "original.example.com");
      const updatedHost = { ...originalHost, hostname: "updated.example.com" };

      useConnectionStore.setState({ hosts: [originalHost] });
      vi.mocked(updateRemoteHost).mockResolvedValue(updatedHost);

      const store = useConnectionStore.getState();
      const result = await store.updateHost("1", {
        name: updatedHost.name,
        hostname: updatedHost.hostname,
        port: 22,
        username: "user",
        authMethod: "password",
        sudoRequired: false,
        savePassword: false,
      });

      expect(result.hostname).toBe("updated.example.com");
      expect(useConnectionStore.getState().hosts[0].hostname).toBe("updated.example.com");
    });

    it("only updates the matching host", async () => {
      const host1 = createTestHost("1", "host1.example.com");
      const host2 = createTestHost("2", "host2.example.com");
      const updatedHost2 = { ...host2, hostname: "updated.example.com" };

      useConnectionStore.setState({ hosts: [host1, host2] });
      vi.mocked(updateRemoteHost).mockResolvedValue(updatedHost2);

      const store = useConnectionStore.getState();
      await store.updateHost("2", {
        name: updatedHost2.name,
        hostname: updatedHost2.hostname,
        port: 22,
        username: "user",
        authMethod: "password",
        sudoRequired: false,
        savePassword: false,
      });

      const state = useConnectionStore.getState();
      expect(state.hosts[0].hostname).toBe("host1.example.com");
      expect(state.hosts[1].hostname).toBe("updated.example.com");
    });
  });

  describe("deleteHost", () => {
    it("removes a host from the list", async () => {
      const host1 = createTestHost("1", "host1.example.com");
      const host2 = createTestHost("2", "host2.example.com");

      useConnectionStore.setState({ hosts: [host1, host2] });
      vi.mocked(deleteRemoteHost).mockResolvedValue(undefined);

      const store = useConnectionStore.getState();
      await store.deleteHost("1");

      const state = useConnectionStore.getState();
      expect(state.hosts).toHaveLength(1);
      expect(state.hosts[0].id).toBe("2");
    });

    it("disconnects if deleting the connected host", async () => {
      const host = createTestHost("1", "host.example.com");

      useConnectionStore.setState({
        hosts: [host],
        connectedHostId: "1",
        connectionStatus: "connected",
      });
      vi.mocked(deleteRemoteHost).mockResolvedValue(undefined);

      const store = useConnectionStore.getState();
      await store.deleteHost("1");

      const state = useConnectionStore.getState();
      expect(state.connectedHostId).toBeNull();
      expect(state.connectionStatus).toBe("disconnected");
    });

    it("preserves connection if deleting a different host", async () => {
      const host1 = createTestHost("1", "host1.example.com");
      const host2 = createTestHost("2", "host2.example.com");

      useConnectionStore.setState({
        hosts: [host1, host2],
        connectedHostId: "1",
        connectionStatus: "connected",
      });
      vi.mocked(deleteRemoteHost).mockResolvedValue(undefined);

      const store = useConnectionStore.getState();
      await store.deleteHost("2");

      const state = useConnectionStore.getState();
      expect(state.connectedHostId).toBe("1");
      expect(state.connectionStatus).toBe("connected");
    });
  });

  describe("connect", () => {
    it("connects to a host successfully", async () => {
      vi.mocked(connectToHost).mockResolvedValue(undefined);

      const store = useConnectionStore.getState();
      await store.connect("host1");

      const state = useConnectionStore.getState();
      expect(state.connectedHostId).toBe("host1");
      expect(state.connectionStatus).toBe("connected");
      expect(state.connectionError).toBeNull();
      expect(state.sessionPassword).toBeNull();
    });

    it("sets connecting status during connection", async () => {
      let resolvePromise: () => void;
      const promise = new Promise<void>((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(connectToHost).mockReturnValue(promise);

      const store = useConnectionStore.getState();
      const connectPromise = store.connect("host1", "password123");

      expect(useConnectionStore.getState().connectionStatus).toBe("connecting");
      expect(useConnectionStore.getState().sessionPassword).toBe("password123");

      resolvePromise!();
      await connectPromise;

      expect(useConnectionStore.getState().connectionStatus).toBe("connected");
      expect(useConnectionStore.getState().sessionPassword).toBeNull();
    });

    it("handles connection errors", async () => {
      vi.mocked(connectToHost).mockRejectedValue(new Error("Connection refused"));

      const store = useConnectionStore.getState();

      await expect(store.connect("host1")).rejects.toThrow("Connection refused");

      const state = useConnectionStore.getState();
      expect(state.connectedHostId).toBeNull();
      expect(state.connectionStatus).toBe("error");
      expect(state.connectionError).toBe("Connection refused");
      expect(state.sessionPassword).toBeNull();
    });

    it("clears previous connection error on new attempt", async () => {
      useConnectionStore.setState({ connectionError: "Previous error" });
      vi.mocked(connectToHost).mockResolvedValue(undefined);

      const store = useConnectionStore.getState();
      await store.connect("host1");

      expect(useConnectionStore.getState().connectionError).toBeNull();
    });
  });

  describe("disconnect", () => {
    it("disconnects from the current host", async () => {
      useConnectionStore.setState({
        connectedHostId: "host1",
        connectionStatus: "connected",
        sessionPassword: "secret",
      });
      vi.mocked(disconnectFromHost).mockResolvedValue(undefined);

      const store = useConnectionStore.getState();
      await store.disconnect();

      const state = useConnectionStore.getState();
      expect(state.connectedHostId).toBeNull();
      expect(state.connectionStatus).toBe("disconnected");
      expect(state.connectionError).toBeNull();
      expect(state.sessionPassword).toBeNull();
    });

    it("resets state even if disconnect API fails", async () => {
      useConnectionStore.setState({
        connectedHostId: "host1",
        connectionStatus: "connected",
      });
      vi.mocked(disconnectFromHost).mockRejectedValue(new Error("API error"));

      const store = useConnectionStore.getState();
      // The disconnect function uses try/finally, so it resets state
      // but doesn't catch the error - we need to catch it here
      try {
        await store.disconnect();
      } catch {
        // Expected to throw
      }

      const state = useConnectionStore.getState();
      expect(state.connectedHostId).toBeNull();
      expect(state.connectionStatus).toBe("disconnected");
    });
  });

  describe("refreshConnectionState", () => {
    it("updates state from backend", async () => {
      const connectionState: ConnectionState = {
        hostId: "host1",
        status: "connected",
        errorMessage: null,
      };
      vi.mocked(getConnectionState).mockResolvedValue(connectionState);

      const store = useConnectionStore.getState();
      await store.refreshConnectionState();

      const state = useConnectionStore.getState();
      expect(state.connectedHostId).toBe("host1");
      expect(state.connectionStatus).toBe("connected");
      expect(state.connectionError).toBeNull();
    });

    it("handles error message from backend", async () => {
      const connectionState: ConnectionState = {
        hostId: null,
        status: "error",
        errorMessage: "Connection lost",
      };
      vi.mocked(getConnectionState).mockResolvedValue(connectionState);

      const store = useConnectionStore.getState();
      await store.refreshConnectionState();

      const state = useConnectionStore.getState();
      expect(state.connectionError).toBe("Connection lost");
    });

    it("assumes disconnected if API call fails", async () => {
      useConnectionStore.setState({
        connectedHostId: "host1",
        connectionStatus: "connected",
      });
      vi.mocked(getConnectionState).mockRejectedValue(new Error("API error"));

      const store = useConnectionStore.getState();
      await store.refreshConnectionState();

      const state = useConnectionStore.getState();
      expect(state.connectedHostId).toBeNull();
      expect(state.connectionStatus).toBe("disconnected");
      expect(state.connectionError).toBeNull();
    });
  });

  describe("setSessionPassword", () => {
    it("sets the session password", () => {
      const store = useConnectionStore.getState();
      store.setSessionPassword("mysecret");

      expect(useConnectionStore.getState().sessionPassword).toBe("mysecret");
    });

    it("clears the session password", () => {
      useConnectionStore.setState({ sessionPassword: "existing" });

      const store = useConnectionStore.getState();
      store.setSessionPassword(null);

      expect(useConnectionStore.getState().sessionPassword).toBeNull();
    });
  });

  describe("getConnectedHost", () => {
    it("returns the connected host", () => {
      const host = createTestHost("1", "host.example.com");
      useConnectionStore.setState({
        hosts: [host],
        connectedHostId: "1",
      });

      const store = useConnectionStore.getState();
      expect(store.getConnectedHost()).toEqual(host);
    });

    it("returns null when not connected", () => {
      const host = createTestHost("1", "host.example.com");
      useConnectionStore.setState({
        hosts: [host],
        connectedHostId: null,
      });

      const store = useConnectionStore.getState();
      expect(store.getConnectedHost()).toBeNull();
    });

    it("returns null when connected host not in list", () => {
      const host = createTestHost("1", "host.example.com");
      useConnectionStore.setState({
        hosts: [host],
        connectedHostId: "nonexistent",
      });

      const store = useConnectionStore.getState();
      expect(store.getConnectedHost()).toBeNull();
    });
  });

  describe("tab management", () => {
    describe("openTab", () => {
      it("opens a new tab and makes it active", () => {
        const store = useConnectionStore.getState();
        store.openTab("host1");

        const state = useConnectionStore.getState();
        expect(state.openTabs).toEqual([LOCAL_TAB_ID, "host1"]);
        expect(state.activeTabId).toBe("host1");
      });

      it("switches to existing tab without duplicating", () => {
        useConnectionStore.setState({
          openTabs: [LOCAL_TAB_ID, "host1"],
          activeTabId: LOCAL_TAB_ID,
        });

        const store = useConnectionStore.getState();
        store.openTab("host1");

        const state = useConnectionStore.getState();
        expect(state.openTabs).toEqual([LOCAL_TAB_ID, "host1"]);
        expect(state.activeTabId).toBe("host1");
      });

      it("can open multiple tabs", () => {
        const store = useConnectionStore.getState();
        store.openTab("host1");
        store.openTab("host2");
        store.openTab("host3");

        const state = useConnectionStore.getState();
        expect(state.openTabs).toEqual([LOCAL_TAB_ID, "host1", "host2", "host3"]);
        expect(state.activeTabId).toBe("host3");
      });
    });

    describe("closeTab", () => {
      it("closes a tab", () => {
        useConnectionStore.setState({
          openTabs: [LOCAL_TAB_ID, "host1", "host2"],
          activeTabId: LOCAL_TAB_ID,
        });

        const store = useConnectionStore.getState();
        store.closeTab("host1");

        const state = useConnectionStore.getState();
        expect(state.openTabs).toEqual([LOCAL_TAB_ID, "host2"]);
      });

      it("switches to adjacent tab when closing active tab", () => {
        useConnectionStore.setState({
          openTabs: [LOCAL_TAB_ID, "host1", "host2"],
          activeTabId: "host1",
        });

        const store = useConnectionStore.getState();
        store.closeTab("host1");

        const state = useConnectionStore.getState();
        expect(state.openTabs).toEqual([LOCAL_TAB_ID, "host2"]);
        expect(state.activeTabId).toBe("host2");
      });

      it("switches to left tab when closing last tab", () => {
        useConnectionStore.setState({
          openTabs: [LOCAL_TAB_ID, "host1", "host2"],
          activeTabId: "host2",
        });

        const store = useConnectionStore.getState();
        store.closeTab("host2");

        const state = useConnectionStore.getState();
        expect(state.openTabs).toEqual([LOCAL_TAB_ID, "host1"]);
        expect(state.activeTabId).toBe("host1");
      });

      it("always keeps at least the local tab", () => {
        useConnectionStore.setState({
          openTabs: ["host1"],
          activeTabId: "host1",
        });

        const store = useConnectionStore.getState();
        store.closeTab("host1");

        const state = useConnectionStore.getState();
        expect(state.openTabs).toEqual([LOCAL_TAB_ID]);
        expect(state.activeTabId).toBe(LOCAL_TAB_ID);
      });

      it("preserves active tab when closing different tab", () => {
        useConnectionStore.setState({
          openTabs: [LOCAL_TAB_ID, "host1", "host2"],
          activeTabId: "host2",
        });

        const store = useConnectionStore.getState();
        store.closeTab("host1");

        const state = useConnectionStore.getState();
        expect(state.activeTabId).toBe("host2");
      });
    });

    describe("setActiveTab", () => {
      it("sets the active tab", () => {
        useConnectionStore.setState({
          openTabs: [LOCAL_TAB_ID, "host1", "host2"],
          activeTabId: LOCAL_TAB_ID,
        });

        const store = useConnectionStore.getState();
        store.setActiveTab("host2");

        expect(useConnectionStore.getState().activeTabId).toBe("host2");
      });

      it("does nothing when setting non-open tab as active", () => {
        useConnectionStore.setState({
          openTabs: [LOCAL_TAB_ID, "host1"],
          activeTabId: LOCAL_TAB_ID,
        });

        const store = useConnectionStore.getState();
        store.setActiveTab("nonexistent");

        expect(useConnectionStore.getState().activeTabId).toBe(LOCAL_TAB_ID);
      });
    });
  });
});
