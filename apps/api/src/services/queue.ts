import { Queue } from "bullmq";
import type IORedis from "ioredis";
import type { DocumentType } from "@medvault/shared";
import { AppError } from "../errors.js";
import { closeRedisConnection, createApiRedisConnection } from "./redis-connection.js";

export const REPORT_ANALYSIS_QUEUE = "report-analysis";

export interface ReportJobData {
  documentId: string;
  documentVersion: number;
}

export interface ReportQueue {
  enqueue(documentType: DocumentType, data: ReportJobData): Promise<void>;
  ensureQueued(data: ReportJobData): Promise<"enqueued" | "existing">;
  getState(data: ReportJobData): Promise<ReportJobState>;
  removeForDeletion(data: ReportJobData): Promise<"removed" | "missing" | "active">;
  close(): Promise<void>;
}

export type ReportJobState =
  "missing" | "waiting" | "active" | "delayed" | "completed" | "failed" | "unknown";

export function reportJobId(data: ReportJobData): string {
  return `${data.documentId}-v${data.documentVersion}`;
}

export function assertReportOnly(documentType: DocumentType): void {
  if (documentType !== "REPORT") {
    throw new AppError(
      422,
      "PRESCRIPTION_AI_FORBIDDEN",
      "Prescriptions cannot be analyzed in Phase 1.",
    );
  }
}

export class BullMqReportQueue implements ReportQueue {
  private readonly connection: IORedis;
  private readonly queue: Queue<ReportJobData>;

  constructor(redisUrl: string) {
    this.connection = createApiRedisConnection(redisUrl, "queue-producer");
    this.queue = new Queue(REPORT_ANALYSIS_QUEUE, { connection: this.connection });
  }

  async enqueue(documentType: DocumentType, data: ReportJobData): Promise<void> {
    assertReportOnly(documentType);
    await this.add(data);
  }

  async ensureQueued(data: ReportJobData): Promise<"enqueued" | "existing"> {
    const existing = await this.queue.getJob(reportJobId(data));
    if (existing) {
      const state = normalizeJobState(await existing.getState());
      if (state === "active" || state === "waiting" || state === "delayed") return "existing";
      try {
        await existing.remove();
      } catch {
        const current = await this.getState(data);
        if (current === "active" || current === "waiting" || current === "delayed") {
          return "existing";
        }
        throw queueUnavailable();
      }
    }
    await this.add(data);
    return "enqueued";
  }

  async getState(data: ReportJobData): Promise<ReportJobState> {
    const job = await this.queue.getJob(reportJobId(data));
    return job ? normalizeJobState(await job.getState()) : "missing";
  }

  async removeForDeletion(data: ReportJobData): Promise<"removed" | "missing" | "active"> {
    const job = await this.queue.getJob(reportJobId(data));
    if (!job) return "missing";
    if (normalizeJobState(await job.getState()) === "active") return "active";
    try {
      await job.remove();
      return "removed";
    } catch {
      const current = await this.getState(data);
      if (current === "active") return "active";
      if (current === "missing") return "missing";
      throw queueUnavailable();
    }
  }

  private async add(data: ReportJobData): Promise<void> {
    await this.queue.add("extract-report", data, {
      jobId: reportJobId(data),
      attempts: 4,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: 100,
      removeOnFail: 250,
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
    await closeRedisConnection(this.connection);
  }
}

function normalizeJobState(state: string): ReportJobState {
  if (state === "active" || state === "delayed" || state === "completed" || state === "failed") {
    return state;
  }
  if (state === "waiting" || state === "waiting-children" || state === "prioritized") {
    return "waiting";
  }
  return "unknown";
}

function queueUnavailable(): AppError {
  return new AppError(503, "QUEUE_UNAVAILABLE", "Background processing is unavailable right now.");
}
