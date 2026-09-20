import {
  ATTENTION_RULES_VERSION,
  TERMINOLOGY_MAPPING_VERSION,
  attentionAssessmentSchema,
  attentionRuleInputSchema,
  latestMetricCardSchema,
  metricExplanationSchema,
  type AttentionAssessmentDto,
  type AttentionRuleInput,
  type LatestMetricCardDto,
  type MeasurementSeriesDto,
  type MetricExplanationDto,
} from "@medvault/shared";

interface TerminologyEntry {
  displayName: string;
  explanation: string;
  source: { title: string; publisher: string; url: string };
}

const MEDLINEPLUS = "U.S. National Library of Medicine — MedlinePlus";
const source = (title: string, url: string) => ({ title, publisher: MEDLINEPLUS, url });

// Curated, versioned general-information mappings. They deliberately contain no
// patient-specific interpretation, thresholds, diagnoses, or urgency claims.
const terminology: Readonly<Record<string, TerminologyEntry>> = {
  cbc: {
    displayName: "Complete blood count (CBC)",
    explanation:
      "A CBC is a group of blood tests that measures several kinds and features of blood cells, including red cells, white cells, platelets and hemoglobin.",
    source: source(
      "Complete Blood Count (CBC)",
      "https://medlineplus.gov/lab-tests/complete-blood-count-cbc/",
    ),
  },
  hemoglobin: {
    displayName: "Hemoglobin",
    explanation:
      "Hemoglobin is an iron-containing protein in red blood cells that carries oxygen from the lungs to the rest of the body.",
    source: source(
      "Complete Blood Count (CBC)",
      "https://medlineplus.gov/lab-tests/complete-blood-count-cbc/",
    ),
  },
  wbc: {
    displayName: "White blood cell count",
    explanation:
      "A white blood cell count measures cells that are part of the immune system and help the body respond to infections and other diseases.",
    source: source(
      "Complete Blood Count (CBC)",
      "https://medlineplus.gov/lab-tests/complete-blood-count-cbc/",
    ),
  },
  platelets: {
    displayName: "Platelet count",
    explanation:
      "A platelet count measures platelets, blood-cell fragments that help stop bleeding by taking part in clot formation.",
    source: source("Platelet Tests", "https://medlineplus.gov/lab-tests/platelet-tests/"),
  },
  hba1c: {
    displayName: "Hemoglobin A1C (HbA1c)",
    explanation:
      "HbA1c is a blood test that reflects average blood glucose over roughly the previous two to three months.",
    source: source(
      "Hemoglobin A1C (HbA1c) Test",
      "https://medlineplus.gov/lab-tests/hemoglobin-a1c-hba1c-test/",
    ),
  },
  "fasting blood glucose": {
    displayName: "Fasting blood glucose",
    explanation:
      "A blood glucose test measures glucose, a sugar used by the body for energy. “Fasting” records the preparation context supplied by the source report.",
    source: source("Blood Glucose Test", "https://medlineplus.gov/lab-tests/blood-glucose-test/"),
  },
  "random blood glucose": {
    displayName: "Random blood glucose",
    explanation:
      "A blood glucose test measures glucose, a sugar used by the body for energy. “Random” records the collection context supplied by the source report.",
    source: source("Blood Glucose Test", "https://medlineplus.gov/lab-tests/blood-glucose-test/"),
  },
  creatinine: {
    displayName: "Creatinine",
    explanation:
      "Creatinine is a waste product produced during normal muscle use; blood or urine tests measure it as one part of evaluating kidney function.",
    source: source("Creatinine Test", "https://medlineplus.gov/lab-tests/creatinine-test/"),
  },
  tsh: {
    displayName: "Thyroid-stimulating hormone (TSH)",
    explanation:
      "TSH is a hormone made by the pituitary gland that signals the thyroid how much thyroid hormone to produce; a TSH test measures it in blood.",
    source: source(
      "TSH (Thyroid-stimulating hormone) Test",
      "https://medlineplus.gov/lab-tests/tsh-thyroid-stimulating-hormone-test/",
    ),
  },
  alt: {
    displayName: "Alanine aminotransferase (ALT)",
    explanation:
      "ALT is an enzyme found mainly in the liver. An ALT blood test is commonly included with other tests used to evaluate liver health.",
    source: source("ALT Blood Test", "https://medlineplus.gov/lab-tests/alt-blood-test/"),
  },
  ast: {
    displayName: "Aspartate aminotransferase (AST)",
    explanation:
      "AST is an enzyme found in the liver and other tissues. An AST blood test is usually considered together with other clinical and laboratory information.",
    source: source("AST Test", "https://medlineplus.gov/lab-tests/ast-test/"),
  },
  "total cholesterol": cholesterolEntry("Total cholesterol"),
  hdl: cholesterolEntry("HDL cholesterol"),
  ldl: cholesterolEntry("LDL cholesterol"),
  "uric acid": {
    displayName: "Uric acid",
    explanation:
      "A uric acid test measures uric acid in blood or urine. Uric acid is produced when the body breaks down substances called purines.",
    source: source("Uric Acid Test", "https://medlineplus.gov/lab-tests/uric-acid-test/"),
  },
  sodium: {
    displayName: "Sodium",
    explanation:
      "A sodium blood test measures sodium, an electrolyte involved in fluid balance and normal nerve and muscle function.",
    source: source("Sodium Blood Test", "https://medlineplus.gov/lab-tests/sodium-blood-test/"),
  },
  potassium: {
    displayName: "Potassium",
    explanation:
      "A potassium blood test measures potassium, an electrolyte involved in fluid balance and normal nerve, muscle and heart function.",
    source: source(
      "Potassium Blood Test",
      "https://medlineplus.gov/lab-tests/potassium-blood-test/",
    ),
  },
};

function cholesterolEntry(displayName: string): TerminologyEntry {
  return {
    displayName,
    explanation:
      "A cholesterol test measures cholesterol and related lipids in blood. Total cholesterol, HDL and LDL are distinct reported measurements and should not be treated as interchangeable.",
    source: source("Cholesterol Levels", "https://medlineplus.gov/lab-tests/cholesterol-levels/"),
  };
}

const mappedUncertainty =
  "General test information only. It does not interpret this result or replace the source report, its laboratory-specific reference range, or a qualified clinician’s assessment.";
const unmappedUncertainty =
  "No reviewed terminology mapping is available for this normalized name. Use the original report wording and ask a qualified clinician for patient-specific meaning.";

export function explainNormalizedMetric(normalizedTestName: string): MetricExplanationDto {
  const key = normalizedTestName.trim().toLowerCase();
  const entry = terminology[key];
  return metricExplanationSchema.parse(
    entry
      ? {
          normalizedTestName: key,
          displayName: entry.displayName,
          explanation: entry.explanation,
          uncertainty: mappedUncertainty,
          mappingVersion: TERMINOLOGY_MAPPING_VERSION,
          certainty: "MAPPED_GENERAL_INFORMATION",
          source: entry.source,
        }
      : {
          normalizedTestName: key,
          displayName: titleCase(key),
          explanation: "MedVault has no reviewed plain-English explanation for this test name.",
          uncertainty: unmappedUncertainty,
          mappingVersion: TERMINOLOGY_MAPPING_VERSION,
          certainty: "UNMAPPED",
          source: null,
        },
  );
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Unknown test";
}

export const ATTENTION_SOURCE_FIXTURES = [
  {
    title: "How to Understand Your Lab Results",
    publisher: MEDLINEPLUS,
    url: "https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/",
    purpose: "INFORMATIONAL_BOUNDARY_ONLY" as const,
    clinicalApproval: "NOT_APPROVED" as const,
  },
] as const;

export function cannotAssessAttention(): AttentionAssessmentDto {
  return attentionAssessmentSchema.parse({
    status: "CANNOT_ASSESS",
    reason: "NO_CLINICALLY_APPROVED_RULE_SET",
    message:
      "Clinical significance and urgency cannot be assessed from these results alone. Review the original report and its source-specific flags and ranges, and discuss concerns with a qualified clinician. Automated urgency remains disabled until a clinically approved, context-specific rule set exists.",
    rulesVersion: ATTENTION_RULES_VERSION,
    coverage: {
      automatedUrgencyEnabled: false,
      supportedMetrics: [],
      requiredContext: [
        "normalizedTestName",
        "value",
        "unit",
        "sourceReferenceRange",
        "laboratory",
        "method",
        "specimen",
        "patientContext",
      ],
    },
    provenance: ATTENTION_SOURCE_FIXTURES,
  });
}

export function assessAttention(input: AttentionRuleInput): AttentionAssessmentDto {
  attentionRuleInputSchema.parse(input);
  return cannotAssessAttention();
}

export function buildLatestMetricCards(
  series: readonly MeasurementSeriesDto[],
): LatestMetricCardDto[] {
  const byMetric = new Map<
    string,
    { series: MeasurementSeriesDto; latest: MeasurementSeriesDto["points"][number] }
  >();
  for (const candidateSeries of series) {
    // An unknown clinical date is valid history, but cannot determine a latest result.
    const latest = candidateSeries.points.filter((point) => point.reportDate !== null).at(-1);
    if (!latest) continue;
    const existing = byMetric.get(candidateSeries.normalizedTestName);
    if (!existing || compareLatest(latest, existing.latest) < 0)
      byMetric.set(candidateSeries.normalizedTestName, { series: candidateSeries, latest });
  }

  return [...byMetric.entries()]
    .map(([normalizedTestName, selected]) =>
      latestMetricCardSchema.parse({
        normalizedTestName,
        canonicalUnit: selected.series.canonicalUnit,
        comparability: selected.series.comparability,
        observationCount: series
          .filter((item) => item.normalizedTestName === normalizedTestName)
          .reduce((total, item) => total + item.points.length, 0),
        latest: selected.latest,
        explanation: explainNormalizedMetric(normalizedTestName),
      }),
    )
    .sort((left, right) => compareLatest(left.latest, right.latest))
    .slice(0, 12);
}

function compareLatest(
  left: MeasurementSeriesDto["points"][number],
  right: MeasurementSeriesDto["points"][number],
): number {
  return (
    (right.reportDate ?? "").localeCompare(left.reportDate ?? "", "en") ||
    left.reportId.localeCompare(right.reportId, "en") ||
    left.measurementId.localeCompare(right.measurementId, "en")
  );
}
