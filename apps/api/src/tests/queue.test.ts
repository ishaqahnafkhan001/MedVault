import { describe, expect, it } from "vitest";
import { assertReportOnly, reportJobId } from "../services/queue.js";

describe("queue safety boundary", () => {
  it("accepts reports", () => {
    expect(() => assertReportOnly("REPORT")).not.toThrow();
  });

  it("uses a deterministic job ID for each document version", () => {
    expect(reportJobId({ documentId: "document", documentVersion: 2 })).toBe("document-v2");
  });

  it("rejects prescriptions before BullMQ", () => {
    expect(() => assertReportOnly("PRESCRIPTION")).toThrowError(
      expect.objectContaining({ code: "PRESCRIPTION_AI_FORBIDDEN" }),
    );
  });
});
