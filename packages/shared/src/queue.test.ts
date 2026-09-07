import { describe, expect, it } from "vitest";
import { REPORT_ANALYSIS_JOB, REPORT_ANALYSIS_QUEUE, reportJobDataSchema } from "./queue.js";

describe("report queue contract", () => {
  it("shares one queue and job name", () => {
    expect(REPORT_ANALYSIS_QUEUE).toBe("report-analysis");
    expect(REPORT_ANALYSIS_JOB).toBe("extract-report");
  });

  it("accepts only a UUID document ID and positive integer version", () => {
    expect(
      reportJobDataSchema.safeParse({
        documentId: "10000000-0000-4000-8000-000000000001",
        documentVersion: 1,
      }).success,
    ).toBe(true);
    expect(
      reportJobDataSchema.safeParse({ documentId: "not-a-uuid", documentVersion: 0 }).success,
    ).toBe(false);
  });
});
