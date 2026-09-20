import type { ReportCategory } from "@medvault/shared";
export * from "./analysis.js";
export * from "./intelligence.js";

// ── Alias map ────────────────────────────────────────────────────────────────
// Maps every known test-name variant to one canonical key.
// Canonical keys are lowercase, no punctuation.
// Do NOT add entries that would merge genuinely different tests.
const aliases: Readonly<Record<string, string>> = {
  // CBC
  cbc: "cbc",
  "complete blood count": "cbc",
  "complete blood count cbc": "cbc",
  "full blood count": "cbc",
  fbc: "cbc",
  // Hemoglobin
  hemoglobin: "hemoglobin",
  hb: "hemoglobin",
  hgb: "hemoglobin",
  // WBC
  wbc: "wbc",
  "white blood cell count": "wbc",
  "white blood cells": "wbc",
  "leukocyte count": "wbc",
  // Platelets
  platelets: "platelets",
  "platelet count": "platelets",
  plt: "platelets",
  thrombocytes: "platelets",
  // HbA1c
  hba1c: "hba1c",
  "hemoglobin a1c": "hba1c",
  "glycated hemoglobin": "hba1c",
  glycohemoglobin: "hba1c",
  // Dengue NS1
  "dengue ns1": "dengue ns1",
  "dengue ns1 antigen": "dengue ns1",
  // TSH
  tsh: "tsh",
  "thyroid stimulating hormone": "tsh",
  thyrotropin: "tsh",
  // ECG
  ecg: "ecg",
  electrocardiogram: "ecg",
  ekg: "ecg",
  // Glucose (fasting/random kept distinct — do not merge)
  "fasting blood glucose": "fasting blood glucose",
  "fasting glucose": "fasting blood glucose",
  fbg: "fasting blood glucose",
  "random blood glucose": "random blood glucose",
  "random glucose": "random blood glucose",
  rbg: "random blood glucose",
  // Creatinine
  creatinine: "creatinine",
  "serum creatinine": "creatinine",
  // ALT
  alt: "alt",
  "alanine aminotransferase": "alt",
  sgpt: "alt",
  // AST
  ast: "ast",
  "aspartate aminotransferase": "ast",
  sgot: "ast",
  // Cholesterol (total — kept separate from HDL/LDL)
  "total cholesterol": "total cholesterol",
  cholesterol: "total cholesterol",
  // HDL
  hdl: "hdl",
  "hdl cholesterol": "hdl",
  "high density lipoprotein": "hdl",
  // LDL
  ldl: "ldl",
  "ldl cholesterol": "ldl",
  "low density lipoprotein": "ldl",
  // Uric acid
  "uric acid": "uric acid",
  "serum uric acid": "uric acid",
  urate: "uric acid",
  // Sodium
  sodium: "sodium",
  // Potassium
  potassium: "potassium",
};

export function normalizeTestName(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  return aliases[normalized] ?? normalized;
}

// ── Category rules ───────────────────────────────────────────────────────────

const categoryRules: ReadonlyArray<{ category: ReportCategory; terms: readonly string[] }> = [
  { category: "HEMATOLOGY", terms: ["cbc", "blood count", "hemoglobin", "platelet", "wbc"] },
  { category: "ENDOCRINOLOGY", terms: ["thyroid", "tsh", "t3", "t4", "hba1c"] },
  {
    category: "BIOCHEMISTRY",
    terms: [
      "glucose",
      "creatinine",
      "kidney",
      "liver",
      "lipid",
      "cholesterol",
      "alt",
      "ast",
      "uric",
      "sodium",
      "potassium",
    ],
  },
  { category: "IMMUNOLOGY", terms: ["dengue", "antibody", "antigen", "immunology"] },
  { category: "MICROBIOLOGY", terms: ["culture", "microbiology", "sensitivity"] },
  { category: "CARDIOLOGY", terms: ["ecg", "electrocardiogram", "echocardiogram"] },
  { category: "RADIOLOGY", terms: ["x ray", "ultrasound", "ct scan", "mri", "radiology"] },
  { category: "PATHOLOGY", terms: ["biopsy", "histopathology", "cytology"] },
  { category: "URINALYSIS", terms: ["urine", "urinalysis"] },
];

export function categorizeTestName(testName: string): ReportCategory {
  const normalized = normalizeTestName(testName);
  return (
    categoryRules.find(({ terms }) => terms.some((term) => normalized.includes(term)))?.category ??
    "OTHER"
  );
}

// ── Latest-report selection ──────────────────────────────────────────────────

export interface LatestReportCandidate {
  id: string;
  normalizedTestName: string | null;
  reportDate: Date | null;
  createdAt: Date;
  verified: boolean;
}

export function selectLatestVerifiedReports<T extends LatestReportCandidate>(
  reports: readonly T[],
): T[] {
  const latest = new Map<string, T>();
  const eligible = reports.filter(
    (report): report is T & { normalizedTestName: string; reportDate: Date } =>
      report.verified && report.normalizedTestName !== null && report.reportDate !== null,
  );

  for (const report of eligible) {
    const current = latest.get(report.normalizedTestName);
    if (
      !current ||
      report.reportDate.getTime() > (current.reportDate?.getTime() ?? 0) ||
      (report.reportDate.getTime() === current.reportDate?.getTime() &&
        (report.createdAt.getTime() > current.createdAt.getTime() ||
          (report.createdAt.getTime() === current.createdAt.getTime() && report.id < current.id)))
    ) {
      latest.set(report.normalizedTestName, report);
    }
  }

  return [...latest.values()].sort((left, right) => {
    const byReportDate = (right.reportDate?.getTime() ?? 0) - (left.reportDate?.getTime() ?? 0);
    return (
      byReportDate ||
      right.createdAt.getTime() - left.createdAt.getTime() ||
      (left.normalizedTestName ?? "").localeCompare(right.normalizedTestName ?? "", "en") ||
      left.id.localeCompare(right.id, "en")
    );
  });
}

// ── Unit conversions ─────────────────────────────────────────────────────────
// Only explicitly listed, tested, reversible conversions are supported.
// Factor converts FROM → TO.

const UNIT_CONVERSIONS: Readonly<Record<string, number>> = {
  // Glucose: mg/dL ↔ mmol/L
  "mg/dl|mmol/l": 0.0555,
  "mmol/l|mg/dl": 18.018,
  // Hemoglobin: g/dL ↔ g/L
  "g/dl|g/l": 10,
  "g/l|g/dl": 0.1,
  // Cholesterol (total, HDL, LDL): mg/dL ↔ mmol/L — different factor from glucose
  // Key prefixed with "chol:" to avoid collision
  "chol:mg/dl|mmol/l": 0.02586,
  "chol:mmol/l|mg/dl": 38.67,
};

export class UnitConversionNotSupported extends Error {
  constructor(fromUnit: string, toUnit: string) {
    super(`Unit conversion not supported: ${fromUnit} → ${toUnit}`);
    this.name = "UnitConversionNotSupported";
  }
}

/**
 * Convert a numeric value between supported units.
 * Throws UnitConversionNotSupported for any pair not in the allow-list.
 * A supported analyte is mandatory for different units; units or the legacy boolean alone are insufficient.
 */
export function convertUnit(
  value: number,
  fromUnit: string,
  toUnit: string,
  options?: { analyte?: string; isCholesterol?: boolean },
): number {
  if (!Number.isFinite(value)) throw new RangeError("A finite value is required");
  const from = fromUnit.toLowerCase().trim();
  const to = toUnit.toLowerCase().trim();
  if (from === to) return value;

  const baseKey = `${from}|${to}`;
  const cholKey = `chol:${baseKey}`;
  const analyte = options?.analyte ? normalizeTestName(options.analyte) : null;
  if (analyte && ["total cholesterol", "hdl", "ldl"].includes(analyte)) {
    const factor = UNIT_CONVERSIONS[cholKey];
    if (factor !== undefined) return decimalProduct(value, factor);
  }
  const applicable =
    (analyte === "hemoglobin" && ["g/dl|g/l", "g/l|g/dl"].includes(baseKey)) ||
    (["fasting blood glucose", "random blood glucose", "glucose"].includes(analyte ?? "") &&
      ["mg/dl|mmol/l", "mmol/l|mg/dl"].includes(baseKey));
  const factor = applicable ? UNIT_CONVERSIONS[baseKey] : undefined;
  if (factor !== undefined) return decimalProduct(value, factor);

  throw new UnitConversionNotSupported(fromUnit, toUnit);
}

// ── Series compatibility ──────────────────────────────────────────────────────

export interface SeriesCompatibilityResult {
  compatible: boolean;
  /** Human-readable reason when incompatible; undefined when compatible. */
  reason?: string;
}

/**
 * Returns whether two measurement data-points belong to the same comparable series.
 * Matching units alone is insufficient — normalizedName must also match.
 * When units differ but a supported conversion exists, points are compatible
 * (caller is responsible for converting before arithmetic).
 */
export function seriesCompatible(
  a: {
    normalizedName: string;
    unit: string | null;
    laboratory?: string | null;
    method?: string | null;
    specimen?: string | null;
  },
  b: {
    normalizedName: string;
    unit: string | null;
    laboratory?: string | null;
    method?: string | null;
    specimen?: string | null;
  },
  _options?: { isCholesterol?: boolean },
): SeriesCompatibilityResult {
  void _options;
  if (a.normalizedName !== b.normalizedName) {
    return { compatible: false, reason: "Different analyte names" };
  }
  for (const key of ["laboratory", "method", "specimen"] as const) {
    if ((a[key]?.trim().toLowerCase() ?? null) !== (b[key]?.trim().toLowerCase() ?? null)) {
      return { compatible: false, reason: `Different or unknown ${key}` };
    }
  }
  const au = a.unit?.toLowerCase().trim() ?? null;
  const bu = b.unit?.toLowerCase().trim() ?? null;

  if (au === null && bu === null) return { compatible: true };
  if (au === null || bu === null) {
    return { compatible: false, reason: "One measurement is missing a unit" };
  }
  if (au === bu) return { compatible: true };

  // Check supported conversion
  try {
    convertUnit(1, au, bu, { analyte: a.normalizedName });
    return { compatible: true };
  } catch {
    return { compatible: false, reason: "Unsupported analyte-specific unit conversion" };
  }
}

// ── Change computation ────────────────────────────────────────────────────────

export interface ChangeResult {
  absolute: number;
  /** null when previous value is zero (division undefined) */
  percentChange: number | null;
}

/**
 * Compute absolute and percentage change between two numeric measurements.
 * All arithmetic is performed here — AI must never perform this calculation.
 * percentChange is null when previous === 0.
 */
export function computeChange(previous: number, current: number): ChangeResult {
  if (!Number.isFinite(previous) || !Number.isFinite(current))
    throw new RangeError("Finite observations required");
  const [p, ps] = decimalParts(previous);
  const [c, cs] = decimalParts(current);
  const scale = Math.max(ps, cs);
  const absolute =
    Number(c * 10n ** BigInt(scale - cs) - p * 10n ** BigInt(scale - ps)) / 10 ** scale;
  const percentChange = previous === 0 ? null : (absolute / Math.abs(previous)) * 100;
  if (!Number.isFinite(absolute) || (percentChange !== null && !Number.isFinite(percentChange)))
    throw new RangeError("Change exceeds finite precision");
  return { absolute, percentChange };
}

function decimalParts(value: number): [bigint, number] {
  const [coefficient = "0", exponent = "0"] = value.toString().split("e");
  const decimals = coefficient.split(".")[1]?.length ?? 0;
  const scale = decimals - Number(exponent);
  const integer = BigInt(coefficient.replace(".", ""));
  return scale < 0 ? [integer * 10n ** BigInt(-scale), 0] : [integer, scale];
}

function decimalProduct(a: number, b: number): number {
  const [ai, as] = decimalParts(a);
  const [bi, bs] = decimalParts(b);
  const result = Number(ai * bi) / 10 ** (as + bs);
  if (!Number.isFinite(result)) throw new RangeError("Conversion exceeds finite precision");
  return result;
}

// ── Qualitative value detection ───────────────────────────────────────────────

const QUALITATIVE_TERMS = new Set([
  "not detected",
  "detected",
  "positive",
  "negative",
  "reactive",
  "non-reactive",
  "nonreactive",
  "borderline",
  "equivocal",
  "trace",
  "absent",
  "present",
  "normal",
  "abnormal",
]);

/**
 * Returns true when the text represents a qualitative or bounded result
 * such as "<5", ">100", "not detected", or "positive".
 * These values must NOT be converted to invented numeric values.
 */
export function isQualitativeValue(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim().toLowerCase();
  if (/^[<>≤≥]/.test(t)) return true;
  return (
    QUALITATIVE_TERMS.has(t) || [...QUALITATIVE_TERMS].some((term) => t.startsWith(term + " "))
  );
}
