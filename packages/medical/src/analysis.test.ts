import { describe, expect, it } from "vitest";
import { type AnalysisSource, formatClinicalDate } from "@medvault/shared";
import {
  buildMeasurementSeries,
  commonReferenceBounds,
  buildSummaryInput,
  computeChange,
  normalizeTestName,
} from "./index.js";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function source(n: number, date: string | null, value: number | null = 14): AnalysisSource {
  return {
    id: uuid(n),
    patientId: uuid(99),
    checksum: String(n).padStart(64, "0"),
    documentType: "REPORT",
    processingStatus: "VERIFIED",
    verificationStatus: "VERIFIED",
    documentVersion: 1,
    documentDate: date,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    laboratory: "Synthetic lab",
    method: null,
    specimen: null,
    extraction: {
      id: uuid(n + 100),
      status: "VERIFIED",
      documentVersion: 1,
      updatedAt: "2026-09-01T00:00:00.000Z",
      measurements: [
        {
          id: uuid(n + 200),
          sortOrder: 0,
          name: "Hb",
          numericValue: value,
          textValue: null,
          unit: "g/dL",
          referenceRange: "12-16",
          sourceFlag: null,
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    },
  };
}
const build = (...sources: AnalysisSource[]) => buildMeasurementSeries(sources, uuid(99));
describe("reviewed comparison contract", () => {
  it("retains out-of-order and same-day reports without using upload date for chronology", () => {
    const series = build(source(1, "2026-08-15"), source(2, "2026-08-01"), source(3, "2026-08-01"))
      .series[0]!;
    expect(series.points.map((p) => p.reportId)).toEqual([uuid(2), uuid(3), uuid(1)]);
    expect(series.points[1]!.change).toBeNull();
    expect(series.comparability).toBe("UNCERTAIN");
  });
  it("retains unknown dates but does not fabricate changes or plot dates", () => {
    expect(build(source(1, null)).series[0]!.points[0]!.reportDate).toBeNull();
    expect(formatClinicalDate(null)).toBe("Date unknown");
    expect(formatClinicalDate("2026-08-01")).toContain("Aug 1, 2026");
    expect(formatClinicalDate("08/01/2026")).toBe("Date unknown");
  });
  it("does not merge analyte qualifiers", () => {
    expect(normalizeTestName("glucose (fasting)")).not.toBe(normalizeTestName("glucose (random)"));
    expect(normalizeTestName("TSH receptor antibody")).not.toBe(normalizeTestName("TSH"));
  });
  it("converts both observations and ranges while preserving originals", () => {
    const second = source(2, "2026-08-03", 150);
    Object.assign(second.extraction!.measurements[0]!, { unit: "g/L", referenceRange: "120-160" });
    const points = build(source(1, "2026-08-01"), second).series[0]!.points;
    expect(points[1]).toMatchObject({
      numericValue: 15,
      originalNumericValue: 150,
      originalUnit: "g/L",
      rangeBounds: { low: 12, high: 16 },
    });
    expect(points[1]!.change!.absolute).toBe(1);
    expect(commonReferenceBounds(points)).toEqual({ low: 12, high: 16 });
  });
  it("does not share a reference band when any range is unknown or different", () => {
    const second = source(2, "2026-08-02");
    second.extraction!.measurements[0]!.referenceRange = null;
    expect(
      commonReferenceBounds(build(source(1, "2026-08-01"), second).series[0]!.points),
    ).toBeNull();
    second.extraction!.measurements[0]!.referenceRange = "10-15";
    expect(
      commonReferenceBounds(build(source(1, "2026-08-01"), second).series[0]!.points),
    ).toBeNull();
  });
  it.each(["<5", ">100", "not detected", "approximately five", "5 or 6"])(
    "retains %s without an invented exact value",
    (text) => {
      const s = source(1, "2026-08-01", 5);
      s.extraction!.measurements[0]!.textValue = text;
      expect(build(s).series[0]!.points[0]).toMatchObject({ numericValue: null, textValue: text });
    },
  );
  it("separates laboratories and unsupported units", () => {
    const b = source(2, "2026-08-03");
    b.laboratory = "Other lab";
    expect(build(source(1, "2026-08-01"), b).series).toHaveLength(2);
    b.laboratory = "Synthetic lab";
    b.extraction!.measurements[0]!.unit = "mmol/L";
    expect(build(source(1, "2026-08-01"), b).series).toHaveLength(2);
  });
  it("separates supplied method and specimen context and never treats unknown context as established", () => {
    const a = source(1, "2026-08-01");
    const b = source(2, "2026-08-03");
    a.method = "Method A";
    a.specimen = "Serum";
    b.method = "Method B";
    b.specimen = "Plasma";
    expect(build(a, b).series).toHaveLength(2);

    const unknown = build(source(3, "2026-08-04")).series[0]!;
    expect(unknown.comparability).toBe("UNCERTAIN");
    expect(unknown.points[0]).toMatchObject({ method: null, specimen: null });
  });
  it("excludes repeat imports, not independent same-day measurements", () => {
    const a = source(1, "2026-08-01"),
      b = source(2, "2026-08-01");
    expect(build(a, b).series[0]!.points).toHaveLength(2);
    b.checksum = a.checksum;
    expect(build(a, b).series[0]!.points).toHaveLength(1);
  });
  it("excludes unreviewed, mismatched revisions, prescriptions and other patients", () => {
    const a = source(1, "2026-08-01");
    a.documentType = "PRESCRIPTION";
    const b = source(2, "2026-08-01");
    b.patientId = uuid(98);
    const c = source(3, "2026-08-01");
    c.extraction!.documentVersion = 2;
    const d = source(4, "2026-08-01");
    d.processingStatus = "FAILED";
    expect(build(a, b, c, d).excludedReports).toHaveLength(4);
    expect(build(a, b, c, d).series).toHaveLength(0);
  });
  it("calculates decimal changes and leaves a zero-baseline percentage unavailable", () => {
    expect(computeChange(0.1, 0.3).absolute).toBe(0.2);
    expect(computeChange(0, 5).percentChange).toBeNull();
    expect(() => computeChange(Infinity, 1)).toThrow();
  });
  it("never supplies trend claims for a single-report summary", () => {
    const result = buildSummaryInput("REPORT", build(source(1, "2026-08-01")).series);
    expect(result.facts.every((f) => f.kind !== "CHANGE")).toBe(true);
    expect(result.explanations).toMatchObject([
      {
        normalizedTestName: "hemoglobin",
        certainty: "MAPPED_GENERAL_INFORMATION",
        source: { url: expect.stringContaining("medlineplus.gov") },
      },
    ]);
  });
});
