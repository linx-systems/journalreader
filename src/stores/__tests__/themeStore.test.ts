import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useThemeStore } from "../themeStore";
import { LIGHT_THEME, createCustomTheme } from "../../lib/theme";

const initialState = useThemeStore.getState();
const NOW = new Date("2024-01-01T00:00:00Z");

beforeEach(() => {
  localStorage.clear();
  useThemeStore.setState(initialState, true);
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

it("returns dark theme by default", () => {
  const theme = useThemeStore.getState().getCurrentTheme();
  expect(theme.id).toBe("dark");
});

it("setTheme updates currentThemeId and disables followSystem", () => {
  const store = useThemeStore.getState();
  store.setFollowSystem(true);
  store.setTheme("light");

  const state = useThemeStore.getState();
  expect(state.currentThemeId).toBe("light");
  expect(state.followSystem).toBe(false);
});

it("followSystem uses system theme preference", () => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
    addListener: () => {},
    removeListener: () => {},
  }));

  const store = useThemeStore.getState();
  store.setFollowSystem(true);

  const theme = store.getCurrentTheme();
  expect(theme.id).toBe("dark");
});

it("adds and updates custom themes", () => {
  const store = useThemeStore.getState();
  const custom = createCustomTheme(LIGHT_THEME, { id: "custom-1", name: "Custom" });
  store.addCustomTheme(custom);
  store.updateCustomTheme("custom-1", { name: "Updated" });

  const updated = store.getAllThemes().find((t) => t.id === "custom-1");
  expect(updated?.name).toBe("Updated");
  expect(updated?.isBuiltIn).toBe(false);
});

it("deleteCustomTheme removes custom themes and resets current theme", () => {
  const store = useThemeStore.getState();
  const custom = createCustomTheme(LIGHT_THEME, { id: "custom-2", name: "Custom 2" });
  store.addCustomTheme(custom);
  store.setTheme("custom-2");

  store.deleteCustomTheme("custom-2");

  const state = useThemeStore.getState();
  expect(state.customThemes).toHaveLength(0);
  expect(state.currentThemeId).toBe("dark");
});

it("duplicateTheme creates a copy", () => {
  const store = useThemeStore.getState();
  const duplicated = store.duplicateTheme("light");

  expect(duplicated).not.toBeNull();
  expect(duplicated?.id).toBe(`custom-${Date.now()}`);
  expect(duplicated?.name).toBe("Light (Copy)");
  const state = useThemeStore.getState();
  expect(state.customThemes).toContainEqual(duplicated);
});

it("importTheme adds a validated theme with a new id", () => {
  const store = useThemeStore.getState();
  store.importTheme(LIGHT_THEME);

  const state = useThemeStore.getState();
  const imported = state.customThemes.find((t) => t.id === `imported-${Date.now()}`);
  expect(imported).toBeDefined();
  expect(imported?.isBuiltIn).toBe(false);
});
