import { UnrecoverableError } from "bullmq";
import { describe, expect, it } from "vitest";
import { REPORT_ANALYSIS_JOB } from "@medvault/shared";
import { parseReportJob } from "../job-contract.js";

describe("worker queue contract", () => {
  it("accepts the shared report job contract", () => {
    const data = {
      documentId: "10000000-0000-4000-8000-000000000001",
      documentVersion: 1,
    };
    expect(parseReportJob({ name: REPORT_ANALYSIS_JOB, data })).toEqual(data);
  });

  it("permanently rejects an unexpected job name", () => {
    expect(() => parseReportJob({ name: "unknown", data: {} })).toThrow(UnrecoverableError);
  });

  it.each([
    { documentId: "not-a-uuid", documentVersion: 1 },
    { documentId: "10000000-0000-4000-8000-000000000001", documentVersion: 0 },
    { documentId: "10000000-0000-4000-8000-000000000001", documentVersion: 1, extra: true },
  ])("permanently rejects invalid job data", (data) => {
    expect(() => parseReportJob({ name: REPORT_ANALYSIS_JOB, data })).toThrow(UnrecoverableError);
  });
});
