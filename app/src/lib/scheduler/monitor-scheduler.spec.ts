/** @jest-environment node */

const mockResolveMonitorLocations = jest.fn();
const mockResolveDefaultMonitorLocations = jest.fn();
const mockIsMonitorLocationResolutionError = jest.fn();
const mockGetFirstVisibleProjectRestrictionCode = jest.fn();

const mockUpdateWhere = jest.fn().mockResolvedValue(undefined);
const mockUpdateSet = jest.fn().mockReturnValue({ where: mockUpdateWhere });
const mockUpdate = jest.fn().mockReturnValue({ set: mockUpdateSet });

const mockInsertValues = jest.fn().mockResolvedValue(undefined);
const mockInsert = jest.fn().mockReturnValue({ values: mockInsertValues });

jest.mock("@/lib/queue", () => ({
  getQueues: jest.fn(),
  monitorQueueName: (location: string) => `monitor-${location}`,
  queueLogger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock("@/lib/location-registry", () => ({
  getFirstVisibleProjectRestrictionCode: jest.fn(),
}));

jest.mock("@/lib/monitor-location-routing", () => ({
  partitionMonitorLocationsByAvailability: jest.fn(),
  resolveDefaultMonitorLocations: jest.fn(),
  resolveMonitorLocations: jest.fn(),
  isMonitorLocationResolutionError: jest.fn(),
}));

jest.mock("@/utils/db", () => ({
  db: {
    update: jest.fn(() => mockUpdate()),
    insert: jest.fn(() => mockInsert()),
    query: {
      monitors: {
        findFirst: jest.fn(),
      },
      monitorResults: {
        findFirst: jest.fn(),
      },
    },
  },
}));

jest.mock("@/db/schema", () => ({
  monitors: {},
  monitorResults: {},
}));

jest.mock("drizzle-orm", () => ({
  desc: jest.fn(),
  eq: jest.fn(),
}));

jest.mock("./constants", () => ({
  EXECUTE_MONITOR_JOB_NAME: "executeMonitorJob",
}));

import { db } from "@/utils/db";
import {
  getFirstVisibleProjectRestrictionCode,
} from "@/lib/location-registry";
import {
  isMonitorLocationResolutionError,
  partitionMonitorLocationsByAvailability,
  resolveDefaultMonitorLocations,
  resolveMonitorLocations,
} from "@/lib/monitor-location-routing";
import { getQueues } from "@/lib/queue";
import { processScheduledMonitor } from "./monitor-scheduler";

const mockMonitorsFindFirst = db.query.monitors.findFirst as jest.Mock;
const mockMonitorResultsFindFirst = db.query.monitorResults.findFirst as jest.Mock;

describe("monitor-scheduler", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockResolveMonitorLocations.mockReset();
    mockResolveDefaultMonitorLocations.mockReset();
    mockIsMonitorLocationResolutionError.mockReset();
    mockGetFirstVisibleProjectRestrictionCode.mockReset();

    (resolveMonitorLocations as jest.Mock).mockImplementation(
      mockResolveMonitorLocations
    );
    (resolveDefaultMonitorLocations as jest.Mock).mockImplementation(
      mockResolveDefaultMonitorLocations
    );
    (isMonitorLocationResolutionError as jest.Mock).mockImplementation(
      mockIsMonitorLocationResolutionError
    );
    (getFirstVisibleProjectRestrictionCode as jest.Mock).mockImplementation(
      mockGetFirstVisibleProjectRestrictionCode
    );

    mockMonitorsFindFirst.mockResolvedValue({
      config: null,
      projectId: "project-1",
    });
    mockMonitorResultsFindFirst.mockResolvedValue(null);
  });

  it("records scheduling failures when project restrictions disable all allowed locations", async () => {
    const disabledRestrictionsError =
      "All restricted locations for this project are currently disabled. Enable at least one assigned location or remove the project restrictions.";

    mockResolveMonitorLocations
      .mockRejectedValueOnce(new Error(disabledRestrictionsError))
      .mockRejectedValueOnce(new Error(disabledRestrictionsError));
    mockResolveDefaultMonitorLocations.mockRejectedValue(
      new Error(disabledRestrictionsError)
    );
    mockIsMonitorLocationResolutionError.mockReturnValue(true);
    mockGetFirstVisibleProjectRestrictionCode.mockResolvedValue("eu-central");

    await expect(
      processScheduledMonitor({
        data: {
          monitorId: "monitor-1",
          projectId: "project-1",
          type: "website",
          target: "https://example.com",
        },
      } as never)
    ).rejects.toThrow(disabledRestrictionsError);

    expect(db.update).toHaveBeenCalled();
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        monitorId: "monitor-1",
        location: "eu-central",
        status: "error",
        isUp: false,
      })
    );
    expect(mockGetFirstVisibleProjectRestrictionCode).toHaveBeenCalledWith(
      "project-1"
    );
  });

  it("ignores the first scheduling failure after a healthy check (worker restart)", async () => {
    const noWorkersError =
      "Monitor monitor-1: no jobs enqueued \u2014 none of the expected locations [local] have live workers.";

    mockResolveMonitorLocations.mockResolvedValue(["local"]);
    mockIsMonitorLocationResolutionError.mockReturnValue(false);
    (partitionMonitorLocationsByAvailability as jest.Mock).mockResolvedValue({
      enqueuedLocations: [],
      skippedLocations: ["local"],
    });
    (getQueues as jest.Mock).mockResolvedValue({
      monitorExecutionQueue: {},
      monitorSchedulerQueue: {},
    });
    mockMonitorResultsFindFirst.mockResolvedValue({
      location: "local",
      isUp: true,
      consecutiveFailureCount: 0,
      alertsSentForFailure: 0,
    });

    await expect(
      processScheduledMonitor({
        data: {
          monitorId: "monitor-1",
          projectId: "project-1",
          type: "website",
          target: "https://example.com",
        },
      } as never)
    ).rejects.toThrow(/no jobs enqueued/);

    expect(mockInsertValues).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("records the scheduling failure when the previous check already failed", async () => {
    mockResolveMonitorLocations.mockResolvedValue(["local"]);
    mockIsMonitorLocationResolutionError.mockReturnValue(false);
    (partitionMonitorLocationsByAvailability as jest.Mock).mockResolvedValue({
      enqueuedLocations: [],
      skippedLocations: ["local"],
    });
    (getQueues as jest.Mock).mockResolvedValue({
      monitorExecutionQueue: {},
      monitorSchedulerQueue: {},
    });
    mockMonitorResultsFindFirst.mockResolvedValue({
      location: "local",
      isUp: false,
      consecutiveFailureCount: 1,
      alertsSentForFailure: 0,
    });

    await expect(
      processScheduledMonitor({
        data: {
          monitorId: "monitor-1",
          projectId: "project-1",
          type: "website",
          target: "https://example.com",
        },
      } as never)
    ).rejects.toThrow(/no jobs enqueued/);

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        monitorId: "monitor-1",
        status: "error",
        isUp: false,
        consecutiveFailureCount: 2,
      })
    );
  });
});
