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

  it("accepts only bounded, log-safe correlation identifiers", () => {
    const base = {
      documentId: "10000000-0000-4000-8000-000000000001",
      documentVersion: 1,
    };
    expect(
      reportJobDataSchema.safeParse({ ...base, correlationId: "ex04.request-1" }).success,
    ).toBe(true);
    expect(reportJobDataSchema.safeParse({ ...base, correlationId: "unsafe value" }).success).toBe(
      false,
    );
    expect(reportJobDataSchema.safeParse({ ...base, correlationId: "x".repeat(101) }).success).toBe(
      false,
    );
  });
});
