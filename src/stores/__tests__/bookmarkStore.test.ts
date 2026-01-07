import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useBookmarkStore } from "../bookmarkStore";
import type { Bookmark } from "../bookmarkStore";

const initialState = useBookmarkStore.getState();
const START = new Date("2024-01-01T00:00:00Z");

beforeEach(() => {
  localStorage.clear();
  useBookmarkStore.setState(initialState, true);
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

it("adds a bookmark with metadata", () => {
  const store = useBookmarkStore.getState();
  const bookmark = store.addBookmark("Test", { units: ["ssh.service"] }, "desc");

  const state = useBookmarkStore.getState();
  expect(bookmark.id).toMatch(/^bookmark-\d+-[a-z0-9]{7}$/);
  expect(bookmark.createdAt).toBe(Date.now());
  expect(state.bookmarks).toHaveLength(1);
  expect(state.bookmarks[0].name).toBe("Test");
});

it("updates a bookmark", () => {
  const store = useBookmarkStore.getState();
  const { id } = store.addBookmark("Test", {});

  store.updateBookmark(id, { name: "Updated" });

  const state = useBookmarkStore.getState();
  expect(state.bookmarks[0].name).toBe("Updated");
});

it("deletes a bookmark and clears active selection", () => {
  const store = useBookmarkStore.getState();
  const { id } = store.addBookmark("Test", {});
  store.setActiveBookmark(id);

  store.deleteBookmark(id);

  const state = useBookmarkStore.getState();
  expect(state.bookmarks).toHaveLength(0);
  expect(state.activeBookmarkId).toBeNull();
});

it("marks a bookmark as used", () => {
  const store = useBookmarkStore.getState();
  const { id } = store.addBookmark("Test", {});

  vi.setSystemTime(new Date("2024-01-01T01:00:00Z"));
  store.markAsUsed(id);

  const state = useBookmarkStore.getState();
  expect(state.bookmarks[0].lastUsed).toBe(Date.now());
});

it("gets bookmark by index", () => {
  const store = useBookmarkStore.getState();
  const bookmark = store.addBookmark("Test", {});

  expect(store.getBookmarkByIndex(0)?.id).toBe(bookmark.id);
});

it("imports and exports bookmarks", () => {
  const store = useBookmarkStore.getState();
  const valid: Bookmark = {
    id: "import-1",
    name: "Imported",
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
