import { z } from "zod";

export const REPORT_ANALYSIS_QUEUE = "report-analysis";
export const REPORT_ANALYSIS_JOB = "extract-report";

export const reportJobDataSchema = z
  .object({
    documentId: z.uuid(),
    documentVersion: z.number().int().positive(),
  })
  .strict();

export type ReportJobData = z.infer<typeof reportJobDataSchema>;
