import { and, eq, inArray, lt } from "drizzle-orm";
import type { Queue } from "bullmq";
import type Redis from "ioredis";

import { runs } from "@/db/schema";
import { createLogger } from "@/lib/logger/index";

const logger = createLogger({ module: "orphaned-queued-runs" }) as {
  info: (data: unknown, msg?: string) => void;
  warn: (data: unknown, msg?: string) => void;
  error: (data: unknown, msg?: string) => void;
};

// A queued run waits for a slot in capacity:queued:{orgId}. That sorted set and the
// job data expire after 24-48 h, so a run that waited longer (all slots held by hung
// runs) is left "queued" in the database with nothing that could ever promote it,
// and the scheduler skips the job on every tick because it still has a queued run.
// Seen 18-30.10.2026: 11 scheduled jobs stopped for 10 days without a single alert.
export const ORPHANED_QUEUED_AFTER_MS = 30 * 60_000;
const BATCH_LIMIT = 200;
export const ORPHANED_QUEUED_ERROR =
  "Run lost its place in the execution queue and was closed by automatic recovery";

type Db = typeof import("@/utils/db").db;

export interface OrphanedQueuedRunsDeps {
  db: Db;
  redis: Redis;
  queues: Queue[];
  now?: Date;
}

async function queuedMembers(redis: Redis): Promise<Set<string>> {
  const members = new Set<string>();
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "capacity:queued:*", "COUNT", 100);
    cursor = next;
    for (const key of keys) {
      for (const id of await redis.zrange(key, 0, -1)) members.add(id);
    }
  } while (cursor !== "0");
  return members;
}

/**
 * Closes runs that are "queued" in the database but exist neither in the capacity
 * queue nor in BullMQ. Conditional on status, so a run promoted in the meantime is
 * never touched. Returns the ids of closed runs.
 */
export async function failOrphanedQueuedRuns(deps: OrphanedQueuedRunsDeps): Promise<string[]> {
  const now = deps.now ?? new Date();
  const candidates = await deps.db
    .select({ id: runs.id })
    .from(runs)
    .where(
      and(
        eq(runs.status, "queued"),
        lt(runs.createdAt, new Date(now.getTime() - ORPHANED_QUEUED_AFTER_MS)),
      ),
    )
    .limit(BATCH_LIMIT);
  if (candidates.length === 0) return [];

  const inCapacityQueue = await queuedMembers(deps.redis);
  const orphaned: string[] = [];
  for (const { id } of candidates) {
    if (inCapacityQueue.has(id)) continue;
    const jobs = await Promise.all(deps.queues.map((q) => q.getJob(id)));
    if (jobs.some(Boolean)) continue;
    orphaned.push(id);
  }
  if (orphaned.length === 0) return [];

  const closed = await deps.db
    .update(runs)
    .set({ status: "error", completedAt: now, errorDetails: ORPHANED_QUEUED_ERROR })
    .where(and(inArray(runs.id, orphaned), eq(runs.status, "queued")))
    .returning({ id: runs.id });
  const closedIds = closed.map((run) => run.id);
  if (closedIds.length > 0) {
    logger.warn({ runIds: closedIds }, "Closed queued runs missing from the execution queue");
  }
  return closedIds;
}
