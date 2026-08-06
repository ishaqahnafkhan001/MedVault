import { describe, expect, it } from "vitest";
import { assertReportOnly } from "../services/queue.js";

describe("queue safety boundary", () => {
  it("accepts reports", () => {
    expect(() => assertReportOnly("REPORT")).not.toThrow();
  });

  it("rejects prescriptions before BullMQ", () => {
    expect(() => assertReportOnly("PRESCRIPTION")).toThrowError(
      expect.objectContaining({ code: "PRESCRIPTION_AI_FORBIDDEN" }),
    );
  });
});
