import { beforeEach, describe, expect, it } from "vitest";
import { useStatisticsStore } from "../statisticsStore";

const initialState = useStatisticsStore.getState();

beforeEach(() => {
  useStatisticsStore.setState(initialState, true);
});

it("initializes with defaults", () => {
  const state = useStatisticsStore.getState();
  expect(state.viewMode).toBe("logs");
  expect(state.granularity).toBe("auto");
  expect(state.statistics).toBeNull();
  expect(state.isLoading).toBe(false);
  expect(state.error).toBeNull();
});

it("updates state fields", () => {
  const store = useStatisticsStore.getState();
  store.setViewMode("statistics");
  store.setGranularity("1hour");
  store.setStatistics({
    timeseries: [],
    priorityDistribution: [],
    topServices: [],
    totalCount: 10,
    errorRate: 0.2,
  });
  store.setLoading(true);
  store.setError("Oops");

  const state = useStatisticsStore.getState();
  expect(state.viewMode).toBe("statistics");
  expect(state.granularity).toBe("1hour");
  expect(state.statistics?.totalCount).toBe(10);
  expect(state.isLoading).toBe(true);
  expect(state.error).toBe("Oops");
});
