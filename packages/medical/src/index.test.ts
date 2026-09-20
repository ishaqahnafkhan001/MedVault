import { describe, expect, it } from "vitest";
import {
  UnitConversionNotSupported,
  categorizeTestName,
  computeChange,
  convertUnit,
  isQualitativeValue,
  normalizeTestName,
  selectLatestVerifiedReports,
  seriesCompatible,
} from "./index.js";

// ── normalizeTestName ─────────────────────────────────────────────────────────

describe("normalizeTestName", () => {
  it.each(["CBC", "Complete Blood Count", "Complete Blood Count (CBC)", "Full Blood Count", "FBC"])(
    "normalizes '%s' to 'cbc'",
    (name) => expect(normalizeTestName(name)).toBe("cbc"),
  );

  it.each(["Hemoglobin", "Hb", "HGB"])("normalizes '%s' to 'hemoglobin'", (name) =>
    expect(normalizeTestName(name)).toBe("hemoglobin"),
  );

  it.each(["WBC", "White Blood Cell Count", "Leukocyte Count"])(
    "normalizes '%s' to 'wbc'",
    (name) => expect(normalizeTestName(name)).toBe("wbc"),
  );

  it.each(["Platelets", "Platelet Count", "PLT", "Thrombocytes"])(
    "normalizes '%s' to 'platelets'",
    (name) => expect(normalizeTestName(name)).toBe("platelets"),
  );

  it.each(["HbA1c", "Hemoglobin A1c", "Glycated Hemoglobin", "Glycohemoglobin"])(
    "normalizes '%s' to 'hba1c'",
    (name) => expect(normalizeTestName(name)).toBe("hba1c"),
  );

  it.each(["TSH", "Thyroid Stimulating Hormone", "Thyrotropin"])(
    "normalizes '%s' to 'tsh'",
    (name) => expect(normalizeTestName(name)).toBe("tsh"),
  );

  it.each(["ECG", "Electrocardiogram", "EKG"])("normalizes '%s' to 'ecg'", (name) =>
    expect(normalizeTestName(name)).toBe("ecg"),
  );

  it.each(["ALT", "Alanine Aminotransferase", "SGPT"])("normalizes '%s' to 'alt'", (name) =>
    expect(normalizeTestName(name)).toBe("alt"),
  );

  it.each(["AST", "Aspartate Aminotransferase", "SGOT"])("normalizes '%s' to 'ast'", (name) =>
    expect(normalizeTestName(name)).toBe("ast"),
  );

  it("does not merge fasting glucose and random glucose", () => {
    expect(normalizeTestName("Fasting Blood Glucose")).toBe("fasting blood glucose");
    expect(normalizeTestName("Random Blood Glucose")).toBe("random blood glucose");
    expect(normalizeTestName("Fasting Blood Glucose")).not.toBe(
      normalizeTestName("Random Blood Glucose"),
    );
  });

  it("does not merge total cholesterol, HDL, and LDL", () => {
    const total = normalizeTestName("Total Cholesterol");
    const hdl = normalizeTestName("HDL Cholesterol");
    const ldl = normalizeTestName("LDL Cholesterol");
    expect(new Set([total, hdl, ldl]).size).toBe(3);
  });
});

// ── categorizeTestName ────────────────────────────────────────────────────────

describe("categorizeTestName", () => {
  it("categorizes deterministically", () => {
    expect(categorizeTestName("Complete Blood Count")).toBe("HEMATOLOGY");
    expect(categorizeTestName("ECG")).toBe("CARDIOLOGY");
    expect(categorizeTestName("Fasting Blood Glucose")).toBe("BIOCHEMISTRY");
    expect(categorizeTestName("ALT")).toBe("BIOCHEMISTRY");
    expect(categorizeTestName("TSH")).toBe("ENDOCRINOLOGY");
  });
});

// ── selectLatestVerifiedReports ───────────────────────────────────────────────

describe("selectLatestVerifiedReports", () => {
  it("chooses March regardless of upload order", () => {
    const reports = [
      candidate("january", "2026-01-10", "2026-05-01"),
      candidate("march", "2026-03-10", "2026-03-11"),
      candidate("february", "2026-02-10", "2026-06-01"),
    ];
    expect(selectLatestVerifiedReports(reports)[0]?.id).toBe("march");
  });

  it("uses createdAt only to break a same-report-date tie", () => {
    const reports = [
      candidate("first", "2026-03-10", "2026-03-11"),
      candidate("second", "2026-03-10", "2026-03-12"),
    ];
    expect(selectLatestVerifiedReports(reports)[0]?.id).toBe("second");
  });

  it("excludes unverified and undated reports", () => {
    const unverified = { ...candidate("draft", "2026-05-10", "2026-05-10"), verified: false };
    const verified = candidate("verified", "2026-03-10", "2026-03-10");
    const undated = { ...candidate("undated", "2026-01-01", "2026-06-10"), reportDate: null };
    expect(
      selectLatestVerifiedReports([unverified, verified, undated]).map(({ id }) => id),
    ).toEqual(["verified"]);
  });

  it("preserves same-day reports from different test names", () => {
    const cbcReport = candidateWithName("cbc-1", "cbc", "2026-03-10", "2026-03-10");
    const altReport = candidateWithName("alt-1", "alt", "2026-03-10", "2026-03-10");
    const results = selectLatestVerifiedReports([cbcReport, altReport]);
    expect(results.map((r) => r.id)).toContain("cbc-1");
    expect(results.map((r) => r.id)).toContain("alt-1");
  });

  it("totally orders group winners before a caller applies the 12-group limit", () => {
    const reports = Array.from({ length: 13 }, (_, index) =>
      candidateWithName(
        `id-${String(index).padStart(2, "0")}`,
        `test-${String(index).padStart(2, "0")}`,
        "2026-03-10",
        "2026-03-11",
      ),
    ).reverse();
    const limited = selectLatestVerifiedReports(reports).slice(0, 12);
    expect(limited.map(({ normalizedTestName }) => normalizedTestName)).toEqual(
      Array.from({ length: 12 }, (_, index) => `test-${String(index).padStart(2, "0")}`),
    );
  });
});

// ── convertUnit ───────────────────────────────────────────────────────────────

describe("convertUnit", () => {
  it("converts glucose mg/dL → mmol/L", () => {
    expect(convertUnit(100, "mg/dL", "mmol/L", { analyte: "fasting blood glucose" })).toBeCloseTo(
      5.55,
      2,
    );
  });

  it("converts glucose mmol/L → mg/dL", () => {
    expect(convertUnit(5.55, "mmol/L", "mg/dL", { analyte: "fasting blood glucose" })).toBeCloseTo(
      100.0,
      0,
    );
  });

  it("converts hemoglobin g/dL → g/L", () => {
    expect(convertUnit(14, "g/dL", "g/L", { analyte: "hemoglobin" })).toBe(140);
  });

  it("converts hemoglobin g/L → g/dL", () => {
    expect(convertUnit(140, "g/L", "g/dL", { analyte: "hemoglobin" })).toBe(14);
  });

  it("converts cholesterol mg/dL → mmol/L with isCholesterol=true", () => {
    expect(convertUnit(200, "mg/dL", "mmol/L", { analyte: "total cholesterol" })).toBeCloseTo(
      5.172,
      3,
    );
  });

  it("converts cholesterol mmol/L → mg/dL with isCholesterol=true", () => {
    expect(convertUnit(5.172, "mmol/L", "mg/dL", { analyte: "total cholesterol" })).toBeCloseTo(
      200,
      0,
    );
  });

  it("returns value unchanged when units are the same", () => {
    expect(convertUnit(14, "g/dL", "g/dL")).toBe(14);
  });

  it("throws UnitConversionNotSupported for unknown pair", () => {
    expect(() => convertUnit(1, "mg/dL", "µmol/L")).toThrow(UnitConversionNotSupported);
  });

  it("does not guess an analyte from units or a broad boolean", () => {
    expect(() => convertUnit(200, "mg/dL", "mmol/L")).toThrow(UnitConversionNotSupported);
    expect(() =>
      convertUnit(200, "mg/dL", "mmol/L", { analyte: "creatinine", isCholesterol: true }),
    ).toThrow(UnitConversionNotSupported);
  });
});

// ── seriesCompatible ──────────────────────────────────────────────────────────

describe("seriesCompatible", () => {
  it("is compatible when units are identical", () => {
    const a = { normalizedName: "hemoglobin", unit: "g/dL" };
    expect(seriesCompatible(a, a).compatible).toBe(true);
  });

  it("is compatible when units can be converted (glucose mg/dL ↔ mmol/L)", () => {
    const a = { normalizedName: "fasting blood glucose", unit: "mg/dL" };
    const b = { normalizedName: "fasting blood glucose", unit: "mmol/L" };
    expect(seriesCompatible(a, b).compatible).toBe(true);
  });

  it("is compatible when both units are null", () => {
    const a = { normalizedName: "ecg", unit: null };
    expect(seriesCompatible(a, a).compatible).toBe(true);
  });

  it("is incompatible when normalizedNames differ", () => {
    const a = { normalizedName: "hemoglobin", unit: "g/dL" };
    const b = { normalizedName: "creatinine", unit: "g/dL" };
    const result = seriesCompatible(a, b);
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain("analyte");
  });

  it("is incompatible when one unit is missing", () => {
    const a = { normalizedName: "alt", unit: "U/L" };
    const b = { normalizedName: "alt", unit: null };
    expect(seriesCompatible(a, b).compatible).toBe(false);
  });

  it("is incompatible for unsupported unit pair with same name", () => {
    const a = { normalizedName: "alt", unit: "U/L" };
    const b = { normalizedName: "alt", unit: "µkat/L" };
    expect(seriesCompatible(a, b).compatible).toBe(false);
  });

  it("is compatible for cholesterol with isCholesterol flag", () => {
    const a = { normalizedName: "total cholesterol", unit: "mg/dL" };
    const b = { normalizedName: "total cholesterol", unit: "mmol/L" };
    expect(seriesCompatible(a, b, { isCholesterol: true }).compatible).toBe(true);
  });
});

// ── computeChange ─────────────────────────────────────────────────────────────

describe("computeChange", () => {
  it("computes absolute and percent change", () => {
    const result = computeChange(100, 120);
    expect(result.absolute).toBe(20);
    expect(result.percentChange).toBeCloseTo(20, 5);
  });

  it("handles negative change", () => {
    const result = computeChange(120, 100);
    expect(result.absolute).toBe(-20);
    expect(result.percentChange).toBeCloseTo(-16.667, 2);
  });

  it("returns null percentChange when previous is zero", () => {
    const result = computeChange(0, 5);
    expect(result.absolute).toBe(5);
    expect(result.percentChange).toBeNull();
  });

  it("returns zero change when values are equal", () => {
    const result = computeChange(50, 50);
    expect(result.absolute).toBe(0);
    expect(result.percentChange).toBe(0);
  });
});

// ── isQualitativeValue ────────────────────────────────────────────────────────

describe("isQualitativeValue", () => {
  it.each(["<5", ">100", "≤10", "≥50"])("detects bounded value '%s'", (v) =>
    expect(isQualitativeValue(v)).toBe(true),
  );

  it.each(["not detected", "Positive", "NEGATIVE", "Reactive", "Trace"])(
    "detects qualitative term '%s'",
    (v) => expect(isQualitativeValue(v)).toBe(true),
  );

  it.each(["14.5", "100", "0", "5.2"])("does not flag numeric value '%s'", (v) =>
    expect(isQualitativeValue(v)).toBe(false),
  );

  it("returns false for null/undefined", () => {
    expect(isQualitativeValue(null)).toBe(false);
    expect(isQualitativeValue(undefined)).toBe(false);
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function candidate(id: string, reportDate: string, createdAt: string) {
  return candidateWithName(id, "cbc", reportDate, createdAt);
}

function candidateWithName(
  id: string,
  normalizedTestName: string,
  reportDate: string,
  createdAt: string,
) {
  return {
    id,
    normalizedTestName,
    reportDate: new Date(reportDate),
    createdAt: new Date(createdAt),
    verified: true,
  };
}
