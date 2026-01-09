import { beforeEach, describe, expect, it, vi } from "vitest";
import { logError, logWarning, type AppError, type ErrorContext } from "../errorLogger";

describe("errorLogger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("logError", () => {
    it("returns an AppError object with required fields", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = logError(new Error("Test error"));

      expect(result).toHaveProperty("id");
      expect(result.id).toMatch(/^err_\d+_\d+$/);
      expect(result.message).toBe("Test error");
      expect(result.error).toBeInstanceOf(Error);
      expect(result.timestamp).toBeInstanceOf(Date);

      consoleSpy.mockRestore();
    });

    it("generates unique error IDs", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result1 = logError(new Error("Error 1"));
      const result2 = logError(new Error("Error 2"));
      const result3 = logError(new Error("Error 3"));

      expect(result1.id).not.toBe(result2.id);
      expect(result2.id).not.toBe(result3.id);
      expect(result1.id).not.toBe(result3.id);

      consoleSpy.mockRestore();
    });

    it("converts non-Error objects to Error", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = logError("String error message");

      expect(result.error).toBeInstanceOf(Error);
      expect(result.message).toBe("String error message");

      consoleSpy.mockRestore();
    });

    it("handles Error with empty message", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = logError(new Error(""));

      expect(result.message).toBe("An unknown error occurred");

      consoleSpy.mockRestore();
    });

    it("logs error to console with prefix", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("Test error");

      logError(error);

      expect(consoleSpy).toHaveBeenCalledWith("[JournalReader]", error);

      consoleSpy.mockRestore();
    });

    it("logs error with context containing component", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("Test error");
      const context: ErrorContext = { component: "TestComponent" };

      logError(error, context);

      expect(consoleSpy).toHaveBeenCalledWith("[JournalReader] [TestComponent]", error);

      consoleSpy.mockRestore();
    });

    it("logs error with context containing component and action", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("Test error");
      const context: ErrorContext = { component: "TestComponent", action: "fetchData" };

      logError(error, context);

      expect(consoleSpy).toHaveBeenCalledWith(
        "[JournalReader] [TestComponent:fetchData]",
        error
      );

      consoleSpy.mockRestore();
    });

    it("logs additional context data separately", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("Test error");
      const context: ErrorContext = {
        component: "TestComponent",
        action: "save",
        userId: "user123",
        requestId: "req456",
      };

      logError(error, context);

      expect(consoleSpy).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenNthCalledWith(
        1,
        "[JournalReader] [TestComponent:save]",
        error
      );
      expect(consoleSpy).toHaveBeenNthCalledWith(
        2,
        "[JournalReader] Additional context:",
        { userId: "user123", requestId: "req456" }
      );

      consoleSpy.mockRestore();
    });

    it("does not log additional context when only component and action present", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("Test error");
      const context: ErrorContext = { component: "TestComponent", action: "save" };

      logError(error, context);

      expect(consoleSpy).toHaveBeenCalledTimes(1);

      consoleSpy.mockRestore();
    });

    it("stores context in returned AppError", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const context: ErrorContext = {
        component: "TestComponent",
        action: "test",
        extraData: "value",
      };

      const result = logError(new Error("Test"), context);

      expect(result.context).toEqual(context);

      consoleSpy.mockRestore();
    });

    it("handles context with action but no component", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("Test error");
      const context: ErrorContext = { action: "doSomething" };

      logError(error, context);

      expect(consoleSpy).toHaveBeenCalledWith(
        "[JournalReader] [Unknown:doSomething]",
        error
      );

      consoleSpy.mockRestore();
    });
  });

  describe("logWarning", () => {
    it("logs warning message with prefix", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      logWarning("This is a warning");

      expect(consoleSpy).toHaveBeenCalledWith("[JournalReader]", "This is a warning");

      consoleSpy.mockRestore();
    });

    it("logs warning with context containing component", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const context: ErrorContext = { component: "TestComponent" };

      logWarning("Warning message", context);

      expect(consoleSpy).toHaveBeenCalledWith(
        "[JournalReader] [TestComponent]",
        "Warning message"
      );

      consoleSpy.mockRestore();
    });

    it("logs warning with context containing component and action", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const context: ErrorContext = { component: "DataLoader", action: "validate" };

      logWarning("Validation warning", context);

      expect(consoleSpy).toHaveBeenCalledWith(
        "[JournalReader] [DataLoader:validate]",
        "Validation warning"
      );

      consoleSpy.mockRestore();
    });

    it("handles context with action but no component", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const context: ErrorContext = { action: "process" };

      logWarning("Processing warning", context);

      expect(consoleSpy).toHaveBeenCalledWith(
        "[JournalReader] [Unknown:process]",
        "Processing warning"
      );

      consoleSpy.mockRestore();
    });

    it("does not return a value", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = logWarning("Test");

      expect(result).toBeUndefined();

      consoleSpy.mockRestore();
    });
  });
});
