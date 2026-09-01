import { describe, expect, it } from "vitest";
import type { ProcessingStatus } from "@medvault/database";
import type {
  ReconciliationCandidate,
  ReconciliationRepository,
} from "../services/reconciliation.js";
import { ReportQueueReconciler } from "../services/reconciliation.js";
import type { ReportJobData, ReportJobState, ReportQueue } from "../services/queue.js";

describe("report queue reconciliation", () => {
  it.each(["missing", "completed", "failed", "unknown"] as const)(
    "requeues a stale queued report whose job is %s",
    async (state) => {
      const repository = new FakeRepository([candidate("QUEUED")]);
      const queue = new FakeQueue(state);
      const summary = await reconciler(repository, queue).reconcile();
      expect(summary.requeued).toBe(1);
      expect(queue.ensured).toEqual([{ documentId: reportId, documentVersion: 1 }]);
    },
  );

  it.each(["active", "waiting", "delayed"] as const)(
    "does not duplicate a %s job",
    async (state) => {
      const repository = new FakeRepository([candidate("QUEUED")]);
      const queue = new FakeQueue(state);
      const summary = await reconciler(repository, queue).reconcile();
      expect(summary.liveJobs).toBe(1);
      expect(queue.ensured).toEqual([]);
      expect(repository.claims).toBe(0);
    },
  );

  it("conservatively recovers stale processing when no live job exists", async () => {
    const repository = new FakeRepository([candidate("PROCESSING")]);
    const queue = new FakeQueue("missing");
    const summary = await reconciler(repository, queue).reconcile();
    expect(summary.requeued).toBe(1);
    expect(repository.claims).toBe(1);
  });

  it("uses the current document version even if an old-version job was lost", async () => {
    const repository = new FakeRepository([{ ...candidate("QUEUED"), documentVersion: 2 }]);
    const queue = new FakeQueue("missing");
    await reconciler(repository, queue).reconcile();
    expect(queue.ensured).toEqual([{ documentId: reportId, documentVersion: 2 }]);
  });

  it.each(["NEEDS_REVIEW", "VERIFIED", "FAILED"] as const)(
    "skips a report already in terminal state %s",
    async (processingStatus) => {
      const repository = new FakeRepository([candidate(processingStatus)]);
      const queue = new FakeQueue("missing");
      const summary = await reconciler(repository, queue).reconcile();
      expect(summary.skipped).toBe(1);
      expect(queue.ensured).toEqual([]);
    },
  );

  it("allows only one of concurrent reconciliation attempts to claim the report", async () => {
    const repository = new FakeRepository([candidate("QUEUED")]);
    const queue = new FakeQueue("missing");
    const workerA = reconciler(repository, queue);
    const workerB = reconciler(repository, queue);
    const summaries = await Promise.all([workerA.reconcile(), workerB.reconcile()]);
    expect(summaries.reduce((total, summary) => total + summary.requeued, 0)).toBe(1);
    expect(queue.ensured).toHaveLength(1);
  });

  it("marks a claimed report recoverably failed when requeueing fails", async () => {
    const repository = new FakeRepository([candidate("QUEUED")]);
    const queue = new FakeQueue("missing");
    queue.failEnsure = true;
    const summary = await reconciler(repository, queue).reconcile();
    expect(summary.errors).toBe(1);
    expect(repository.queueFailures).toBe(1);
  });

  it("marks stale work recoverably failed after the configured attempt ceiling", async () => {
    const repository = new FakeRepository([{ ...candidate("PROCESSING"), processingAttempts: 8 }]);
    const queue = new FakeQueue("missing");
    const summary = await reconciler(repository, queue).reconcile();
    expect(summary.exhausted).toBe(1);
    expect(repository.exhausted).toBe(1);
    expect(queue.ensured).toEqual([]);
  });
});

const reportId = "10000000-0000-4000-8000-000000000001";
const observedAt = new Date("2026-08-30T00:00:00.000Z");

function candidate(processingStatus: ProcessingStatus): ReconciliationCandidate {
  return {
    id: reportId,
    documentVersion: 1,
    processingStatus,
    updatedAt: observedAt,
    processingStartedAt: processingStatus === "PROCESSING" ? observedAt : null,
    processingAttempts: 1,
  };
}

function reconciler(repository: FakeRepository, queue: FakeQueue) {
  return new ReportQueueReconciler(
    repository,
    queue,
    60_000,
    100,
    8,
    () => new Date("2026-08-30T01:00:00.000Z"),
  );
}

class FakeRepository implements ReconciliationRepository {
  claims = 0;
  queueFailures = 0;
  exhausted = 0;
  private claimed = false;

  constructor(private readonly candidates: ReconciliationCandidate[]) {}

  listStale() {
    return Promise.resolve(this.candidates);
  }

  async claim(): Promise<boolean> {
    await Promise.resolve();
    if (this.claimed) return false;
    this.claimed = true;
    this.claims += 1;
    return true;
  }

  markQueueUnavailable() {
    this.queueFailures += 1;
    return Promise.resolve();
  }

  markRecoveryExhausted() {
    this.exhausted += 1;
    return Promise.resolve(true);
  }
}

class FakeQueue implements ReportQueue {
  ensured: ReportJobData[] = [];
  failEnsure = false;

  constructor(private readonly state: ReportJobState) {}

  enqueue() {
    return Promise.resolve();
  }

  ensureQueued(data: ReportJobData): Promise<"enqueued"> {
    if (this.failEnsure) return Promise.reject(new Error("unavailable"));
    this.ensured.push(data);
    return Promise.resolve("enqueued");
  }

  getState() {
    return Promise.resolve(this.state);
  }

  removeForDeletion(): Promise<"missing"> {
    return Promise.resolve("missing");
  }

  close() {
    return Promise.resolve();
  }
}
