const mockResultsFindFirst = jest.fn();
const mockTransaction = jest.fn();

jest.mock("@/utils/db", () => ({
  db: {
    query: { monitorResults: { findFirst: (...args: unknown[]) => mockResultsFindFirst(...args) } },
    transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));
jest.mock("@/lib/queue", () => ({
  queueLogger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/location-registry", () => ({ getFirstVisibleProjectRestrictionCode: jest.fn() }));
jest.mock("@/lib/monitor-location-routing", () => ({
  resolveDefaultMonitorLocations: jest.fn(),
  resolveMonitorLocations: jest.fn(),
}));

import { recordSchedulingFailure } from "./monitor-scheduling-failure";

describe("recordSchedulingFailure", () => {
  beforeEach(() => jest.clearAllMocks());

  it("ignores the first scheduling failure after a healthy check (worker restart)", async () => {
    mockResultsFindFirst.mockResolvedValue({ location: "local", isUp: true });
    await recordSchedulingFailure("monitor-1", "no jobs enqueued");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("marks the monitor down when the previous check already failed", async () => {
    mockResultsFindFirst.mockResolvedValue({ location: "local", isUp: false, consecutiveFailureCount: 1 });
    mockTransaction.mockResolvedValue(undefined);
    await recordSchedulingFailure("monitor-1", "no jobs enqueued");
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});
