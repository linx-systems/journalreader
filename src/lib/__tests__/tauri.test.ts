import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  getLogCount,
  getStatistics,
  isFollowing,
  listBoots,
  listUnits,
  queryJournal,
  startFollow,
  stopFollow,
} from "../tauri";
import type {
  BootInfo,
  JournalQueryResult,
  JournalStatistics,
  StatisticsRequest,
  SystemUnit,
} from "../types";
import { DEFAULT_FILTER } from "../types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

beforeEach(() => {
  invokeMock.mockReset();
});

it("queryJournal calls invoke with filter", async () => {
  const result: JournalQueryResult = { entries: [], hasMore: false };
  const filter = { ...DEFAULT_FILTER };
  invokeMock.mockResolvedValueOnce(result);

  const response = await queryJournal(filter);

  expect(invokeMock).toHaveBeenCalledWith("query_journal", { filter });
  expect(response).toBe(result);
});

it("listUnits calls invoke", async () => {
  const units: SystemUnit[] = [{ name: "ssh.service" }];
  invokeMock.mockResolvedValueOnce(units);

  const response = await listUnits();

  expect(invokeMock).toHaveBeenCalledWith("list_units");
  expect(response).toBe(units);
});

it("listBoots calls invoke", async () => {
  const boots: BootInfo[] = [{ bootId: "boot-1", bootOffset: 0 }];
  invokeMock.mockResolvedValueOnce(boots);

  const response = await listBoots();

  expect(invokeMock).toHaveBeenCalledWith("list_boots");
  expect(response).toBe(boots);
});

it("getLogCount calls invoke with filter", async () => {
  const filter = { ...DEFAULT_FILTER };
  invokeMock.mockResolvedValueOnce(42);

  const response = await getLogCount(filter);

  expect(invokeMock).toHaveBeenCalledWith("get_log_count", { filter });
  expect(response).toBe(42);
});

it("startFollow calls invoke with filter", async () => {
  const filter = { ...DEFAULT_FILTER };
  invokeMock.mockResolvedValueOnce(undefined);

  await startFollow(filter);

  expect(invokeMock).toHaveBeenCalledWith("start_follow", { filter });
});

it("stopFollow calls invoke", async () => {
  invokeMock.mockResolvedValueOnce(undefined);

  await stopFollow();

  expect(invokeMock).toHaveBeenCalledWith("stop_follow");
});

it("isFollowing calls invoke", async () => {
  invokeMock.mockResolvedValueOnce(true);

  const response = await isFollowing();

  expect(invokeMock).toHaveBeenCalledWith("is_following");
  expect(response).toBe(true);
});

it("getStatistics calls invoke with request", async () => {
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

  expect(invokeMock).toHaveBeenCalledWith("get_statistics", { request });
  expect(response).toBe(stats);
});
