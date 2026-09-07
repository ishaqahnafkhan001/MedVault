import { describe, expect, it } from "vitest";
import {
  REPORT_ANALYSIS_JOB,
  REPORT_ANALYSIS_QUEUE,
  assertReportOnly,
  reportJobId,
} from "../services/queue.js";

describe("queue safety boundary", () => {
  it("accepts reports", () => {
    expect(() => assertReportOnly("REPORT")).not.toThrow();
  });

  it("uses a deterministic job ID for each document version", () => {
    const documentId = "10000000-0000-4000-8000-000000000001";
    expect(reportJobId({ documentId, documentVersion: 2 })).toBe(`${documentId}-v2`);
  });

  it("uses the shared producer and consumer contract", () => {
    expect(REPORT_ANALYSIS_QUEUE).toBe("report-analysis");
    expect(REPORT_ANALYSIS_JOB).toBe("extract-report");
  });

  it("rejects prescriptions before BullMQ", () => {
    expect(() => assertReportOnly("PRESCRIPTION")).toThrowError(
      expect.objectContaining({ code: "PRESCRIPTION_AI_FORBIDDEN" }),
    );
  });
});
