import type { PrismaClient, ProcessingStatus } from "@medvault/database";
import type { ReportJobState, ReportQueue } from "./queue.js";

export interface ReconciliationCandidate {
  id: string;
  documentVersion: number;
  processingStatus: ProcessingStatus;
  updatedAt: Date;
  processingStartedAt: Date | null;
  processingAttempts: number;
}

export interface ReconciliationRepository {
  listStale(cutoff: Date, limit: number): Promise<ReconciliationCandidate[]>;
  claim(candidate: ReconciliationCandidate, claimTime: Date): Promise<boolean>;
  markRecoveryExhausted(candidate: ReconciliationCandidate): Promise<boolean>;
  markQueueUnavailable(candidate: ReconciliationCandidate, claimTime: Date): Promise<void>;
}

export interface ReconciliationSummary {
  scanned: number;
  requeued: number;
  liveJobs: number;
  skipped: number;
  errors: number;
  exhausted: number;
}

const liveStates = new Set<ReportJobState>(["active", "waiting", "delayed"]);

export class ReportQueueReconciler {
  constructor(
    private readonly repository: ReconciliationRepository,
    private readonly queue: ReportQueue,
    private readonly staleAfterMs: number,
    private readonly batchSize: number,
    private readonly maxProcessingAttempts: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async reconcile(): Promise<ReconciliationSummary> {
    const runAt = this.now();
    const candidates = await this.repository.listStale(
      new Date(runAt.getTime() - this.staleAfterMs),
      this.batchSize,
    );
    const summary: ReconciliationSummary = {
      scanned: candidates.length,
      requeued: 0,
      liveJobs: 0,
      skipped: 0,
      errors: 0,
      exhausted: 0,
    };

    for (const candidate of candidates) {
      if (candidate.processingStatus !== "QUEUED" && candidate.processingStatus !== "PROCESSING") {
        summary.skipped += 1;
        continue;
      }
      const jobData = {
        documentId: candidate.id,
        documentVersion: candidate.documentVersion,
      };
      try {
        const state = await this.queue.getState(jobData);
        if (liveStates.has(state)) {
          summary.liveJobs += 1;
          continue;
        }
        if (candidate.processingAttempts >= this.maxProcessingAttempts) {
          if (await this.repository.markRecoveryExhausted(candidate)) summary.exhausted += 1;
          else summary.skipped += 1;
          continue;
        }
        const claimTime = this.now();
        if (!(await this.repository.claim(candidate, claimTime))) {
          summary.skipped += 1;
          continue;
        }
        try {
          await this.queue.ensureQueued(jobData);
          summary.requeued += 1;
        } catch {
          await this.repository.markQueueUnavailable(candidate, claimTime);
          summary.errors += 1;
        }
      } catch {
        summary.errors += 1;
      }
    }
    return summary;
  }
}

export class PrismaReconciliationRepository implements ReconciliationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listStale(cutoff: Date, limit: number): Promise<ReconciliationCandidate[]> {
    return this.prisma.medicalDocument.findMany({
      where: {
        documentType: "REPORT",
        OR: [
          { processingStatus: "QUEUED", updatedAt: { lte: cutoff } },
          {
            processingStatus: "PROCESSING",
            OR: [
              { processingStartedAt: { lte: cutoff } },
              { processingStartedAt: null, updatedAt: { lte: cutoff } },
            ],
          },
        ],
      },
      orderBy: { updatedAt: "asc" },
      take: limit,
      select: {
        id: true,
        documentVersion: true,
        processingStatus: true,
        updatedAt: true,
        processingStartedAt: true,
        processingAttempts: true,
      },
    });
  }

  async claim(candidate: ReconciliationCandidate, claimTime: Date): Promise<boolean> {
    const result = await this.prisma.medicalDocument.updateMany({
      where: {
        id: candidate.id,
        documentVersion: candidate.documentVersion,
        processingStatus: candidate.processingStatus,
        updatedAt: candidate.updatedAt,
        ...(candidate.processingStatus === "PROCESSING"
          ? { processingStartedAt: candidate.processingStartedAt }
          : {}),
      },
      data: {
        processingStatus: "QUEUED",
        processingStartedAt: null,
        failureCode: "QUEUE_RECOVERY",
        updatedAt: claimTime,
      },
    });
    return result.count === 1;
  }

  async markRecoveryExhausted(candidate: ReconciliationCandidate): Promise<boolean> {
    const result = await this.prisma.medicalDocument.updateMany({
      where: {
        id: candidate.id,
        documentVersion: candidate.documentVersion,
        processingStatus: candidate.processingStatus,
        processingAttempts: candidate.processingAttempts,
        updatedAt: candidate.updatedAt,
      },
      data: {
        processingStatus: "FAILED",
        processingStartedAt: null,
        failureCode: "QUEUE_RECOVERY_EXHAUSTED",
      },
    });
    return result.count === 1;
  }

  async markQueueUnavailable(candidate: ReconciliationCandidate, claimTime: Date): Promise<void> {
    await this.prisma.medicalDocument.updateMany({
      where: {
        id: candidate.id,
        documentVersion: candidate.documentVersion,
        processingStatus: "QUEUED",
        failureCode: "QUEUE_RECOVERY",
        updatedAt: claimTime,
      },
      data: { processingStatus: "FAILED", failureCode: "QUEUE_UNAVAILABLE" },
    });
  }
}

export class ReportReconciliationLoop {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly reconciler: ReportQueueReconciler,
    private readonly intervalMs: number,
  ) {}

  start(): void {
    void this.run();
    this.timer = setInterval(() => void this.run(), this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const summary = await this.reconciler.reconcile();
      if (summary.requeued > 0 || summary.exhausted > 0 || summary.errors > 0) {
        process.stdout.write(
          `Report queue reconciliation: scanned=${String(summary.scanned)} requeued=${String(summary.requeued)} live=${String(summary.liveJobs)} exhausted=${String(summary.exhausted)} skipped=${String(summary.skipped)} errors=${String(summary.errors)}\n`,
        );
      }
    } catch {
      process.stderr.write("Report queue reconciliation unavailable\n");
    } finally {
      this.running = false;
    }
  }
}
