import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostKeyVerificationDialog } from "../HostKeyVerificationDialog";
import type { RemoteHost, HostKeyInfo } from "../../../lib/types";

// Mock the Tauri module
vi.mock("../../../lib/tauri", () => ({
  fetchHostKey: vi.fn(),
}));

import { fetchHostKey } from "../../../lib/tauri";

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
    keyData: "base64-public-key",
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
      it("passes the exact displayed host key to the connection callback", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "New Host");
        const displayedKey = createMockHostKeyInfo();
        const onAccept = vi.fn().mockResolvedValue(undefined);
        vi.mocked(fetchHostKey).mockResolvedValue(displayedKey);

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
          expect(onAccept).toHaveBeenCalledWith(displayedKey);
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

      it("disables accept button while connecting with the approved key", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Test Host");
        vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());
        let resolveAccept: () => void;
        const acceptPromise = new Promise<void>((resolve) => {
          resolveAccept = resolve;
        });
        const onAccept = vi.fn(() => acceptPromise);

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

        expect(
          screen.getByRole("button", { name: /accept & connect/i })
        ).toBeDisabled();
        resolveAccept!();
      });
    });

    describe("Cancel button", () => {
      it("closes dialog without connecting when cancel button is clicked", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Test Host");
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

        await waitFor(() => {
          expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: "Cancel" }));

        expect(onReject).toHaveBeenCalled();
        expect(onAccept).not.toHaveBeenCalled();
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

    describe("Connection failure", () => {
      it("shows a failure from the key-bound connection and prevents a repeat click", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Test Host");
        const onAccept = vi
          .fn()
          .mockRejectedValue(new Error("Host key changed before connection"));
        vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());

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
          expect(
            screen.getByText(/Host key changed before connection/i)
          ).toBeInTheDocument();
        });
        expect(
          screen.getByRole("button", { name: /accept & connect/i })
        ).toBeDisabled();
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

      it("shows loading spinner during key-bound connection", async () => {
        const user = userEvent.setup();
        const host = createTestHost("1", "Test Host");
        vi.mocked(fetchHostKey).mockResolvedValue(createMockHostKeyInfo());
        let resolveAccept: () => void;
        const acceptPromise = new Promise<void>((resolve) => {
          resolveAccept = resolve;
        });

        render(
          <HostKeyVerificationDialog
            host={host}
            errorMessage="Host key verification required"
            onAccept={() => acceptPromise}
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

        expect(
          screen.getByRole("button", { name: /accept & connect/i })
        ).toBeDisabled();
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
  });
});
