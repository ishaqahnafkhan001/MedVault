import { Queue } from "bullmq";
import IORedis from "ioredis";
import type { DocumentType } from "@medvault/shared";
import { AppError } from "../errors.js";

export const REPORT_ANALYSIS_QUEUE = "report-analysis";

export interface ReportJobData {
  documentId: string;
  documentVersion: number;
}

export interface ReportQueue {
  enqueue(documentType: DocumentType, data: ReportJobData): Promise<void>;
  close(): Promise<void>;
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
    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(REPORT_ANALYSIS_QUEUE, { connection: this.connection });
  }

  async enqueue(documentType: DocumentType, data: ReportJobData): Promise<void> {
    assertReportOnly(documentType);
    await this.queue.add("extract-report", data, {
      jobId: `${data.documentId}-v${data.documentVersion}`,
      attempts: 4,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: 100,
      removeOnFail: 250,
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
