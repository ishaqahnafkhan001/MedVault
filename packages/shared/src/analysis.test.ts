import { describe, expect, it } from "vitest";
import { measurementDtoSchema, signedFileResponseSchema } from "./index.js";
import {
  ANALYSIS_CONFIG_VERSION,
  SUMMARY_PROMPT_VERSION,
  groundSummarySelection,
  validateGroundedSummary,
  summaryJobSchema,
  analysisFilterSchema,
  formatClinicalDate,
  type SummaryInput,
} from "./analysis.js";
const id = "00000000-0000-4000-8000-000000000001";
const input: SummaryInput = {
  scope: "REPORT",
  configVersion: ANALYSIS_CONFIG_VERSION,
  promptVersion: SUMMARY_PROMPT_VERSION,
  facts: [
    {
      id: "observation-1",
      kind: "OBSERVATION",
      measurementIds: [id],
      text: "Synthetic observation: 14 g/dL.",
    },
  ],
  explanations: [],
};
describe("summary trust boundaries", () => {
  it("validates report-page observations and rejects unsafe private-file URLs", () => {
    const measurement = {
      id,
      name: "Hb",
      normalizedName: "hemoglobin",
      numericValue: null,
      textValue: null,
      unit: null,
      referenceRange: null,
      sourceFlag: null,
      patientCorrected: true,
    };
    expect(measurementDtoSchema.safeParse(measurement).success).toBe(true);
    for (const bad of [
      { ...measurement, numericValue: Infinity },
      { ...measurement, id: "invalid" },
      { ...measurement, patientCorrected: "true" },
      { ...measurement, sourceFlag: 3 },
    ])
      expect(measurementDtoSchema.safeParse(bad).success).toBe(false);
    expect(
      signedFileResponseSchema.safeParse({
        url: "https://storage.example/synthetic",
        expiresInSeconds: 300,
      }).success,
    ).toBe(true);
    expect(
      signedFileResponseSchema.safeParse({
        url: "javascript:alert(1)",
        expiresInSeconds: 300,
      }).success,
    ).toBe(false);
    expect(
      signedFileResponseSchema.safeParse({
        url: "https://storage.example/synthetic",
        expiresInSeconds: 10,
      }).success,
    ).toBe(false);
  });
  it("copies only supplied facts and keeps urgency disabled", () => {
    const result = groundSummarySelection({ findings: [{ factId: "observation-1" }] }, input);
    expect(validateGroundedSummary(result, input)).toEqual(result);
    expect(result.findings).toEqual(input.facts);
    expect(result.guidance.status).toBe("CANNOT_ASSESS");
  });
  it.each([
    { findings: [{ factId: "invented" }] },
    { findings: [{ factId: "observation-1" }, { factId: "observation-1" }] },
    { findings: [{ factId: "observation-1", text: "Invented explanation" }] },
    { findings: [] },
  ])("rejects invented, duplicate or malformed selections", (raw) => {
    expect(() => groundSummarySelection(raw, input)).toThrow();
  });
  it("rejects shape-valid fabricated values, units, references and guidance", () => {
    const valid = groundSummarySelection({ findings: [{ factId: "observation-1" }] }, input);
    for (const bad of [
      {
        ...valid,
        findings: [{ ...valid.findings[0], text: "Synthetic observation: 140 mmol/L." }],
      },
      {
        ...valid,
        findings: [
          { ...valid.findings[0], measurementIds: ["00000000-0000-4000-8000-000000000099"] },
        ],
      },
      { ...valid, guidance: { ...valid.guidance, message: "Everything is normal." } },
    ])
      expect(() => validateGroundedSummary(bad, input)).toThrow();
  });
  it("requires versioned, bounded UUID job data", () => {
    const job = {
      analysisId: id,
      patientId: id,
      correlationId: id,
      generation: 1,
      inputFingerprint: "a".repeat(64),
    };
    expect(summaryJobSchema.safeParse(job).success).toBe(true);
    for (const bad of [
      { ...job, patientId: "other" },
      { ...job, generation: 0 },
      { ...job, generation: Infinity },
      { ...job, sourceText: "untrusted" },
    ]) {
      expect(summaryJobSchema.safeParse(bad).success).toBe(false);
    }
  });
  it("rejects ambiguous, invalid and reversed date filters", () => {
    expect(analysisFilterSchema.safeParse({ dateFrom: "2026-02-30" }).success).toBe(false);
    expect(
      analysisFilterSchema.safeParse({ dateFrom: "2026-09-09", dateTo: "2026-09-01" }).success,
    ).toBe(false);
    expect(formatClinicalDate("09/01/2026")).toBe("Date unknown");
    expect(formatClinicalDate("2026-09-01")).toBe("Sep 1, 2026");
  });
});
