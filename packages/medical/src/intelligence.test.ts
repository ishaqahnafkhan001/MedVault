import { describe, expect, it } from "vitest";
import {
  ATTENTION_RULES_VERSION,
  TERMINOLOGY_MAPPING_VERSION,
  measurementSeriesSchema,
  type MeasurementSeriesDto,
} from "@medvault/shared";
import {
  assessAttention,
  buildLatestMetricCards,
  cannotAssessAttention,
  explainNormalizedMetric,
} from "./intelligence.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("sourced terminology", () => {
  it("returns versioned general information with a reviewed HTTPS source", () => {
    const explanation = explainNormalizedMetric("hemoglobin");
    expect(explanation).toMatchObject({
      certainty: "MAPPED_GENERAL_INFORMATION",
      mappingVersion: TERMINOLOGY_MAPPING_VERSION,
      source: { publisher: expect.stringContaining("MedlinePlus") },
    });
    expect(explanation.source?.url).toMatch(/^https:\/\/medlineplus\.gov\//);
    expect(explanation.uncertainty).toContain("does not interpret this result");
  });

  it("marks unknown terms as unmapped without inventing an explanation or source", () => {
    expect(explainNormalizedMetric("synthetic marker")).toMatchObject({
      certainty: "UNMAPPED",
      source: null,
      explanation: expect.stringContaining("no reviewed"),
    });
  });
});

describe("attention boundary", () => {
  it("keeps automated urgency disabled with explicit coverage and provenance", () => {
    expect(cannotAssessAttention()).toMatchObject({
      status: "CANNOT_ASSESS",
      reason: "NO_CLINICALLY_APPROVED_RULE_SET",
      rulesVersion: ATTENTION_RULES_VERSION,
      coverage: { automatedUrgencyEnabled: false, supportedMetrics: [] },
      provenance: [
        {
          purpose: "INFORMATIONAL_BOUNDARY_ONLY",
          clinicalApproval: "NOT_APPROVED",
        },
      ],
    });
  });

  it("validates the complete rule input but never converts a flag into an urgency claim", () => {
    const result = assessAttention({
      normalizedTestName: "potassium",
      valueKind: "EXACT",
      numericValue: 6,
      textValue: null,
      unit: "mmol/L",
      referenceRange: "3.5-5.1",
      sourceFlag: "CRITICAL",
      laboratory: "Synthetic lab",
      method: null,
      specimen: null,
      patientContext: null,
    });
    expect(result.status).toBe("CANNOT_ASSESS");
    expect(result.message).not.toMatch(/emergency|diagnos/i);
  });
});

describe("latest metric cards", () => {
  it("selects by clinical date, excludes unknown-date candidates and limits after ordering", () => {
    const hemoglobin = series("hemoglobin", [
      point(1, "2026-08-01", 13),
      point(2, "2026-09-01", 14),
      point(3, null, 15),
    ]);
    const glucose = series("fasting blood glucose", [point(4, "2026-09-02", 90)]);
    const cards = buildLatestMetricCards([hemoglobin, glucose]);
    expect(cards.map((card) => card.normalizedTestName)).toEqual([
      "fasting blood glucose",
      "hemoglobin",
    ]);
    expect(cards[1]!.latest.measurementId).toBe(id(22));
    expect(cards[1]!.observationCount).toBe(3);
  });

  it("keeps unknown-date observations in history while omitting an indeterminate latest card", () => {
    expect(buildLatestMetricCards([series("hemoglobin", [point(1, null, 14)])])).toEqual([]);
  });
});

function series(
  normalizedTestName: string,
  points: MeasurementSeriesDto["points"],
): MeasurementSeriesDto {
  return measurementSeriesSchema.parse({
    id: `${normalizedTestName}-0`,
    normalizedTestName,
    canonicalUnit: "g/dL",
    comparability: "UNCERTAIN",
    limitations: [],
    points,
    excluded: [],
  });
}

function point(n: number, reportDate: string | null, numericValue: number) {
  return {
    reportId: id(n),
    extractionId: id(n + 10),
    measurementId: id(n + 20),
    reportDate,
    numericValue,
    textValue: null,
    unit: "g/dL",
    referenceRange: "12-16",
    rangeBounds: { low: 12, high: 16 },
    sourceFlag: null,
    flag: "UNKNOWN" as const,
    verified: true as const,
    converted: false,
    originalUnit: "g/dL",
    originalNumericValue: numericValue,
    originalTextValue: null,
    originalReferenceRange: "12-16",
    laboratory: null,
    method: null,
    specimen: null,
    valueKind: "EXACT" as const,
    change: null,
  };
}
