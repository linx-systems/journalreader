import { beforeEach, expect, it } from "vitest";
import { useFilterStore } from "../filterStore";
import { DEFAULT_FILTER } from "../../lib/types";

const entry = {
  cursor: "cursor-1",
  realtimeTimestamp: 1,
  bootId: "boot-1",
  message: "hello",
  priority: 3,
};

const initialState = useFilterStore.getState();

beforeEach(() => {
  useFilterStore.setState(initialState, true);
});

it("initializes with defaults", () => {
  const state = useFilterStore.getState();
  expect(state.filter).toEqual({ ...DEFAULT_FILTER, since: "15 minutes ago" });
  expect(state.entries).toEqual([]);
  expect(state.hasMore).toBe(false);
});

it("increments result generation only when replacing the first page", () => {
  const store = useFilterStore.getState();
  const initialGeneration = store.resultGeneration;

  store.setEntries([entry]);
  const replacementGeneration = useFilterStore.getState().resultGeneration;
  store.appendEntries([{ ...entry, cursor: "cursor-2" }]);
  store.prependEntries([{ ...entry, cursor: "cursor-3" }]);

  expect(replacementGeneration).toBe(initialGeneration + 1);
  expect(useFilterStore.getState().resultGeneration).toBe(replacementGeneration);
});

it("setFilter resets pagination when not following", () => {
  const store = useFilterStore.getState();
  store.setEntries([entry]);
  store.setCursorEnd("cursor-end");
  store.setHasMore(true);
  store.setFollowing(false);

  store.setFilter({ units: ["ssh.service"] });

  const state = useFilterStore.getState();
  expect(state.entries).toEqual([]);
  expect(state.cursorEnd).toBeNull();
  expect(state.hasMore).toBe(false);
  expect(state.filter.units).toEqual(["ssh.service"]);
});

it("setFilter keeps pagination when following", () => {
  const store = useFilterStore.getState();
  store.setEntries([entry]);
  store.setCursorEnd("cursor-end");
  store.setHasMore(true);
  store.setFollowing(true);

  store.setFilter({ units: ["ssh.service"] });

  const state = useFilterStore.getState();
  expect(state.entries).toEqual([entry]);
  expect(state.cursorEnd).toBe("cursor-end");
  expect(state.hasMore).toBe(true);
});

it("appendEntries adds to the end", () => {
  const store = useFilterStore.getState();
  store.setEntries([entry]);
  store.appendEntries([{ ...entry, cursor: "cursor-2" }]);

  const state = useFilterStore.getState();
  expect(state.entries.map((e) => e.cursor)).toEqual(["cursor-1", "cursor-2"]);
});
it("does not duplicate page entries when an append is retried", () => {
  const store = useFilterStore.getState();
  store.setEntries([entry]);

  store.appendEntries([
    { ...entry, cursor: "cursor-2" },
    { ...entry, cursor: "cursor-2" },
    entry,
  ]);

  expect(useFilterStore.getState().entries.map((item) => item.cursor)).toEqual([
    "cursor-1",
    "cursor-2",
  ]);
});


it("prependEntries adds to the beginning", () => {
  const store = useFilterStore.getState();
  store.setEntries([entry]);
  store.prependEntries([{ ...entry, cursor: "cursor-0" }]);

  const state = useFilterStore.getState();
  expect(state.entries.map((e) => e.cursor)).toEqual(["cursor-0", "cursor-1"]);
});
it("deduplicates live batches and reverses chronological batches for newest-first", () => {
  const store = useFilterStore.getState();
  store.setEntries([{ ...entry, cursor: "existing" }]);

  store.prependEntries([
    { ...entry, cursor: "first" },
    { ...entry, cursor: "duplicate" },
    { ...entry, cursor: "duplicate" },
    { ...entry, cursor: "last" },
    { ...entry, cursor: "existing" },
  ]);

  expect(useFilterStore.getState().entries.map((item) => item.cursor)).toEqual([
    "last",
    "duplicate",
    "first",
    "existing",
  ]);
});

it("keeps chronological live batches at the oldest-first edge", () => {
  const store = useFilterStore.getState();
  store.setFilter({ reverse: false });
  store.setEntries([{ ...entry, cursor: "existing" }]);

  store.prependEntries([
    { ...entry, cursor: "first" },
    { ...entry, cursor: "last" },
  ]);

  expect(useFilterStore.getState().entries.map((item) => item.cursor)).toEqual([
    "existing",
    "first",
    "last",
  ]);
});


it("resetFilter clears state", () => {
  const store = useFilterStore.getState();
  store.setEntries([entry]);
  store.setCursorEnd("cursor-end");
  store.setHasMore(true);

  store.resetFilter();

  const state = useFilterStore.getState();
  expect(state.filter).toEqual({ ...DEFAULT_FILTER, since: "15 minutes ago" });
  expect(state.entries).toEqual([]);
  expect(state.cursorEnd).toBeNull();
  expect(state.hasMore).toBe(false);
  expect(state.error).toBeNull();
});

it("setLoading updates isLoading state", () => {
  const store = useFilterStore.getState();
  expect(store.isLoading).toBe(false);

  store.setLoading(true);
  expect(useFilterStore.getState().isLoading).toBe(true);

  store.setLoading(false);
  expect(useFilterStore.getState().isLoading).toBe(false);
});

it("setError updates error state", () => {
  const store = useFilterStore.getState();
  expect(store.error).toBeNull();

  store.setError("Something went wrong");
  expect(useFilterStore.getState().error).toBe("Something went wrong");

  store.setError(null);
  expect(useFilterStore.getState().error).toBeNull();
});

it("setFollowPaused updates isFollowPaused state", () => {
  const store = useFilterStore.getState();
  expect(store.isFollowPaused).toBe(false);

  store.setFollowPaused(true);
  expect(useFilterStore.getState().isFollowPaused).toBe(true);

  store.setFollowPaused(false);
  expect(useFilterStore.getState().isFollowPaused).toBe(false);
});
