import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  LIGHT_THEME,
  createCustomTheme,
  validateTheme,
  exportTheme,
  importTheme,
  getPriorityKey,
} from "../theme";

const NOW = new Date("2024-01-01T00:00:00Z");

describe("createCustomTheme", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("merges overrides and preserves nested defaults", () => {
    const custom = createCustomTheme(LIGHT_THEME, {
      name: "Custom",
      colors: {
        accent: "#000000",
        priority: { error: "#111111" },
      },
      typography: { fontSize: 16 },
    });

    expect(custom.id).toBe(`custom-${Date.now()}`);
    expect(custom.isBuiltIn).toBe(false);
    expect(custom.name).toBe("Custom");
    expect(custom.colors.accent).toBe("#000000");
    expect(custom.colors.priority.error).toBe("#111111");
    expect(custom.colors.priority.warning).toBe(LIGHT_THEME.colors.priority.warning);
    expect(custom.typography.fontSize).toBe(16);
    expect(custom.typography.fontFamily).toBe(LIGHT_THEME.typography.fontFamily);
  });

  it("uses provided id and name when supplied", () => {
    const custom = createCustomTheme(LIGHT_THEME, {
      id: "custom-theme",
      name: "Custom Theme",
    });

    expect(custom.id).toBe("custom-theme");
    expect(custom.name).toBe("Custom Theme");
    expect(custom.isBuiltIn).toBe(false);
  });
});

describe("validateTheme", () => {
  it("accepts a valid theme", () => {
    expect(validateTheme(LIGHT_THEME)).toBe(true);
  });

  it("rejects empty id", () => {
    const invalid = { ...LIGHT_THEME, id: "" };
    expect(validateTheme(invalid)).toBe(false);
  });

  it("rejects invalid colors", () => {
    const invalid = {
      ...LIGHT_THEME,
      colors: { ...LIGHT_THEME.colors, background: 123 },
    };
    expect(validateTheme(invalid)).toBe(false);
  });

  it("rejects invalid priority colors", () => {
    const invalid = {
      ...LIGHT_THEME,
      colors: {
        ...LIGHT_THEME.colors,
        priority: { ...LIGHT_THEME.colors.priority, error: 123 },
      },
    };
    expect(validateTheme(invalid)).toBe(false);
  });

  it("rejects invalid typography", () => {
    const invalid = {
      ...LIGHT_THEME,
      typography: { ...LIGHT_THEME.typography, fontSize: "big" },
    };
    expect(validateTheme(invalid)).toBe(false);
  });
});

describe("exportTheme", () => {
  it("exports with isBuiltIn forced to false", () => {
    const json = exportTheme({ ...LIGHT_THEME, isBuiltIn: true });
    const parsed = JSON.parse(json) as typeof LIGHT_THEME;
    expect(parsed.isBuiltIn).toBe(false);
    expect(parsed.id).toBe(LIGHT_THEME.id);
  });
});

describe("importTheme", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("imports valid JSON and assigns a new id", () => {
    const json = exportTheme(LIGHT_THEME);
    const imported = importTheme(json);
    expect(imported).not.toBeNull();
    expect(imported?.id).toBe(`imported-${Date.now()}`);
    expect(imported?.isBuiltIn).toBe(false);
  });

  it("returns null for invalid JSON", () => {
    expect(importTheme("{bad json")).toBeNull();
    expect(importTheme(JSON.stringify({}))).toBeNull();
  });
});

describe("getPriorityKey", () => {
  it("maps known priorities and falls back to debug", () => {
    expect(getPriorityKey(0)).toBe("emergency");
    expect(getPriorityKey(1)).toBe("alert");
    expect(getPriorityKey(2)).toBe("critical");
    expect(getPriorityKey(3)).toBe("error");
    expect(getPriorityKey(4)).toBe("warning");
    expect(getPriorityKey(5)).toBe("notice");
    expect(getPriorityKey(6)).toBe("info");
    expect(getPriorityKey(7)).toBe("debug");
    expect(getPriorityKey(9)).toBe("debug");
  });
});
