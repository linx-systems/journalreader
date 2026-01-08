import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PriorityFilter } from "../PriorityFilter";
import { useFilterStore } from "../../../stores/filterStore";

beforeEach(() => {
  useFilterStore.getState().resetFilter();
});

afterEach(() => {
  cleanup();
});

describe("PriorityFilter", () => {
  it("renders with all priorities selected by default", () => {
    render(<PriorityFilter />);

    expect(screen.getByText("All priorities")).toBeInTheDocument();
    expect(screen.getByText("Priority Range")).toBeInTheDocument();
  });

  it("renders All and Errors quick select buttons", () => {
    render(<PriorityFilter />);

    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Errors" })).toBeInTheDocument();
  });

  it("selects error priorities when Errors button is clicked", async () => {
    const user = userEvent.setup();
    render(<PriorityFilter />);

    const errorsButton = screen.getByRole("button", { name: "Errors" });
    await user.click(errorsButton);

    const state = useFilterStore.getState();
    expect(state.filter.priorities).toEqual([0, 1, 2, 3]);
  });

  it("selects all priorities when All button is clicked", async () => {
    const user = userEvent.setup();

    useFilterStore.getState().setFilter({ priorities: [0, 1, 2, 3] });

    render(<PriorityFilter />);

    const allButton = screen.getByRole("button", { name: "All" });
    await user.click(allButton);

    const state = useFilterStore.getState();
    expect(state.filter.priorities).toBeUndefined();
  });

  it("displays correct range label for single priority", () => {
    useFilterStore.getState().setFilter({ priorities: [3] });

    render(<PriorityFilter />);

    // Check that the single priority label "err" is displayed (priority 3 = err)
    expect(screen.getByText("err")).toBeInTheDocument();
    // Ensure "All priorities" is NOT displayed
    expect(screen.queryByText("All priorities")).not.toBeInTheDocument();
  });

  it("displays correct range label for priority range", () => {
    useFilterStore.getState().setFilter({ priorities: [0, 1, 2, 3] });

    render(<PriorityFilter />);

    // Check that the range label includes emerg and error
    expect(screen.getByText(/emerg.*err/)).toBeInTheDocument();
  });

  it("handles min range slider change", () => {
    render(<PriorityFilter />);

    const sliders = screen.getAllByRole("slider");
    const minSlider = sliders[0];

    fireEvent.change(minSlider, { target: { value: "2" } });

    const state = useFilterStore.getState();
    expect(state.filter.priorities).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it("handles max range slider change", () => {
    render(<PriorityFilter />);

    const sliders = screen.getAllByRole("slider");
    const maxSlider = sliders[1];

    fireEvent.change(maxSlider, { target: { value: "4" } });

    const state = useFilterStore.getState();
    expect(state.filter.priorities).toEqual([0, 1, 2, 3, 4]);
  });

  it("prevents min from exceeding max", () => {
    useFilterStore.getState().setFilter({ priorities: [3, 4, 5] });

    render(<PriorityFilter />);

    const sliders = screen.getAllByRole("slider");
    const minSlider = sliders[0];

    fireEvent.change(minSlider, { target: { value: "6" } });

    const state = useFilterStore.getState();
    expect(state.filter.priorities).toEqual([5]);
  });

  it("prevents max from going below min", () => {
    useFilterStore.getState().setFilter({ priorities: [3, 4, 5] });

    render(<PriorityFilter />);

    const sliders = screen.getAllByRole("slider");
    const maxSlider = sliders[1];

    fireEvent.change(maxSlider, { target: { value: "2" } });

    const state = useFilterStore.getState();
    expect(state.filter.priorities).toEqual([3]);
  });

  it("syncs with external filter changes", () => {
    const { rerender } = render(<PriorityFilter />);

    expect(screen.getByText("All priorities")).toBeInTheDocument();

    useFilterStore.getState().setFilter({ priorities: [0, 1, 2, 3] });

    rerender(<PriorityFilter />);

    // Check that the range label includes emerg and error
    expect(screen.getByText(/emerg.*err/)).toBeInTheDocument();
  });

  it("clears priorities when full range is selected", () => {
    useFilterStore.getState().setFilter({ priorities: [2, 3, 4] });

    render(<PriorityFilter />);

    const sliders = screen.getAllByRole("slider");
    const minSlider = sliders[0];
    const maxSlider = sliders[1];

    fireEvent.change(minSlider, { target: { value: "0" } });
    fireEvent.change(maxSlider, { target: { value: "7" } });

    const state = useFilterStore.getState();
    expect(state.filter.priorities).toBeUndefined();
  });
});
