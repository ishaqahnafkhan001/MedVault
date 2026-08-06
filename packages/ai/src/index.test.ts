import { describe, expect, it } from "vitest";
import { reportExtractionSchema } from "@medvault/shared";
import { MockReportExtractionAdapter } from "./index.js";

const validExtraction = {
  documentReportType: "Laboratory report",
  testName: "Complete Blood Count",
  normalizedTestName: "CBC",
  reportDate: "2026-08-05",
  hospitalName: "Popular Diagnostic Centre",
  category: "HEMATOLOGY" as const,
  patientNameOnReport: null,
  measurements: [
    {
      name: "Platelet Count",
      normalizedName: "platelet count",
      textValue: null,
      numericValue: 95000,
      unit: "/µL",
      referenceRange: "150000-450000",
      sourceFlag: "LOW",
    },
  ],
};

describe("AI extraction contract", () => {
  it("accepts a valid structured response", async () => {
    const adapter = new MockReportExtractionAdapter(validExtraction);
    await expect(adapter.extract()).resolves.toMatchObject({ extraction: validExtraction });
  });

  it("rejects malformed structured output", () => {
    expect(() =>
      reportExtractionSchema.parse({
        ...validExtraction,
        measurements: [{ name: "Missing value" }],
      }),
    ).toThrow();
  });
});
