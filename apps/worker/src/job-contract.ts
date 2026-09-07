import { UnrecoverableError } from "bullmq";
import { REPORT_ANALYSIS_JOB, reportJobDataSchema, type ReportJobData } from "@medvault/shared";

export interface RedisReportJob {
  name: string;
  data: unknown;
}

export function parseReportJob(job: RedisReportJob): ReportJobData {
  if (job.name !== REPORT_ANALYSIS_JOB) {
    throw new UnrecoverableError("UNSUPPORTED_REPORT_JOB");
  }
  const result = reportJobDataSchema.safeParse(job.data);
  if (!result.success) {
    throw new UnrecoverableError("INVALID_REPORT_JOB");
  }
  return result.data;
}
