import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { QuickFilters } from "../QuickFilters";
import { useFilterStore } from "../../../stores/filterStore";
import { useBookmarkStore } from "../../../stores/bookmarkStore";
import { QUICK_FILTERS, DEFAULT_FILTER } from "../../../lib/types";

beforeEach(() => {
  useFilterStore.getState().resetFilter();
  // Reset bookmark store manually preserving actions
  const store = useBookmarkStore.getState();
  store.bookmarks.forEach((b) => store.deleteBookmark(b.id));
  useBookmarkStore.getState().setActiveBookmark(null);
});

afterEach(() => {
  cleanup();
});

describe("QuickFilters", () => {
  it("renders all quick filter buttons", () => {
    render(<QuickFilters />);

    expect(screen.getByText("Quick Filters")).toBeInTheDocument();

    QUICK_FILTERS.forEach((qf) => {
      expect(screen.getByRole("button", { name: qf.label })).toBeInTheDocument();
    });
  });

  it("applies quick filter when clicked", async () => {
    const user = userEvent.setup();
    render(<QuickFilters />);

    const errorsFilter = QUICK_FILTERS.find((qf) => qf.id === "errors");
    if (!errorsFilter) throw new Error("Errors filter not found");

    const button = screen.getByRole("button", { name: errorsFilter.label });
    await user.click(button);

    const state = useFilterStore.getState();
    expect(state.filter.priorities).toEqual(errorsFilter.filters.priorities);
  });

  it("clears active bookmark when quick filter is applied", async () => {
    const user = userEvent.setup();
    const bookmark = useBookmarkStore.getState().addBookmark("Test", {});
    useBookmarkStore.getState().setActiveBookmark(bookmark.id);

    render(<QuickFilters />);

    const errorsFilter = QUICK_FILTERS.find((qf) => qf.id === "errors");
    if (!errorsFilter) throw new Error("Errors filter not found");

    const button = screen.getByRole("button", { name: errorsFilter.label });
    await user.click(button);

    expect(useBookmarkStore.getState().activeBookmarkId).toBeNull();
  });

  it("resets filter when clicking an active quick filter", async () => {
    const user = userEvent.setup();
    const errorsFilter = QUICK_FILTERS.find((qf) => qf.id === "errors");
    if (!errorsFilter) throw new Error("Errors filter not found");

    useFilterStore.getState().setFilter({ ...errorsFilter.filters });

    render(<QuickFilters />);

    const button = screen.getByRole("button", { name: errorsFilter.label });
    await user.click(button);

    const state = useFilterStore.getState();
    expect(state.filter.priorities).toBeUndefined();
  });

  it("applies boot filter correctly", async () => {
    const user = userEvent.setup();
    render(<QuickFilters />);

    const bootFilter = QUICK_FILTERS.find((qf) => qf.id === "this-boot");
    if (!bootFilter) throw new Error("This boot filter not found");

    const button = screen.getByRole("button", { name: bootFilter.label });
    await user.click(button);

    const state = useFilterStore.getState();
    expect(state.filter.bootOffset).toBe(bootFilter.filters.bootOffset);
  });

  it("applies time-based filter correctly", async () => {
    const user = userEvent.setup();
    render(<QuickFilters />);

    const todayFilter = QUICK_FILTERS.find((qf) => qf.id === "today");
    if (!todayFilter) throw new Error("Today filter not found");

    const button = screen.getByRole("button", { name: todayFilter.label });
    await user.click(button);

    const state = useFilterStore.getState();
    expect(state.filter.since).toBe(todayFilter.filters.since);
  });

  it("detects active state for priority-based filters", () => {
    const errorsFilter = QUICK_FILTERS.find((qf) => qf.id === "errors");
    if (!errorsFilter) throw new Error("Errors filter not found");

    useFilterStore.getState().setFilter({ priorities: errorsFilter.filters.priorities });

    render(<QuickFilters />);

    const button = screen.getByRole("button", { name: errorsFilter.label });
    expect(button.className).toContain("bg-accent");
  });

  it("detects inactive state when priorities do not match", () => {
    const errorsFilter = QUICK_FILTERS.find((qf) => qf.id === "errors");
    if (!errorsFilter) throw new Error("Errors filter not found");

    useFilterStore.getState().setFilter({ priorities: [0, 1] });

    render(<QuickFilters />);

    const button = screen.getByRole("button", { name: errorsFilter.label });
    expect(button.className).not.toContain("bg-accent");
  });

  it("detects active state for boot offset filters", () => {
    const bootFilter = QUICK_FILTERS.find((qf) => qf.id === "this-boot");
    if (!bootFilter) throw new Error("This boot filter not found");

    useFilterStore.getState().setFilter({ bootOffset: bootFilter.filters.bootOffset });

    render(<QuickFilters />);

    const button = screen.getByRole("button", { name: bootFilter.label });
    expect(button.className).toContain("bg-accent");
  });
});
