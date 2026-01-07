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

it("prependEntries adds to the beginning", () => {
  const store = useFilterStore.getState();
  store.setEntries([entry]);
  store.prependEntries([{ ...entry, cursor: "cursor-0" }]);

  const state = useFilterStore.getState();
  expect(state.entries.map((e) => e.cursor)).toEqual(["cursor-0", "cursor-1"]);
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
