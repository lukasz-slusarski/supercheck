jest.mock("@/lib/logger/index", () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

import {
  failOrphanedQueuedRuns,
  ORPHANED_QUEUED_ERROR,
} from "./orphaned-queued-runs";

function fakeDb(candidates: string[], closed: string[]) {
  const set = jest.fn();
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(candidates.map((id) => ({ id }))) }),
      }),
    }),
    update: () => ({
      set: (values: unknown) => {
        set(values);
        return { where: () => ({ returning: () => Promise.resolve(closed.map((id) => ({ id }))) }) };
      },
    }),
  };
  return { db: db as never, set };
}

function fakeRedis(queued: Record<string, string[]>) {
  return {
    scan: jest.fn().mockResolvedValue(["0", Object.keys(queued)]),
    zrange: jest.fn((key: string) => Promise.resolve(queued[key] ?? [])),
  } as never;
}

const queueWith = (ids: string[]) =>
  ({ getJob: jest.fn((id: string) => Promise.resolve(ids.includes(id) ? { id } : undefined)) }) as never;

describe("failOrphanedQueuedRuns", () => {
  it("closes only runs missing from both the capacity queue and BullMQ", async () => {
    const { db, set } = fakeDb(["lost", "waiting", "in-bullmq"], ["lost"]);
    const closed = await failOrphanedQueuedRuns({
      db,
      redis: fakeRedis({ "capacity:queued:org-1": ["waiting"] }),
      queues: [queueWith([]), queueWith(["in-bullmq"])],
    });
    expect(closed).toEqual(["lost"]);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error", errorDetails: ORPHANED_QUEUED_ERROR }),
    );
  });

  it("does nothing when every old queued run still has a queue entry", async () => {
    const { db, set } = fakeDb(["waiting"], []);
    const closed = await failOrphanedQueuedRuns({
      db,
      redis: fakeRedis({ "capacity:queued:org-1": ["waiting"] }),
      queues: [queueWith([])],
    });
    expect(closed).toEqual([]);
    expect(set).not.toHaveBeenCalled();
  });

  it("does not touch Redis when there are no old queued runs", async () => {
    const { db } = fakeDb([], []);
    const redis = fakeRedis({});
    await failOrphanedQueuedRuns({ db, redis, queues: [] });
    expect((redis as unknown as { scan: jest.Mock }).scan).not.toHaveBeenCalled();
  });
});
