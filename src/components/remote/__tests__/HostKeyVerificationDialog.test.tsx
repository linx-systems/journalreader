import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostKeyVerificationDialog } from "../HostKeyVerificationDialog";
import type { RemoteHost, HostKeyInfo } from "../../../lib/types";

// Mock the tauri module
vi.mock("../../../lib/tauri", () => ({
  fetchHostKey: vi.fn(),
  acceptHostKey: vi.fn(),
  removeHostKey: vi.fn(),
}));

import {
  fetchHostKey,
  acceptHostKey,
  removeHostKey,
} from "../../../lib/tauri";

// Helper to create test hosts
function createTestHost(
  id: string,
  name: string,
  authMethod: "password" | "key" | "agent" = "agent"
): RemoteHost {
  return {
    id,
    name,
    hostname: `${id}.example.com`,
    port: 22,
    username: "testuser",
    authMethod,
    sudoRequired: false,
    savePassword: false,
  };
}

// Helper to create mock host key info
function createMockHostKeyInfo(overrides: Partial<HostKeyInfo> = {}): HostKeyInfo {
  return {
    host: "test.example.com",
    port: 22,
    fingerprint: "SHA256:abc123xyz789def456",
    keyType: "ED25519",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("HostKeyVerificationDialog", () => {
  describe("Key Detection", () => {
    describe("New host key", () => {
      it("detects new host key correctly when error does not contain 'HOST KEY HAS CHANGED'", async () => {
        const host = createTestHost("1", "New Host");
        vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(screen.getByText("Verify Host Key")).toBeInTheDocument();
        });

        // Should show first-time connection message
        expect(
          screen.getByText(/first time connecting/i)
        ).toBeInTheDocument();

        // Should NOT show the changed key warning
        expect(
          screen.queryByText(/Host Key Changed!/i)
        ).not.toBeInTheDocument();
      });

      it("shows 'Accept & Connect' button for new host key", async () => {
        const host = createTestHost("1", "New Host");
        vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(
            screen.getByRole("button", { name: /accept & connect/i })
          ).toBeInTheDocument();
        });
      });
    });

    describe("Changed host key", () => {
      it("detects changed host key correctly when error contains 'HOST KEY HAS CHANGED'", async () => {
        const host = createTestHost("1", "Changed Host");
        vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED! HOST KEY HAS CHANGED!"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(screen.getByText("Host Key Changed!")).toBeInTheDocument();
        });

        // Should show security warning
        expect(
          screen.getByText(/Warning: Potential Security Risk!/i)
        ).toBeInTheDocument();
      });

      it("shows security warning list for changed key", async () => {
        const host = createTestHost("1", "Changed Host");
        vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="HOST KEY HAS CHANGED"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(
            screen.getByText(/server was reinstalled or reconfigured/i)
          ).toBeInTheDocument();
          expect(
            screen.getByText(/man-in-the-middle attack/i)
          ).toBeInTheDocument();
          expect(
            screen.getByText(/SSH keys were rotated/i)
          ).toBeInTheDocument();
          expect(
            screen.getByText(/Only proceed if you trust this change/i)
          ).toBeInTheDocument();
        });
      });

      it("shows 'Accept Changed Key' button for changed host key", async () => {
        const host = createTestHost("1", "Changed Host");
        vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="HOST KEY HAS CHANGED"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(
            screen.getByRole("button", { name: /accept changed key/i })
          ).toBeInTheDocument();
        });
      });
    });

    describe("Key fingerprint display", () => {
      it("displays key fingerprint correctly", async () => {
        const host = createTestHost("1", "Test Host");
        const mockKeyInfo = createMockHostKeyInfo({
          fingerprint: "SHA256:test-fingerprint-abc123",
        });
        vi.mocked(fetchHostKey).mockResolvedValue(mockKeyInfo);

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(
            screen.getByText("SHA256:test-fingerprint-abc123")
          ).toBeInTheDocument();
        });
      });

      it("displays key type correctly", async () => {
        const host = createTestHost("1", "Test Host");
        const mockKeyInfo = createMockHostKeyInfo({
          keyType: "RSA",
        });
        vi.mocked(fetchHostKey).mockResolvedValue(mockKeyInfo);

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(screen.getByText("RSA")).toBeInTheDocument();
        });
      });

      it("displays host connection info correctly", async () => {
        const host = createTestHost("1", "Test Host");
        host.username = "admin";
        host.hostname = "server.example.com";
        host.port = 2222;
        vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(
            screen.getByText("admin@server.example.com:2222")
          ).toBeInTheDocument();
        });
      });
    });
  });

  describe("User Actions", () => {
    describe("Accept button", () => {
      it("saves key and triggers callback for new host key", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "New Host");
        const onAccept = vi.fn();
        vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());
        vi.mocked(acceptHostKey).mockResolvedValue(createMockHostKeyInfo());

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={onAccept}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(
            screen.getByRole("button", { name: /accept & connect/i })
          ).toBeInTheDocument();
        });

        await user.click(
          screen.getByRole("button", { name: /accept & connect/i })
        );

        await waitFor(() => {
          expect(acceptHostKey).toHaveBeenCalledWith("1");
          expect(onAccept).toHaveBeenCalled();
        });

        // Should NOT call removeHostKey for new keys
        expect(removeHostKey).not.toHaveBeenCalled();
      });

      it("removes old key first then saves new key for changed host key", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Changed Host");
        host.hostname = "changed.example.com";
        host.port = 22;
        const onAccept = vi.fn();
        vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());
        vi.mocked(removeHostKey).mockResolvedValue(true);
        vi.mocked(acceptHostKey).mockResolvedValue(createMockHostKeyInfo());

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="HOST KEY HAS CHANGED"
            onAccept={onAccept}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(
            screen.getByRole("button", { name: /accept changed key/i })
          ).toBeInTheDocument();
        });

        await user.click(
          screen.getByRole("button", { name: /accept changed key/i })
        );

        await waitFor(() => {
          // Should remove old key first
          expect(removeHostKey).toHaveBeenCalledWith("changed.example.com", 22);
          // Then accept new key
          expect(acceptHostKey).toHaveBeenCalledWith("1");
          expect(onAccept).toHaveBeenCalled();
        });
      });

      it("disables accept button while loading key info", async () => {
        const host = createTestHost("1", "Test Host");
        let resolvePromise: (value: HostKeyInfo) => void;
        const promise = new Promise<HostKeyInfo>((resolve) => {
          resolvePromise = resolve;
        });
        vi.mocked(fetchHostKey).mockReturnValue(promise);

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        // While loading, button should be disabled
        const acceptButton = screen.getByRole("button", { name: /accept & connect/i });
        expect(acceptButton).toBeDisabled();

        // Resolve the promise
        resolvePromise!(createMockHostKeyInfo());

        await waitFor(() => {
          expect(
            screen.getByRole("button", { name: /accept & connect/i })
          ).not.toBeDisabled();
        });
      });

      it("disables accept button while accepting key", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Test Host");
        vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());
        let resolveAccept: () => void;
        const acceptPromise = new Promise<HostKeyInfo>((resolve) => {
          resolveAccept = () => resolve(createMockHostKeyInfo());
        });
        vi.mocked(acceptHostKey).mockReturnValue(acceptPromise);

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(
            screen.getByRole("button", { name: /accept & connect/i })
          ).not.toBeDisabled();
        });

        await user.click(
          screen.getByRole("button", { name: /accept & connect/i })
        );

        // Button should be disabled while accepting
        expect(
          screen.getByRole("button", { name: /accept & connect/i })
        ).toBeDisabled();

        // Resolve to complete
        resolveAccept!();
      });
    });

    describe("Cancel button", () => {
      it("closes dialog without saving when cancel button is clicked", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Test Host");
        const onReject = vi.fn();
        vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={vi.fn()}
            onReject={onReject}
          />
        );

        await waitFor(() => {
          expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Cancel" }));

        expect(onReject).toHaveBeenCalled();
        expect(acceptHostKey).not.toHaveBeenCalled();
        expect(removeHostKey).not.toHaveBeenCalled();
      });

      it("closes dialog when X button is clicked", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Test Host");
        const onReject = vi.fn();
        vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={vi.fn()}
            onReject={onReject}
          />
        );

        await waitFor(() => {
          expect(screen.getByText("Verify Host Key")).toBeInTheDocument();
        });

        // Find and click the X close button in header
        const closeButtons = screen.getAllByRole("button");
        const xButton = closeButtons.find((btn) => btn.querySelector("svg"));
        if (xButton && xButton !== screen.getByRole("button", { name: "Cancel" })) {
          await user.click(xButton);
        }

        expect(onReject).toHaveBeenCalled();
      });
    });
  });

  describe("Error Handling", () => {
    describe("Key fetch failure", () => {
      it("handles key fetch failure gracefully", async () => {
        const host = createTestHost("1", "Test Host");
        vi.mocked(fetchHostKey).mockRejectedValue(new Error("Network error: unable to fetch key"));

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(
            screen.getByText(/Failed to fetch host key/i)
          ).toBeInTheDocument();
          expect(
            screen.getByText(/Network error: unable to fetch key/i)
          ).toBeInTheDocument();
        });
      });

      it("disables accept button when key fetch fails", async () => {
        const host = createTestHost("1", "Test Host");
        vi.mocked(fetchHostKey).mockRejectedValue(new Error("Fetch failed"));

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(
            screen.getByText(/Failed to fetch host key/i)
          ).toBeInTheDocument();
        });

        const acceptButton = screen.getByRole("button", { name: /accept & connect/i });
        expect(acceptButton).toBeDisabled();
      });

      it("handles non-Error fetch failures", async () => {
        const host = createTestHost("1", "Test Host");
        vi.mocked(fetchHostKey).mockRejectedValue("String error message");

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(
            screen.getByText(/String error message/i)
          ).toBeInTheDocument();
        });
      });
    });

    describe("Key save failure", () => {
      it("handles key save failure gracefully", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Test Host");
        vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());
        vi.mocked(acceptHostKey).mockRejectedValue(new Error("Failed to save key to known_hosts"));

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(
            screen.getByRole("button", { name: /accept & connect/i })
          ).not.toBeDisabled();
        });

        await user.click(
          screen.getByRole("button", { name: /accept & connect/i })
        );

        await waitFor(() => {
          expect(
            screen.getByText(/Failed to save key to known_hosts/i)
          ).toBeInTheDocument();
        });
      });

      it("does not call onAccept when key save fails", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Test Host");
        const onAccept = vi.fn();
        vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());
        vi.mocked(acceptHostKey).mockRejectedValue(new Error("Save failed"));

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={onAccept}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(
            screen.getByRole("button", { name: /accept & connect/i })
          ).not.toBeDisabled();
        });

        await user.click(
          screen.getByRole("button", { name: /accept & connect/i })
        );

        await waitFor(() => {
          expect(screen.getByText(/Save failed/i)).toBeInTheDocument();
        });

        expect(onAccept).not.toHaveBeenCalled();
      });

      it("keeps accept button disabled when error is displayed", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Test Host");
        vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());
        vi.mocked(acceptHostKey).mockRejectedValue(new Error("Save failed"));

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(
            screen.getByRole("button", { name: /accept & connect/i })
          ).not.toBeDisabled();
        });

        await user.click(
          screen.getByRole("button", { name: /accept & connect/i })
        );

        await waitFor(() => {
          expect(screen.getByText(/Save failed/i)).toBeInTheDocument();
        });

        // Button should remain disabled while error is displayed
        // This prevents users from repeatedly clicking when there's an error
        expect(
          screen.getByRole("button", { name: /accept & connect/i })
        ).toBeDisabled();
      });

      it("stops the accepting spinner after save failure", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Test Host");
        vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());
        vi.mocked(acceptHostKey).mockRejectedValue(new Error("Save failed"));

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(
            screen.getByRole("button", { name: /accept & connect/i })
          ).not.toBeDisabled();
        });

        await user.click(
          screen.getByRole("button", { name: /accept & connect/i })
        );

        await waitFor(() => {
          expect(screen.getByText(/Save failed/i)).toBeInTheDocument();
        });

        // The button text should still say "Accept & Connect" (not showing spinner state forever)
        expect(
          screen.getByRole("button", { name: /accept & connect/i })
        ).toBeInTheDocument();
      });
    });

    describe("Old key removal failure", () => {
      it("handles old key removal failure gracefully", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Changed Host");
        host.hostname = "changed.example.com";
        host.port = 22;
        vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());
        vi.mocked(removeHostKey).mockRejectedValue(new Error("Failed to remove old key"));

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="HOST KEY HAS CHANGED"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(
            screen.getByRole("button", { name: /accept changed key/i })
          ).not.toBeDisabled();
        });

        await user.click(
          screen.getByRole("button", { name: /accept changed key/i })
        );

        await waitFor(() => {
          expect(
            screen.getByText(/Failed to remove old key/i)
          ).toBeInTheDocument();
        });

        // Should not proceed to accept the new key
        expect(acceptHostKey).not.toHaveBeenCalled();
      });
    });
  });

  describe("UI States", () => {
    describe("Loading state", () => {
      it("shows loading state during key fetch", async () => {
        const host = createTestHost("1", "Test Host");
        let resolvePromise: (value: HostKeyInfo) => void;
        const promise = new Promise<HostKeyInfo>((resolve) => {
          resolvePromise = resolve;
        });
        vi.mocked(fetchHostKey).mockReturnValue(promise);

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        // Should show loading indicator
        expect(screen.getByText(/Fetching host key/i)).toBeInTheDocument();

        // Should not show fingerprint yet
        expect(screen.queryByText(/Fingerprint:/i)).not.toBeInTheDocument();

        // Resolve promise to finish loading
        resolvePromise!(createMockHostKeyInfo());

        await waitFor(() => {
          expect(screen.queryByText(/Fetching host key/i)).not.toBeInTheDocument();
          expect(screen.getByText(/Fingerprint:/i)).toBeInTheDocument();
        });
      });

      it("shows loading spinner during key accept operation", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Test Host");
        vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());
        let resolveAccept: () => void;
        const acceptPromise = new Promise<HostKeyInfo>((resolve) => {
          resolveAccept = () => resolve(createMockHostKeyInfo());
        });
        vi.mocked(acceptHostKey).mockReturnValue(acceptPromise);

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(
            screen.getByRole("button", { name: /accept & connect/i })
          ).not.toBeDisabled();
        });

        await user.click(
          screen.getByRole("button", { name: /accept & connect/i })
        );

        // Button should still say "Accept & Connect" but have a spinner
        const button = screen.getByRole("button", { name: /accept & connect/i });
        expect(button).toBeDisabled();

        // Resolve to complete
        resolveAccept!();
      });
    });

    describe("Error state display", () => {
      it("displays error message in red/styled container", async () => {
        const host = createTestHost("1", "Test Host");
        vi.mocked(fetchHostKey).mockRejectedValue(new Error("Connection timeout"));

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          // Find the error container div that has the red background class
          const errorText = screen.getByText(/Failed to fetch host key/i);
          // The container itself has the bg-red-100 class
          expect(errorText.closest("div")).toHaveClass("bg-red-100");
        });
      });
    });

    describe("Warning display for changed keys", () => {
      it("displays warning with appropriate styling for changed keys", async () => {
        const host = createTestHost("1", "Changed Host");
        vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="HOST KEY HAS CHANGED"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          // Find the warning text and look for the styled container
          const warningText = screen.getByText(/Warning: Potential Security Risk!/i);
          // Navigate up to find the container with bg-red-100 class
          const warningContainer = warningText.closest(".bg-red-100");
          expect(warningContainer).toBeInTheDocument();
        });
      });

      it("does not show warning for new host keys", async () => {
        const host = createTestHost("1", "New Host");
        vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(screen.getByText(/first time connecting/i)).toBeInTheDocument();
        });

        expect(
          screen.queryByText(/Warning: Potential Security Risk!/i)
        ).not.toBeInTheDocument();
      });
    });

    describe("Different key types", () => {
      it("displays ED25519 key type", async () => {
        const host = createTestHost("1", "Test Host");
        vi.mocked(fetchHostKey).mockResolvedValue(
          createMockHostKeyInfo({ keyType: "ED25519" })
        );

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(screen.getByText("ED25519")).toBeInTheDocument();
        });
      });

      it("displays RSA key type", async () => {
        const host = createTestHost("1", "Test Host");
        vi.mocked(fetchHostKey).mockResolvedValue(
          createMockHostKeyInfo({ keyType: "RSA" })
        );

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(screen.getByText("RSA")).toBeInTheDocument();
        });
      });

      it("displays ECDSA key type", async () => {
        const host = createTestHost("1", "Test Host");
        vi.mocked(fetchHostKey).mockResolvedValue(
          createMockHostKeyInfo({ keyType: "ECDSA" })
        );

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={vi.fn()}
            onReject={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(screen.getByText("ECDSA")).toBeInTheDocument();
        });
      });
    });
  });

  describe("Edge Cases", () => {
    it("handles host with non-standard port", async () => {
      const host = createTestHost("1", "Non-Standard Port Host");
      host.port = 2222;
      vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());

      render(
        <HostKeyVerificationDialog
          host={host}
          errorMessage="Host key verification required"
          onAccept={vi.fn()}
          onReject={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/testuser@1\.example\.com:2222/)).toBeInTheDocument();
      });
    });

    it("fetches key using host id", async () => {
      const host = createTestHost("unique-host-id-123", "Test Host");
      vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());

      render(
        <HostKeyVerificationDialog
          host={host}
          errorMessage="Host key verification required"
          onAccept={vi.fn()}
          onReject={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(fetchHostKey).toHaveBeenCalledWith("unique-host-id-123");
      });
    });

    it("uses hostname and port for removing old key on changed key", async () => {
      const user = userEvent.setup();
      const host = createTestHost("host-id", "Changed Host");
      host.hostname = "custom-host.example.com";
      host.port = 3333;
      vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());
      vi.mocked(removeHostKey).mockResolvedValue(true);
      vi.mocked(acceptHostKey).mockResolvedValue(createMockHostKeyInfo());

      render(
        <HostKeyVerificationDialog
          host={host}
          errorMessage="HOST KEY HAS CHANGED"
          onAccept={vi.fn()}
          onReject={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /accept changed key/i })
        ).not.toBeDisabled();
      });

      await user.click(
        screen.getByRole("button", { name: /accept changed key/i })
      );

      await waitFor(() => {
        expect(removeHostKey).toHaveBeenCalledWith("custom-host.example.com", 3333);
      });
    });
  });
  it("rejects once without accepting when native Escape cancels the verification", async () => {
    const host = createTestHost("host-id", "Untrusted Host");
    const onAccept = vi.fn();
    const onReject = vi.fn();
    vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());

    render(
      <HostKeyVerificationDialog
        host={host}
        errorMessage="Host key verification required"
        onAccept={onAccept}
        onReject={onReject}
      />
    );

    const dialog = await screen.findByRole("dialog", { name: "Verify Host Key" });
    fireEvent(dialog, new Event("cancel", { cancelable: true }));

    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
    expect(acceptHostKey).not.toHaveBeenCalled();
  });
});
