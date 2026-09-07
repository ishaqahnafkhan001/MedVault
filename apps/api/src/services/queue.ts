import { Queue } from "bullmq";
import type IORedis from "ioredis";
import {
  REPORT_ANALYSIS_JOB,
  REPORT_ANALYSIS_QUEUE,
  reportJobDataSchema,
  type DocumentType,
  type ReportJobData as SharedReportJobData,
} from "@medvault/shared";
import { AppError } from "../errors.js";
import { closeRedisConnection, createApiRedisConnection } from "./redis-connection.js";

export { REPORT_ANALYSIS_JOB, REPORT_ANALYSIS_QUEUE };
export type ReportJobData = SharedReportJobData;

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
    const jobData = validReportJobData(data);
    try {
      await this.add(jobData);
    } catch (error) {
      throw asQueueError(error);
    }
  }

  async ensureQueued(data: ReportJobData): Promise<"enqueued" | "existing"> {
    const jobData = validReportJobData(data);
    try {
      const existing = await this.queue.getJob(reportJobId(jobData));
      if (existing) {
        const state = normalizeJobState(await existing.getState());
        if (state === "active" || state === "waiting" || state === "delayed") return "existing";
        try {
          await existing.remove();
        } catch {
          const current = await this.getState(jobData);
          if (current === "active" || current === "waiting" || current === "delayed") {
            return "existing";
          }
          throw queueUnavailable();
        }
      }
      await this.add(jobData);
      return "enqueued";
    } catch (error) {
      throw asQueueError(error);
    }
  }

  async getState(data: ReportJobData): Promise<ReportJobState> {
    const jobData = validReportJobData(data);
    try {
      const job = await this.queue.getJob(reportJobId(jobData));
      return job ? normalizeJobState(await job.getState()) : "missing";
    } catch (error) {
      throw asQueueError(error);
    }
  }

  async removeForDeletion(data: ReportJobData): Promise<"removed" | "missing" | "active"> {
    const jobData = validReportJobData(data);
    try {
      const job = await this.queue.getJob(reportJobId(jobData));
      if (!job) return "missing";
      if (normalizeJobState(await job.getState()) === "active") return "active";
      try {
        await job.remove();
        return "removed";
      } catch {
        const current = await this.getState(jobData);
        if (current === "active") return "active";
        if (current === "missing") return "missing";
        throw queueUnavailable();
      }
    } catch (error) {
      throw asQueueError(error);
    }
  }

  private async add(data: ReportJobData): Promise<void> {
    await this.queue.add(REPORT_ANALYSIS_JOB, data, {
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

function validReportJobData(data: ReportJobData): ReportJobData {
  const parsed = reportJobDataSchema.safeParse(data);
  if (!parsed.success) {
    throw new AppError(500, "INVALID_QUEUE_PAYLOAD", "Background processing request is invalid.");
  }
  return parsed.data;
}

function asQueueError(error: unknown): AppError {
  return error instanceof AppError ? error : queueUnavailable();
}
