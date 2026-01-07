# Add Unit Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Vitest-based unit tests for lib utilities, Tauri wrapper, and Zustand stores with >=80% coverage and passing test/coverage runs.

**Architecture:** Use Vitest in a jsdom environment with a small setup file for `matchMedia` and storage cleanup. Place tests beside target modules, mock Tauri `invoke`, and use fake timers for deterministic time-based logic.

**Tech Stack:** TypeScript, Vitest, @vitest/coverage-v8, jsdom, Vite

---

### Task 1: Add Vitest tooling and configuration

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `vitest.setup.ts`

**Step 1: Install dev dependencies**

Run:
```bash
npm install -D vitest @vitest/coverage-v8 jsdom
```
Expected: `package.json` and `package-lock.json` updated with the new dev dependencies.

**Step 2: Add test scripts**

Update `package.json` scripts to include:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:check": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "preview": "vite preview",
    "tauri": "tauri",
    "clean": "rm -rf dist node_modules/.vite node_modules/.cache",
    "test": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

**Step 3: Add Vitest config**

Update `vite.config.ts` to include a `test` block inside the `defineConfig` return object:
```ts
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/App.tsx',
        'src/components/**',
        'src/hooks/**',
        'src-tauri/**',
      ],
    },
  },
```

**Step 4: Add Vitest setup file**

Create `vitest.setup.ts`:
```ts
import { beforeEach } from 'vitest';

beforeEach(() => {
  localStorage.clear();
});

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
      addListener: () => {},
      removeListener: () => {},
    }),
  });
}
```

**Step 5: Commit**

```bash
git add package.json package-lock.json vite.config.ts vitest.setup.ts
git commit -m "test: add vitest setup"
```

---

### Task 2: Add unit tests for statistics utilities

**Files:**
- Create: `src/lib/__tests__/statistics.test.ts`

**Step 1: Write the tests**

Create `src/lib/__tests__/statistics.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeGranularityMs, getGranularityLabel } from '../statistics';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

describe('computeGranularityMs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns explicit granularity mapping', () => {
    expect(computeGranularityMs('10min')).toBe(10 * MINUTE_MS);
    expect(computeGranularityMs('1hour')).toBe(HOUR_MS);
    expect(computeGranularityMs('6hour')).toBe(6 * HOUR_MS);
    expect(computeGranularityMs('1day')).toBe(DAY_MS);
    expect(computeGranularityMs('1week')).toBe(WEEK_MS);
  });

  it('auto defaults to 15 minutes when no range provided', () => {
    expect(computeGranularityMs('auto')).toBe(10 * MINUTE_MS);
  });

  it('auto selects 10min for short ranges', () => {
    expect(computeGranularityMs('auto', '5 hours ago', '0 minutes ago')).toBe(
      10 * MINUTE_MS
    );
  });

  it('auto selects 1hour at the 6-hour boundary', () => {
    expect(computeGranularityMs('auto', '6 hours ago', '0 minutes ago')).toBe(
      HOUR_MS
    );
  });

  it('auto selects 6hour at the 7-day boundary', () => {
    expect(computeGranularityMs('auto', '7 days ago', '0 minutes ago')).toBe(
      6 * HOUR_MS
    );
  });

  it('auto selects 1day at the 30-day boundary', () => {
    expect(computeGranularityMs('auto', '30 days ago', '0 minutes ago')).toBe(
      DAY_MS
    );
  });

  it('auto selects 1week beyond 30 days', () => {
    expect(computeGranularityMs('auto', '31 days ago', '0 minutes ago')).toBe(
      WEEK_MS
    );
  });

  it('auto falls back to now for invalid inputs', () => {
    expect(computeGranularityMs('auto', 'not a date', 'also bad')).toBe(
      10 * MINUTE_MS
    );
  });

  it('auto parses ISO date strings', () => {
    expect(
      computeGranularityMs('auto', '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z')
    ).toBe(HOUR_MS);
  });
});

describe('getGranularityLabel', () => {
  it('returns labels for each granularity', () => {
    expect(getGranularityLabel('auto')).toBe('Auto');
    expect(getGranularityLabel('10min')).toBe('10 min');
    expect(getGranularityLabel('1hour')).toBe('1 hour');
    expect(getGranularityLabel('6hour')).toBe('6 hours');
    expect(getGranularityLabel('1day')).toBe('1 day');
    expect(getGranularityLabel('1week')).toBe('1 week');
  });
});
```

**Step 2: Run the test**

Run:
```bash
npm run test -- --run src/lib/__tests__/statistics.test.ts
```
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/__tests__/statistics.test.ts
git commit -m "test: cover statistics utilities"
```

---

### Task 3: Add unit tests for theme utilities

**Files:**
- Create: `src/lib/__tests__/theme.test.ts`

**Step 1: Write the tests**

Create `src/lib/__tests__/theme.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LIGHT_THEME,
  createCustomTheme,
  validateTheme,
  exportTheme,
  importTheme,
  getPriorityKey,
} from '../theme';

const NOW = new Date('2024-01-01T00:00:00Z');

describe('createCustomTheme', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('merges overrides and preserves nested defaults', () => {
    const custom = createCustomTheme(LIGHT_THEME, {
      name: 'Custom',
      colors: {
        accent: '#000000',
        priority: { error: '#111111' },
      },
      typography: { fontSize: 16 },
    });

    expect(custom.id).toBe(`custom-${Date.now()}`);
    expect(custom.isBuiltIn).toBe(false);
    expect(custom.name).toBe('Custom');
    expect(custom.colors.accent).toBe('#000000');
    expect(custom.colors.priority.error).toBe('#111111');
    expect(custom.colors.priority.warning).toBe(LIGHT_THEME.colors.priority.warning);
    expect(custom.typography.fontSize).toBe(16);
    expect(custom.typography.fontFamily).toBe(LIGHT_THEME.typography.fontFamily);
  });

  it('uses provided id and name when supplied', () => {
    const custom = createCustomTheme(LIGHT_THEME, {
      id: 'custom-theme',
      name: 'Custom Theme',
    });

    expect(custom.id).toBe('custom-theme');
    expect(custom.name).toBe('Custom Theme');
    expect(custom.isBuiltIn).toBe(false);
  });
});

describe('validateTheme', () => {
  it('accepts a valid theme', () => {
    expect(validateTheme(LIGHT_THEME)).toBe(true);
  });

  it('rejects empty id', () => {
    const invalid = { ...LIGHT_THEME, id: '' };
    expect(validateTheme(invalid)).toBe(false);
  });

  it('rejects invalid colors', () => {
    const invalid = {
      ...LIGHT_THEME,
      colors: { ...LIGHT_THEME.colors, background: 123 },
    };
    expect(validateTheme(invalid)).toBe(false);
  });

  it('rejects invalid priority colors', () => {
    const invalid = {
      ...LIGHT_THEME,
      colors: {
        ...LIGHT_THEME.colors,
        priority: { ...LIGHT_THEME.colors.priority, error: 123 },
      },
    };
    expect(validateTheme(invalid)).toBe(false);
  });

  it('rejects invalid typography', () => {
    const invalid = {
      ...LIGHT_THEME,
      typography: { ...LIGHT_THEME.typography, fontSize: 'big' },
    };
    expect(validateTheme(invalid)).toBe(false);
  });
});

describe('exportTheme', () => {
  it('exports with isBuiltIn forced to false', () => {
    const json = exportTheme({ ...LIGHT_THEME, isBuiltIn: true });
    const parsed = JSON.parse(json) as typeof LIGHT_THEME;
    expect(parsed.isBuiltIn).toBe(false);
    expect(parsed.id).toBe(LIGHT_THEME.id);
  });
});

describe('importTheme', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('imports valid JSON and assigns a new id', () => {
    const json = exportTheme(LIGHT_THEME);
    const imported = importTheme(json);
    expect(imported).not.toBeNull();
    expect(imported?.id).toBe(`imported-${Date.now()}`);
    expect(imported?.isBuiltIn).toBe(false);
  });

  it('returns null for invalid JSON', () => {
    expect(importTheme('{bad json')).toBeNull();
    expect(importTheme(JSON.stringify({}))).toBeNull();
  });
});

describe('getPriorityKey', () => {
  it('maps known priorities and falls back to debug', () => {
    expect(getPriorityKey(0)).toBe('emergency');
    expect(getPriorityKey(1)).toBe('alert');
    expect(getPriorityKey(2)).toBe('critical');
    expect(getPriorityKey(3)).toBe('error');
    expect(getPriorityKey(4)).toBe('warning');
    expect(getPriorityKey(5)).toBe('notice');
    expect(getPriorityKey(6)).toBe('info');
    expect(getPriorityKey(7)).toBe('debug');
    expect(getPriorityKey(9)).toBe('debug');
  });
});
```

**Step 2: Run the test**

Run:
```bash
npm run test -- --run src/lib/__tests__/theme.test.ts
```
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/__tests__/theme.test.ts
git commit -m "test: cover theme utilities"
```

---

### Task 4: Add unit tests for Tauri API wrapper

**Files:**
- Create: `src/lib/__tests__/tauri.test.ts`

**Step 1: Write the tests**

Create `src/lib/__tests__/tauri.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  queryJournal,
  listUnits,
  listBoots,
  getLogCount,
  startFollow,
  stopFollow,
  isFollowing,
  getStatistics,
} from '../tauri';
import type {
  JournalQueryResult,
  SystemUnit,
  BootInfo,
  JournalStatistics,
  StatisticsRequest,
} from '../types';
import { DEFAULT_FILTER } from '../types';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

beforeEach(() => {
  invokeMock.mockReset();
});

it('queryJournal calls invoke with filter', async () => {
  const result: JournalQueryResult = { entries: [], hasMore: false };
  const filter = { ...DEFAULT_FILTER };
  invokeMock.mockResolvedValueOnce(result);

  const response = await queryJournal(filter);

  expect(invokeMock).toHaveBeenCalledWith('query_journal', { filter });
  expect(response).toBe(result);
});

it('listUnits calls invoke', async () => {
  const units: SystemUnit[] = [{ name: 'ssh.service' }];
  invokeMock.mockResolvedValueOnce(units);

  const response = await listUnits();

  expect(invokeMock).toHaveBeenCalledWith('list_units');
  expect(response).toBe(units);
});

it('listBoots calls invoke', async () => {
  const boots: BootInfo[] = [{ bootId: 'boot-1', bootOffset: 0 }];
  invokeMock.mockResolvedValueOnce(boots);

  const response = await listBoots();

  expect(invokeMock).toHaveBeenCalledWith('list_boots');
  expect(response).toBe(boots);
});

it('getLogCount calls invoke with filter', async () => {
  const filter = { ...DEFAULT_FILTER };
  invokeMock.mockResolvedValueOnce(42);

  const response = await getLogCount(filter);

  expect(invokeMock).toHaveBeenCalledWith('get_log_count', { filter });
  expect(response).toBe(42);
});

it('startFollow calls invoke with filter', async () => {
  const filter = { ...DEFAULT_FILTER };
  invokeMock.mockResolvedValueOnce(undefined);

  await startFollow(filter);

  expect(invokeMock).toHaveBeenCalledWith('start_follow', { filter });
});

it('stopFollow calls invoke', async () => {
  invokeMock.mockResolvedValueOnce(undefined);

  await stopFollow();

  expect(invokeMock).toHaveBeenCalledWith('stop_follow');
});

it('isFollowing calls invoke', async () => {
  invokeMock.mockResolvedValueOnce(true);

  const response = await isFollowing();

  expect(invokeMock).toHaveBeenCalledWith('is_following');
  expect(response).toBe(true);
});

it('getStatistics calls invoke with request', async () => {
  const request: StatisticsRequest = {
    units: [],
    excludedUnits: [],
    caseSensitive: false,
    granularityMs: 600000,
  };
  const stats: JournalStatistics = {
    timeseries: [],
    priorityDistribution: [],
    topServices: [],
    totalCount: 10,
    errorRate: 0.1,
  };
  invokeMock.mockResolvedValueOnce(stats);

  const response = await getStatistics(request);

  expect(invokeMock).toHaveBeenCalledWith('get_statistics', { request });
  expect(response).toBe(stats);
});
```

**Step 2: Run the test**

Run:
```bash
npm run test -- --run src/lib/__tests__/tauri.test.ts
```
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/__tests__/tauri.test.ts
git commit -m "test: cover tauri api wrapper"
```

---

### Task 5: Add unit tests for Zustand stores

**Files:**
- Create: `src/stores/__tests__/filterStore.test.ts`
- Create: `src/stores/__tests__/statisticsStore.test.ts`
- Create: `src/stores/__tests__/bookmarkStore.test.ts`
- Create: `src/stores/__tests__/themeStore.test.ts`

**Step 1: Write filter store tests**

Create `src/stores/__tests__/filterStore.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useFilterStore } from '../filterStore';
import { DEFAULT_FILTER } from '../../lib/types';

const entry = {
  cursor: 'cursor-1',
  realtimeTimestamp: 1,
  bootId: 'boot-1',
  message: 'hello',
  priority: 3,
};

const initialState = useFilterStore.getState();

beforeEach(() => {
  useFilterStore.setState(initialState, true);
});

it('initializes with defaults', () => {
  const state = useFilterStore.getState();
  expect(state.filter).toEqual({ ...DEFAULT_FILTER, since: '15 minutes ago' });
  expect(state.entries).toEqual([]);
  expect(state.hasMore).toBe(false);
});

it('setFilter resets pagination when not following', () => {
  const store = useFilterStore.getState();
  store.setEntries([entry]);
  store.setCursorEnd('cursor-end');
  store.setHasMore(true);
  store.setFollowing(false);

  store.setFilter({ units: ['ssh.service'] });

  const state = useFilterStore.getState();
  expect(state.entries).toEqual([]);
  expect(state.cursorEnd).toBeNull();
  expect(state.hasMore).toBe(false);
  expect(state.filter.units).toEqual(['ssh.service']);
});

it('setFilter keeps pagination when following', () => {
  const store = useFilterStore.getState();
  store.setEntries([entry]);
  store.setCursorEnd('cursor-end');
  store.setHasMore(true);
  store.setFollowing(true);

  store.setFilter({ units: ['ssh.service'] });

  const state = useFilterStore.getState();
  expect(state.entries).toEqual([entry]);
  expect(state.cursorEnd).toBe('cursor-end');
  expect(state.hasMore).toBe(true);
});

it('appendEntries adds to the end', () => {
  const store = useFilterStore.getState();
  store.setEntries([entry]);
  store.appendEntries([{ ...entry, cursor: 'cursor-2' }]);

  const state = useFilterStore.getState();
  expect(state.entries.map((e) => e.cursor)).toEqual(['cursor-1', 'cursor-2']);
});

it('prependEntries adds to the beginning', () => {
  const store = useFilterStore.getState();
  store.setEntries([entry]);
  store.prependEntries([{ ...entry, cursor: 'cursor-0' }]);

  const state = useFilterStore.getState();
  expect(state.entries.map((e) => e.cursor)).toEqual(['cursor-0', 'cursor-1']);
});

it('resetFilter clears state', () => {
  const store = useFilterStore.getState();
  store.setEntries([entry]);
  store.setCursorEnd('cursor-end');
  store.setHasMore(true);

  store.resetFilter();

  const state = useFilterStore.getState();
  expect(state.filter).toEqual({ ...DEFAULT_FILTER, since: '15 minutes ago' });
  expect(state.entries).toEqual([]);
  expect(state.cursorEnd).toBeNull();
  expect(state.hasMore).toBe(false);
  expect(state.error).toBeNull();
});
```

**Step 2: Write statistics store tests**

Create `src/stores/__tests__/statisticsStore.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStatisticsStore } from '../statisticsStore';

const initialState = useStatisticsStore.getState();

beforeEach(() => {
  useStatisticsStore.setState(initialState, true);
});

it('initializes with defaults', () => {
  const state = useStatisticsStore.getState();
  expect(state.viewMode).toBe('logs');
  expect(state.granularity).toBe('auto');
  expect(state.statistics).toBeNull();
  expect(state.isLoading).toBe(false);
  expect(state.error).toBeNull();
});

it('updates state fields', () => {
  const store = useStatisticsStore.getState();
  store.setViewMode('statistics');
  store.setGranularity('1hour');
  store.setStatistics({
    timeseries: [],
    priorityDistribution: [],
    topServices: [],
    totalCount: 10,
    errorRate: 0.2,
  });
  store.setLoading(true);
  store.setError('Oops');

  const state = useStatisticsStore.getState();
  expect(state.viewMode).toBe('statistics');
  expect(state.granularity).toBe('1hour');
  expect(state.statistics?.totalCount).toBe(10);
  expect(state.isLoading).toBe(true);
  expect(state.error).toBe('Oops');
});
```

**Step 3: Write bookmark store tests**

Create `src/stores/__tests__/bookmarkStore.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useBookmarkStore } from '../bookmarkStore';
import type { Bookmark } from '../bookmarkStore';

const initialState = useBookmarkStore.getState();
const START = new Date('2024-01-01T00:00:00Z');

beforeEach(() => {
  localStorage.clear();
  useBookmarkStore.setState(initialState, true);
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

it('adds a bookmark with metadata', () => {
  const store = useBookmarkStore.getState();
  const bookmark = store.addBookmark('Test', { units: ['ssh.service'] }, 'desc');

  const state = useBookmarkStore.getState();
  expect(bookmark.id).toMatch(/^bookmark-\d+-[a-z0-9]{7}$/);
  expect(bookmark.createdAt).toBe(Date.now());
  expect(state.bookmarks).toHaveLength(1);
  expect(state.bookmarks[0].name).toBe('Test');
});

it('updates a bookmark', () => {
  const store = useBookmarkStore.getState();
  const { id } = store.addBookmark('Test', {});

  store.updateBookmark(id, { name: 'Updated' });

  const state = useBookmarkStore.getState();
  expect(state.bookmarks[0].name).toBe('Updated');
});

it('deletes a bookmark and clears active selection', () => {
  const store = useBookmarkStore.getState();
  const { id } = store.addBookmark('Test', {});
  store.setActiveBookmark(id);

  store.deleteBookmark(id);

  const state = useBookmarkStore.getState();
  expect(state.bookmarks).toHaveLength(0);
  expect(state.activeBookmarkId).toBeNull();
});

it('marks a bookmark as used', () => {
  const store = useBookmarkStore.getState();
  const { id } = store.addBookmark('Test', {});

  vi.setSystemTime(new Date('2024-01-01T01:00:00Z'));
  store.markAsUsed(id);

  const state = useBookmarkStore.getState();
  expect(state.bookmarks[0].lastUsed).toBe(Date.now());
});

it('gets bookmark by index', () => {
  const store = useBookmarkStore.getState();
  const bookmark = store.addBookmark('Test', {});

  expect(store.getBookmarkByIndex(0)?.id).toBe(bookmark.id);
});

it('imports and exports bookmarks', () => {
  const store = useBookmarkStore.getState();
  const valid: Bookmark = {
    id: 'import-1',
    name: 'Imported',
    filters: {},
    createdAt: 1,
  };
  const invalid = { id: 123 };

  store.importBookmarks([valid, invalid as unknown as Bookmark]);

  const state = useBookmarkStore.getState();
  expect(state.bookmarks).toHaveLength(1);
  expect(state.bookmarks[0].id).toMatch(/^bookmark-\d+-[a-z0-9]{7}$/);

  const exported = store.exportBookmarks();
  expect(exported).toEqual(state.bookmarks);
});
```

**Step 4: Write theme store tests**

Create `src/stores/__tests__/themeStore.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useThemeStore } from '../themeStore';
import { LIGHT_THEME, createCustomTheme } from '../../lib/theme';

const initialState = useThemeStore.getState();
const NOW = new Date('2024-01-01T00:00:00Z');

beforeEach(() => {
  localStorage.clear();
  useThemeStore.setState(initialState, true);
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

it('returns dark theme by default', () => {
  const theme = useThemeStore.getState().getCurrentTheme();
  expect(theme.id).toBe('dark');
});

it('setTheme updates currentThemeId and disables followSystem', () => {
  const store = useThemeStore.getState();
  store.setFollowSystem(true);
  store.setTheme('light');

  const state = useThemeStore.getState();
  expect(state.currentThemeId).toBe('light');
  expect(state.followSystem).toBe(false);
});

it('followSystem uses system theme preference', () => {
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
  expect(theme.id).toBe('dark');
});

it('adds and updates custom themes', () => {
  const store = useThemeStore.getState();
  const custom = createCustomTheme(LIGHT_THEME, { id: 'custom-1', name: 'Custom' });
  store.addCustomTheme(custom);
  store.updateCustomTheme('custom-1', { name: 'Updated' });

  const updated = store.getAllThemes().find((t) => t.id === 'custom-1');
  expect(updated?.name).toBe('Updated');
  expect(updated?.isBuiltIn).toBe(false);
});

it('deleteCustomTheme removes custom themes and resets current theme', () => {
  const store = useThemeStore.getState();
  const custom = createCustomTheme(LIGHT_THEME, { id: 'custom-2', name: 'Custom 2' });
  store.addCustomTheme(custom);
  store.setTheme('custom-2');

  store.deleteCustomTheme('custom-2');

  const state = useThemeStore.getState();
  expect(state.customThemes).toHaveLength(0);
  expect(state.currentThemeId).toBe('dark');
});

it('duplicateTheme creates a copy', () => {
  const store = useThemeStore.getState();
  const duplicated = store.duplicateTheme('light');

  expect(duplicated).not.toBeNull();
  expect(duplicated?.id).toBe(`custom-${Date.now()}`);
  expect(duplicated?.name).toBe('Light (Copy)');
  expect(store.customThemes).toContainEqual(duplicated);
});

it('importTheme adds a validated theme with a new id', () => {
  const store = useThemeStore.getState();
  store.importTheme(LIGHT_THEME);

  const imported = store.customThemes.find((t) => t.id === `imported-${Date.now()}`);
  expect(imported).toBeDefined();
  expect(imported?.isBuiltIn).toBe(false);
});
```

**Step 5: Run the store tests**

Run:
```bash
npm run test -- --run src/stores/__tests__/filterStore.test.ts
npm run test -- --run src/stores/__tests__/statisticsStore.test.ts
npm run test -- --run src/stores/__tests__/bookmarkStore.test.ts
npm run test -- --run src/stores/__tests__/themeStore.test.ts
```
Expected: PASS

**Step 6: Commit**

```bash
git add src/stores/__tests__/*.test.ts
git commit -m "test: cover zustand stores"
```

---

### Task 6: Run full test suite and coverage

**Files:**
- Create: `coverage/` (generated)

**Step 1: Run all tests**

Run:
```bash
npm run test -- --run
```
Expected: PASS

**Step 2: Run coverage**

Run:
```bash
npm run test:coverage
```
Expected: Coverage summary printed; overall >= 80% for `src/lib` and `src/stores`.

**Step 3: Commit (optional)**

```bash
git add .
git commit -m "test: add unit coverage"
```
