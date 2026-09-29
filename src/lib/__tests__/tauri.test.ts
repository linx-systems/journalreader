import { beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  getLogCount,
  getStatistics,
  isFollowing,
  listBoots,
  listUnits,
  queryJournal,
  queryRemoteJournal,
  isRemoteFollowing,
  startFollow,
  startRemoteFollow,
  stopFollow,
  stopRemoteFollow,
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

it("queryRemoteJournal binds host ID and filter", async () => {
  const result: JournalQueryResult = { entries: [], hasMore: false };
  const filter = { ...DEFAULT_FILTER };
  invokeMock.mockResolvedValueOnce(result);

  const response = await queryRemoteJournal("host-a", filter);

  expect(invokeMock).toHaveBeenCalledWith("query_remote_journal", {
    hostId: "host-a",
    filter,
  });
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

it("startFollow binds its session ID", async () => {
  const filter = { ...DEFAULT_FILTER };
  invokeMock.mockResolvedValueOnce(undefined);

  await startFollow(filter, "local-session");

  expect(invokeMock).toHaveBeenCalledWith("start_follow", { filter, sessionId: "local-session" });
});

it("stopFollow binds its session ID", async () => {
  invokeMock.mockResolvedValueOnce(undefined);

  await stopFollow("local-session");

  expect(invokeMock).toHaveBeenCalledWith("stop_follow", { sessionId: "local-session" });
});

it("remote follow commands require host and session IDs", async () => {
  const filter = { ...DEFAULT_FILTER };
  invokeMock.mockResolvedValue(undefined);

  await startRemoteFollow("host-a", filter, "remote-session", "password");
  await stopRemoteFollow("host-a", "remote-session");
  await isRemoteFollowing("host-a");

  expect(invokeMock).toHaveBeenNthCalledWith(1, "start_remote_follow", {
    hostId: "host-a", filter, sessionId: "remote-session", password: "password",
  });
  expect(invokeMock).toHaveBeenNthCalledWith(2, "stop_remote_follow", {
    hostId: "host-a", sessionId: "remote-session",
  });
  expect(invokeMock).toHaveBeenNthCalledWith(3, "is_remote_following", { hostId: "host-a" });
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
