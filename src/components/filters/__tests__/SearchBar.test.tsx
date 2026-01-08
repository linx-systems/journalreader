import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SearchBar, SearchBarRef } from "../SearchBar";
import { useFilterStore } from "../../../stores/filterStore";
import { DEFAULT_FILTER } from "../../../lib/types";
import { createRef } from "react";

beforeEach(() => {
  useFilterStore.getState().resetFilter();
});

afterEach(() => {
  cleanup();
});

describe("SearchBar", () => {
  it("renders with empty input by default", () => {
    render(<SearchBar />);
    const input = screen.getByPlaceholderText("Search (regex)...");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("displays existing grep pattern from store", () => {
    useFilterStore.getState().setFilter({ grepPattern: "error" });
    render(<SearchBar />);
    const input = screen.getByPlaceholderText("Search (regex)...");
    expect(input).toHaveValue("error");
  });

  it("updates filter when typing", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByPlaceholderText("Search (regex)...");

    await user.type(input, "test");

    expect(useFilterStore.getState().filter.grepPattern).toBe("test");
  });

  it("shows clear button when input has value", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByPlaceholderText("Search (regex)...");

    // Initially no clear button (the toggle button is shown, not the clear X)
    const buttonsInitially = screen.queryAllByRole("button");
    expect(buttonsInitially).toHaveLength(1); // Only the case sensitive toggle

    await user.type(input, "test");

    // Now there should be 2 buttons: clear and case sensitive toggle
    const buttonsAfter = screen.getAllByRole("button");
    expect(buttonsAfter).toHaveLength(2);
  });

  it("clears input when clear button is clicked", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByPlaceholderText("Search (regex)...");

    await user.type(input, "test");
    expect(input).toHaveValue("test");

    // The clear button is the one without "Case sensitive" text
    const buttons = screen.getAllByRole("button");
    const clearButton = buttons.find((b) => !b.textContent?.includes("Case sensitive"));
    expect(clearButton).toBeDefined();

    await user.click(clearButton!);

    expect(input).toHaveValue("");
    expect(useFilterStore.getState().filter.grepPattern).toBeUndefined();
  });

  it("toggles case sensitivity", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);

    expect(useFilterStore.getState().filter.caseSensitive).toBeFalsy();

    const toggleButton = screen.getByText("Case sensitive");
    await user.click(toggleButton);

    expect(useFilterStore.getState().filter.caseSensitive).toBe(true);

    await user.click(toggleButton);

    expect(useFilterStore.getState().filter.caseSensitive).toBe(false);
  });

  it("exposes focus method via ref", () => {
    const ref = createRef<SearchBarRef>();
    render(<SearchBar ref={ref} />);

    const input = screen.getByPlaceholderText("Search (regex)...");

    ref.current?.focus();

    expect(document.activeElement).toBe(input);
  });

  it("syncs with external filter changes", () => {
    const { rerender } = render(<SearchBar />);
    const input = screen.getByPlaceholderText("Search (regex)...");

    expect(input).toHaveValue("");

    useFilterStore.getState().setFilter({ grepPattern: "external" });
    rerender(<SearchBar />);

    expect(input).toHaveValue("external");
  });

  it("sets grepPattern to undefined when clearing empty value", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByPlaceholderText("Search (regex)...");

    await user.type(input, "a");
    await user.clear(input);

    expect(useFilterStore.getState().filter.grepPattern).toBeUndefined();
  });
});
