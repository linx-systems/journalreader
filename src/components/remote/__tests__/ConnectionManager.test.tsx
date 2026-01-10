import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ConnectionManager } from "../ConnectionManager";
import { useConnectionStore } from "../../../stores/connectionStore";
import type { RemoteHost } from "../../../lib/types";

// Mock the tauri module
vi.mock("../../../lib/tauri", () => ({
  testHostConnection: vi.fn(),
  connectToHostAcceptKey: vi.fn(),
  getHostPassword: vi.fn(),
  saveHostPassword: vi.fn(),
  deleteHostPassword: vi.fn(),
  fetchHostKey: vi.fn(),
  acceptHostKey: vi.fn(),
  removeHostKey: vi.fn(),
  isKeyringAvailable: vi.fn(),
  listRemoteHosts: vi.fn(),
  addRemoteHost: vi.fn(),
  updateRemoteHost: vi.fn(),
  deleteRemoteHost: vi.fn(),
  connectToHost: vi.fn(),
  disconnectFromHost: vi.fn(),
  getConnectionState: vi.fn(),
}));

// Mock errorLogger
vi.mock("../../../lib/errorLogger", () => ({
  logError: vi.fn(),
}));

import {
  testHostConnection,
  connectToHostAcceptKey,
  getHostPassword,
  saveHostPassword,
  deleteHostPassword,
  fetchHostKey,
  listRemoteHosts,
  addRemoteHost,
  updateRemoteHost,
  deleteRemoteHost,
  connectToHost,
  isKeyringAvailable,
} from "../../../lib/tauri";

// Helper to create test hosts
function createTestHost(
  id: string,
  name: string,
  authMethod: "password" | "key" | "agent" = "password",
  savePassword = false
): RemoteHost {
  return {
    id,
    name,
    hostname: `${id}.example.com`,
    port: 22,
    username: "testuser",
    authMethod,
    sudoRequired: false,
    savePassword,
  };
}

const initialStoreState = useConnectionStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  useConnectionStore.setState(initialStoreState, true);
  // Default mock implementations
  vi.mocked(listRemoteHosts).mockResolvedValue([]);
  vi.mocked(isKeyringAvailable).mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
});

describe("ConnectionManager", () => {
  describe("initial rendering", () => {
    it("renders nothing when isOpen is false", () => {
      const { container } = render(
        <ConnectionManager isOpen={false} onClose={vi.fn()} />
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders modal when isOpen is true", async () => {
      render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("Remote Hosts")).toBeInTheDocument();
      });
    });

    it("shows loading state while fetching hosts", async () => {
      let resolvePromise: (hosts: RemoteHost[]) => void;
      const promise = new Promise<RemoteHost[]>((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(listRemoteHosts).mockReturnValue(promise);

      render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

      // Loading state should be visible initially
      expect(
        screen.queryByText("No remote hosts configured")
      ).not.toBeInTheDocument();

      // Resolve the promise
      resolvePromise!([]);

      await waitFor(() => {
        expect(screen.getByText("No remote hosts configured")).toBeInTheDocument();
      });
    });

    it("shows empty state when no hosts configured", async () => {
      vi.mocked(listRemoteHosts).mockResolvedValue([]);

      render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("No remote hosts configured")).toBeInTheDocument();
        expect(
          screen.getByText("Add a host to view logs from remote machines")
        ).toBeInTheDocument();
      });
    });

    it("shows hosts error when loading fails", async () => {
      vi.mocked(listRemoteHosts).mockRejectedValue(new Error("Network error"));

      render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("Network error")).toBeInTheDocument();
      });
    });
  });

  describe("Host CRUD operations", () => {
    describe("List hosts", () => {
      it("displays list of hosts", async () => {
        const hosts = [
          createTestHost("1", "Production Server"),
          createTestHost("2", "Staging Server"),
        ];
        vi.mocked(listRemoteHosts).mockResolvedValue(hosts);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Production Server")).toBeInTheDocument();
          expect(screen.getByText("Staging Server")).toBeInTheDocument();
        });
      });

      it("loads hosts when dialog opens", async () => {
        vi.mocked(listRemoteHosts).mockResolvedValue([]);

        const { rerender } = render(
          <ConnectionManager isOpen={false} onClose={vi.fn()} />
        );

        expect(listRemoteHosts).not.toHaveBeenCalled();

        rerender(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(listRemoteHosts).toHaveBeenCalled();
        });
      });
    });

    describe("Add new host", () => {
      it("opens host editor when Add Host button is clicked", async () => {
        const user = userEvent.setup();
        vi.mocked(listRemoteHosts).mockResolvedValue([]);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Add Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: /add host/i }));

        await waitFor(() => {
          // HostEditor shows "Add Host" heading and form fields with placeholders
          expect(screen.getByText("Display Name *")).toBeInTheDocument();
          expect(screen.getByPlaceholderText("My Server")).toBeInTheDocument();
        });
      });

      it("creates new host on form submission", async () => {
        const user = userEvent.setup();
        vi.mocked(listRemoteHosts).mockResolvedValue([]);
        const newHost = createTestHost("new-id", "New Server", "agent");
        vi.mocked(addRemoteHost).mockResolvedValue(newHost);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Add Host")).toBeInTheDocument();
        });

        // Click Add Host button in footer
        await user.click(screen.getByRole("button", { name: /add host/i }));

        await waitFor(() => {
          expect(screen.getByPlaceholderText("My Server")).toBeInTheDocument();
        });

        // Fill form using placeholders
        await user.type(screen.getByPlaceholderText("My Server"), "New Server");
        await user.type(
          screen.getByPlaceholderText("192.168.1.100 or server.example.com"),
          "new.example.com"
        );
        await user.type(screen.getByPlaceholderText("root"), "admin");

        // Submit - button says "Add Host" when creating
        await user.click(screen.getByRole("button", { name: /add host/i }));

        await waitFor(() => {
          expect(addRemoteHost).toHaveBeenCalledWith(
            expect.objectContaining({
              name: "New Server",
              hostname: "new.example.com",
              username: "admin",
            })
          );
        });
      });

      it("closes editor on cancel", async () => {
        const user = userEvent.setup();
        vi.mocked(listRemoteHosts).mockResolvedValue([]);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Add Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: /add host/i }));

        await waitFor(() => {
          expect(screen.getByRole("heading", { name: /add host/i })).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: /cancel/i }));

        await waitFor(() => {
          expect(screen.getByText("Remote Hosts")).toBeInTheDocument();
        });
      });
    });

    describe("Edit existing host", () => {
      it("opens host editor with existing values when edit is clicked", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Production Server");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Production Server")).toBeInTheDocument();
        });

        await user.click(screen.getByTitle("Edit"));

        await waitFor(() => {
          expect(screen.getByRole("heading", { name: /edit host/i })).toBeInTheDocument();
          expect(screen.getByDisplayValue("Production Server")).toBeInTheDocument();
        });
      });

      it("updates host on form submission", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Production Server");
        const updatedHost = { ...host, name: "Updated Server" };
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(updateRemoteHost).mockResolvedValue(updatedHost);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Production Server")).toBeInTheDocument();
        });

        await user.click(screen.getByTitle("Edit"));

        await waitFor(() => {
          expect(screen.getByDisplayValue("Production Server")).toBeInTheDocument();
        });

        // Clear and type new name
        const nameInput = screen.getByDisplayValue("Production Server");
        await user.clear(nameInput);
        await user.type(nameInput, "Updated Server");

        await user.click(screen.getByRole("button", { name: /save changes/i }));

        await waitFor(() => {
          expect(updateRemoteHost).toHaveBeenCalledWith(
            "1",
            expect.objectContaining({ name: "Updated Server" })
          );
        });
      });
    });

    describe("Delete host", () => {
      it("confirms before deleting host", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Production Server");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(deleteRemoteHost).mockResolvedValue(undefined);

        // Mock window.confirm
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Production Server")).toBeInTheDocument();
        });

        await user.click(screen.getByTitle("Delete"));

        expect(confirmSpy).toHaveBeenCalledWith('Delete host "Production Server"?');
        await waitFor(() => {
          expect(deleteRemoteHost).toHaveBeenCalledWith("1");
        });

        confirmSpy.mockRestore();
      });

      it("does not delete when confirm is cancelled", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Production Server");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);

        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Production Server")).toBeInTheDocument();
        });

        await user.click(screen.getByTitle("Delete"));

        expect(deleteRemoteHost).not.toHaveBeenCalled();

        confirmSpy.mockRestore();
      });

      it("deletes saved password when deleting host with savePassword enabled", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Production Server", "password", true);
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(deleteRemoteHost).mockResolvedValue(undefined);
        vi.mocked(deleteHostPassword).mockResolvedValue(true);

        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Production Server")).toBeInTheDocument();
        });

        await user.click(screen.getByTitle("Delete"));

        await waitFor(() => {
          expect(deleteHostPassword).toHaveBeenCalledWith("1");
          expect(deleteRemoteHost).toHaveBeenCalledWith("1");
        });

        confirmSpy.mockRestore();
      });
    });
  });

  describe("Connection flow", () => {
    describe("Connect to host without saved password", () => {
      it("prompts for password when connecting with password auth and no saved password", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Password Host", "password", false);
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Password Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          expect(screen.getByText(/connect to.*password host/i)).toBeInTheDocument();
          expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
        });
      });

      it("connects without password prompt for key auth", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Key Host", "key");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(connectToHost).mockResolvedValue(undefined);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Key Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          expect(connectToHost).toHaveBeenCalledWith("1", undefined);
        });
      });

      it("connects without password prompt for SSH agent auth", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Agent Host", "agent");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(connectToHost).mockResolvedValue(undefined);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Agent Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          expect(connectToHost).toHaveBeenCalledWith("1", undefined);
        });
      });
    });

    describe("Connect with saved password", () => {
      it("uses saved password from keyring", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Saved Password Host", "password", true);
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(getHostPassword).mockResolvedValue("saved-secret");
        vi.mocked(connectToHost).mockResolvedValue(undefined);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Saved Password Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          expect(getHostPassword).toHaveBeenCalledWith("1");
          expect(connectToHost).toHaveBeenCalledWith("1", "saved-secret");
        });
      });

      it("prompts for password when saved password fails auth", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Outdated Password Host", "password", true);
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(getHostPassword).mockResolvedValue("old-password");
        vi.mocked(connectToHost).mockRejectedValueOnce(
          new Error("Authentication failed")
        );
        vi.mocked(deleteHostPassword).mockResolvedValue(true);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Outdated Password Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          expect(deleteHostPassword).toHaveBeenCalledWith("1");
          expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
        });
      });

      it("prompts for password when keyring returns null", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Empty Keyring Host", "password", true);
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(getHostPassword).mockResolvedValue(null);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Empty Keyring Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
        });
      });

      it("prompts for password on keyring error", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Keyring Error Host", "password", true);
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(getHostPassword).mockRejectedValue(new Error("Keyring unavailable"));

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Keyring Error Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
        });
      });
    });

    describe("Connection success", () => {
      it("updates store on successful connection", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Success Host", "agent");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(connectToHost).mockResolvedValue(undefined);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Success Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          const state = useConnectionStore.getState();
          expect(state.connectedHostId).toBe("1");
          expect(state.connectionStatus).toBe("connected");
        });
      });

      it("shows connected badge on connected host", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Connected Host", "agent");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(connectToHost).mockResolvedValue(undefined);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Connected Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          expect(screen.getByText("Connected")).toBeInTheDocument();
          expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
        });
      });
    });

    describe("Connection failure", () => {
      it("shows error on connection failure", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Failing Host", "agent");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(connectToHost).mockRejectedValue(new Error("Connection refused"));

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Failing Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          const state = useConnectionStore.getState();
          expect(state.connectionStatus).toBe("error");
          expect(state.connectionError).toBe("Connection refused");
        });
      });
    });
  });

  describe("Password management", () => {
    describe("Password prompt dialog", () => {
      it("shows password dialog for password auth", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Password Host", "password");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Password Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          expect(screen.getByText(/connect to.*password host/i)).toBeInTheDocument();
          expect(
            screen.getByText("Enter password for authentication")
          ).toBeInTheDocument();
        });
      });

      it("cancels password prompt", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Password Host", "password");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Password Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Cancel" }));

        await waitFor(() => {
          expect(screen.getByText("Remote Hosts")).toBeInTheDocument();
        });
      });

      it("connects with entered password", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Password Host", "password");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(connectToHost).mockResolvedValue(undefined);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Password Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
        });

        await user.type(screen.getByPlaceholderText("Password"), "mysecret");
        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          expect(connectToHost).toHaveBeenCalledWith("1", "mysecret");
        });
      });
    });

    describe("Save password to keyring", () => {
      it("saves password to keyring when savePassword is enabled", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Save Password Host", "password", true);
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(connectToHost).mockResolvedValue(undefined);
        vi.mocked(saveHostPassword).mockResolvedValue(undefined);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Save Password Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
        });

        await user.type(screen.getByPlaceholderText("Password"), "my-password");
        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          expect(saveHostPassword).toHaveBeenCalledWith("1", "my-password");
        });
      });

      it("does not save password when savePassword is disabled", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "No Save Host", "password", false);
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(connectToHost).mockResolvedValue(undefined);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("No Save Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
        });

        await user.type(screen.getByPlaceholderText("Password"), "my-password");
        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          expect(connectToHost).toHaveBeenCalled();
        });

        expect(saveHostPassword).not.toHaveBeenCalled();
      });

      it("handles keyring save errors gracefully", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Keyring Error Host", "password", true);
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(connectToHost).mockResolvedValue(undefined);
        vi.mocked(saveHostPassword).mockRejectedValue(
          new Error("Keyring not available")
        );

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Keyring Error Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
        });

        await user.type(screen.getByPlaceholderText("Password"), "my-password");
        await user.click(screen.getByRole("button", { name: "Connect" }));

        // Should still connect successfully despite keyring error
        await waitFor(() => {
          const state = useConnectionStore.getState();
          expect(state.connectionStatus).toBe("connected");
        });
      });
    });

    describe("Delete password on savePassword disable", () => {
      it("deletes password when savePassword is disabled during edit", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Previously Saved Host", "password", true);
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(updateRemoteHost).mockResolvedValue({
          ...host,
          savePassword: false,
        });
        vi.mocked(deleteHostPassword).mockResolvedValue(true);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Previously Saved Host")).toBeInTheDocument();
        });

        await user.click(screen.getByTitle("Edit"));

        await waitFor(() => {
          expect(screen.getByLabelText(/save password/i)).toBeInTheDocument();
        });

        // Uncheck the save password checkbox
        const savePasswordCheckbox = screen.getByLabelText(/save password/i);
        await user.click(savePasswordCheckbox);

        await user.click(screen.getByRole("button", { name: /save changes/i }));

        await waitFor(() => {
          expect(deleteHostPassword).toHaveBeenCalledWith("1");
        });
      });
    });
  });

  describe("Host key verification", () => {
    describe("New host key", () => {
      it("shows verification dialog for new host key", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "New Key Host", "agent");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(connectToHost).mockRejectedValue(
          new Error("Host key verification required: SHA256:abc123")
        );
        vi.mocked(fetchHostKey).mockResolvedValue({
          host: "1.example.com",
          port: 22,
          fingerprint: "SHA256:abc123xyz",
          keyType: "ED25519",
        });

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("New Key Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          expect(screen.getByText("Verify Host Key")).toBeInTheDocument();
          expect(
            screen.getByText(/first time connecting/i)
          ).toBeInTheDocument();
        });
      });

      it("shows host key fingerprint in verification dialog", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "New Key Host", "agent");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(connectToHost).mockRejectedValue(
          new Error("Host key verification required")
        );
        vi.mocked(fetchHostKey).mockResolvedValue({
          host: "1.example.com",
          port: 22,
          fingerprint: "SHA256:test-fingerprint-123",
          keyType: "RSA",
        });

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("New Key Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          expect(screen.getByText("SHA256:test-fingerprint-123")).toBeInTheDocument();
          expect(screen.getByText("RSA")).toBeInTheDocument();
        });
      });
    });

    describe("Changed host key", () => {
      it("shows warning for changed host key", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Changed Key Host", "agent");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(connectToHost).mockRejectedValue(
          new Error("HOST KEY HAS CHANGED!")
        );
        vi.mocked(fetchHostKey).mockResolvedValue({
          host: "1.example.com",
          port: 22,
          fingerprint: "SHA256:new-key",
          keyType: "ED25519",
        });

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Changed Key Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          expect(screen.getByText("Host Key Changed!")).toBeInTheDocument();
          expect(
            screen.getByText(/warning.*potential security risk/i)
          ).toBeInTheDocument();
        });
      });

      it("shows security warning list", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Changed Key Host", "agent");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(connectToHost).mockRejectedValue(
          new Error("HOST KEY HAS CHANGED!")
        );
        vi.mocked(fetchHostKey).mockResolvedValue({
          host: "1.example.com",
          port: 22,
          fingerprint: "SHA256:new-key",
          keyType: "ED25519",
        });

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Changed Key Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          expect(
            screen.getByText(/server was reinstalled/i)
          ).toBeInTheDocument();
          expect(
            screen.getByText(/man-in-the-middle/i)
          ).toBeInTheDocument();
        });
      });
    });

    describe("Accept key", () => {
      it("accepts key and retries connection", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Accept Key Host", "agent");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(connectToHost).mockRejectedValue(
          new Error("Host key verification required")
        );
        vi.mocked(fetchHostKey).mockResolvedValue({
          host: "1.example.com",
          port: 22,
          fingerprint: "SHA256:new-key",
          keyType: "ED25519",
        });
        vi.mocked(connectToHostAcceptKey).mockResolvedValue(undefined);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Accept Key Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          expect(screen.getByText("Verify Host Key")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: /accept.*connect/i }));

        await waitFor(() => {
          expect(connectToHostAcceptKey).toHaveBeenCalledWith("1", undefined);
        });
      });
    });

    describe("Reject key", () => {
      it("cancels connection on reject", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Reject Key Host", "agent");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(connectToHost).mockRejectedValue(
          new Error("Host key verification required")
        );
        vi.mocked(fetchHostKey).mockResolvedValue({
          host: "1.example.com",
          port: 22,
          fingerprint: "SHA256:key",
          keyType: "ED25519",
        });

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Reject Key Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          expect(screen.getByText("Verify Host Key")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Cancel" }));

        await waitFor(() => {
          expect(screen.getByText("Remote Hosts")).toBeInTheDocument();
        });

        expect(connectToHostAcceptKey).not.toHaveBeenCalled();
      });
    });
  });

  describe("Test connection", () => {
    describe("Test with key/agent auth", () => {
      it("runs test connection for key auth", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Test Key Host", "key");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(testHostConnection).mockResolvedValue({
          success: true,
          message: "Key auth test successful",
          journalctlAvailable: true,
        });

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Test Key Host")).toBeInTheDocument();
        });

        await user.click(screen.getByTitle("Test connection"));

        // Verify test result message appears - this proves testHostConnection was called
        await waitFor(() => {
          expect(screen.getByText("Key auth test successful")).toBeInTheDocument();
        });
      });
    });

    describe("Test with password auth", () => {
      it("prompts for password before testing", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Test Password Host", "password");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Test Password Host")).toBeInTheDocument();
        });

        await user.click(screen.getByTitle("Test connection"));

        await waitFor(() => {
          expect(screen.getByText(/test connection to/i)).toBeInTheDocument();
          expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
        });
      });

      it("tests connection with entered password", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Test Password Host", "password");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(testHostConnection).mockResolvedValue({
          success: true,
          message: "Test passed",
          journalctlAvailable: true,
        });

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Test Password Host")).toBeInTheDocument();
        });

        await user.click(screen.getByTitle("Test connection"));

        await waitFor(() => {
          expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
        });

        await user.type(screen.getByPlaceholderText("Password"), "test-pwd");
        await user.click(screen.getByRole("button", { name: "Test" }));

        await waitFor(() => {
          expect(testHostConnection).toHaveBeenCalledWith("1", "test-pwd");
        });
      });
    });

    describe("Test success", () => {
      it("shows success message", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Success Host", "agent");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(testHostConnection).mockResolvedValue({
          success: true,
          message: "SSH connection successful. journalctl is available.",
          journalctlAvailable: true,
        });

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Success Host")).toBeInTheDocument();
        });

        await user.click(screen.getByTitle("Test connection"));

        await waitFor(() => {
          expect(
            screen.getByText("SSH connection successful. journalctl is available.")
          ).toBeInTheDocument();
        });
      });
    });

    describe("Test failure", () => {
      it("shows failure message", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Fail Host", "agent");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(testHostConnection).mockResolvedValue({
          success: false,
          message: "Connection timed out",
          journalctlAvailable: false,
        });

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Fail Host")).toBeInTheDocument();
        });

        await user.click(screen.getByTitle("Test connection"));

        await waitFor(() => {
          expect(screen.getByText("Connection timed out")).toBeInTheDocument();
        });
      });

      it("shows error when test throws", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Error Host", "agent");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(testHostConnection).mockRejectedValue(
          new Error("Network unreachable")
        );

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Error Host")).toBeInTheDocument();
        });

        await user.click(screen.getByTitle("Test connection"));

        await waitFor(() => {
          expect(screen.getByText("Network unreachable")).toBeInTheDocument();
        });
      });

      it("shows host key verification dialog on test error", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Host Key Host", "agent");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(testHostConnection).mockRejectedValue(
          new Error("Host key verification required")
        );
        vi.mocked(fetchHostKey).mockResolvedValue({
          host: "1.example.com",
          port: 22,
          fingerprint: "SHA256:fingerprint",
          keyType: "ED25519",
        });

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Host Key Host")).toBeInTheDocument();
        });

        await user.click(screen.getByTitle("Test connection"));

        await waitFor(() => {
          expect(screen.getByText("Verify Host Key")).toBeInTheDocument();
        });
      });
    });
  });

  describe("Error handling", () => {
    describe("SSH errors", () => {
      it("triggers host key dialog for host key errors", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "SSH Host", "agent");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(connectToHost).mockRejectedValue(
          new Error("Host key verification required: new host")
        );
        vi.mocked(fetchHostKey).mockResolvedValue({
          host: "1.example.com",
          port: 22,
          fingerprint: "SHA256:fingerprint",
          keyType: "ED25519",
        });

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("SSH Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          expect(screen.getByText("Verify Host Key")).toBeInTheDocument();
        });
      });
    });

    describe("Network errors", () => {
      it("handles connection refused error", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Network Host", "agent");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(connectToHost).mockRejectedValue(
          new Error("Connection refused: host unreachable")
        );

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Network Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          const state = useConnectionStore.getState();
          expect(state.connectionStatus).toBe("error");
          expect(state.connectionError).toBe(
            "Connection refused: host unreachable"
          );
        });
      });
    });

    describe("Timeout errors", () => {
      it("handles timeout error", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Timeout Host", "agent");
        vi.mocked(listRemoteHosts).mockResolvedValue([host]);
        vi.mocked(connectToHost).mockRejectedValue(
          new Error("Connection timed out after 30s")
        );

        render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

        await waitFor(() => {
          expect(screen.getByText("Timeout Host")).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => {
          const state = useConnectionStore.getState();
          expect(state.connectionError).toBe("Connection timed out after 30s");
        });
      });
    });
  });

  describe("UI interactions", () => {
    it("closes modal on close button click", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      vi.mocked(listRemoteHosts).mockResolvedValue([]);

      render(<ConnectionManager isOpen={true} onClose={onClose} />);

      await waitFor(() => {
        expect(screen.getByText("Remote Hosts")).toBeInTheDocument();
      });

      // Click the X button
      const closeButton = screen.getByRole("button", { name: "" });
      await user.click(closeButton);

      expect(onClose).toHaveBeenCalled();
    });

    it("shows disconnect button for connected host", async () => {
      const host = createTestHost("1", "Connected Host", "agent");
      vi.mocked(listRemoteHosts).mockResolvedValue([host]);

      // Pre-set the connected state
      useConnectionStore.setState({
        connectedHostId: "1",
        connectionStatus: "connected",
        hosts: [host],
      });

      render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
      });
    });

    it("disables delete button for connected host", async () => {
      const host = createTestHost("1", "Connected Host", "agent");
      vi.mocked(listRemoteHosts).mockResolvedValue([host]);

      useConnectionStore.setState({
        connectedHostId: "1",
        connectionStatus: "connected",
        hosts: [host],
      });

      render(<ConnectionManager isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        const deleteButton = screen.getByTitle(/disconnect first/i);
        expect(deleteButton).toBeDisabled();
      });
    });
  });
});
