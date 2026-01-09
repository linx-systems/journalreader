import { beforeEach, describe, expect, it } from "vitest";
import { useErrorStore } from "../errorStore";
import type { AppError } from "../../lib/errorLogger";

// Helper to create test errors
function createTestError(id: string, message: string): AppError {
  return {
    id,
    message,
    timestamp: new Date(),
  };
}

const initialState = useErrorStore.getState();

beforeEach(() => {
  useErrorStore.setState(initialState, true);
});

describe("errorStore", () => {
  describe("initial state", () => {
    it("initializes with empty errors array", () => {
      const state = useErrorStore.getState();
      expect(state.errors).toEqual([]);
    });
  });

  describe("addError", () => {
    it("adds a single error to the store", () => {
      const store = useErrorStore.getState();
      const error = createTestError("err_1", "Test error message");

      store.addError(error);

      const state = useErrorStore.getState();
      expect(state.errors).toHaveLength(1);
      expect(state.errors[0]).toEqual(error);
    });

    it("adds multiple errors to the store", () => {
      const store = useErrorStore.getState();
      const error1 = createTestError("err_1", "First error");
      const error2 = createTestError("err_2", "Second error");

      store.addError(error1);
      store.addError(error2);

      const state = useErrorStore.getState();
      expect(state.errors).toHaveLength(2);
      expect(state.errors[0]).toEqual(error1);
      expect(state.errors[1]).toEqual(error2);
    });

    it("preserves error context and error object", () => {
      const store = useErrorStore.getState();
      const originalError = new Error("Original error");
      const error: AppError = {
        id: "err_1",
        message: "Wrapped error",
        error: originalError,
        context: { component: "TestComponent", action: "test" },
        timestamp: new Date(),
      };

      store.addError(error);

      const state = useErrorStore.getState();
      expect(state.errors[0].error).toBe(originalError);
      expect(state.errors[0].context?.component).toBe("TestComponent");
      expect(state.errors[0].context?.action).toBe("test");
    });
  });

  describe("clearError", () => {
    it("removes a specific error by id", () => {
      const store = useErrorStore.getState();
      const error1 = createTestError("err_1", "First error");
      const error2 = createTestError("err_2", "Second error");
      const error3 = createTestError("err_3", "Third error");

      store.addError(error1);
      store.addError(error2);
      store.addError(error3);

      store.clearError("err_2");

      const state = useErrorStore.getState();
      expect(state.errors).toHaveLength(2);
      expect(state.errors.map((e) => e.id)).toEqual(["err_1", "err_3"]);
    });

    it("does nothing when clearing non-existent error id", () => {
      const store = useErrorStore.getState();
      const error = createTestError("err_1", "Test error");

      store.addError(error);
      store.clearError("non_existent");

      const state = useErrorStore.getState();
      expect(state.errors).toHaveLength(1);
      expect(state.errors[0].id).toBe("err_1");
    });

    it("clears the only error leaving empty array", () => {
      const store = useErrorStore.getState();
      const error = createTestError("err_1", "Only error");

      store.addError(error);
      store.clearError("err_1");

      const state = useErrorStore.getState();
      expect(state.errors).toEqual([]);
    });
  });

  describe("clearAll", () => {
    it("clears all errors from the store", () => {
      const store = useErrorStore.getState();
      store.addError(createTestError("err_1", "Error 1"));
      store.addError(createTestError("err_2", "Error 2"));
      store.addError(createTestError("err_3", "Error 3"));

      expect(useErrorStore.getState().errors).toHaveLength(3);

      store.clearAll();

      expect(useErrorStore.getState().errors).toEqual([]);
    });

    it("works when already empty", () => {
      const store = useErrorStore.getState();
      expect(store.errors).toEqual([]);

      store.clearAll();

      expect(useErrorStore.getState().errors).toEqual([]);
    });
  });
});
