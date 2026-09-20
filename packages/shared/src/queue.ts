import { z } from "zod";

export const REPORT_ANALYSIS_QUEUE = "report-analysis";
export const REPORT_ANALYSIS_JOB = "extract-report";

export const reportJobDataSchema = z
  .object({
    documentId: z.uuid(),
    documentVersion: z.number().int().positive(),
    correlationId: z
      .string()
      .regex(/^[A-Za-z0-9._:-]+$/)
      .max(100)
      .optional(),
  })
  .strict();

export type ReportJobData = z.infer<typeof reportJobDataSchema>;
