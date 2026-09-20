import { z } from "zod";

export const SUMMARY_PROMPT_VERSION = "phase2-grounded-v3";
export const ANALYSIS_CONFIG_VERSION = "reviewed-observations-v3";
export const SUMMARY_JOB = "summarize-reviewed-sources";
export const SUMMARY_MAX_REPORTS = 30;
export const SUMMARY_MAX_OBSERVATIONS = 500;
export const MEASUREMENT_HISTORY_MAX_REPORTS = 200;
export const TERMINOLOGY_MAPPING_VERSION = "medlineplus-curated-2026-09-21-v1";
export const ATTENTION_RULES_VERSION = "disabled-no-validated-clinical-rules";
export const summaryStatuses = ["QUEUED", "PROCESSING", "COMPLETED", "FAILED", "STALE"] as const;
export const summaryStatusSchema = z.enum(summaryStatuses);

export const summaryJobSchema = z
  .object({
    analysisId: z.uuid(),
    patientId: z.uuid(),
    inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    correlationId: z.uuid(),
    generation: z.number().int().positive(),
  })
  .strict();
export type SummaryJob = z.infer<typeof summaryJobSchema>;

export const requestSummarySchema = z
  .object({
    forceRegenerate: z.boolean().optional().default(false),
  })
  .strict();
export type RequestSummaryInput = z.infer<typeof requestSummarySchema>;

const nullableText = (max: number) => z.string().max(max).nullable();
const finite = z.number().finite();
export const rangeBoundsSchema = z
  .object({ low: finite, high: finite })
  .strict()
  .refine((v) => v.low <= v.high, "Reference bounds are reversed");
export const trendPointSchema = z
  .object({
    reportId: z.uuid(),
    extractionId: z.uuid(),
    measurementId: z.uuid(),
    reportDate: z.iso.date().nullable(),
    numericValue: finite.nullable(),
    textValue: nullableText(240),
    unit: nullableText(80),
    referenceRange: nullableText(160),
    rangeBounds: rangeBoundsSchema.nullable(),
    sourceFlag: nullableText(40),
    flag: z.enum(["HIGH", "LOW", "ABNORMAL", "CRITICAL", "NORMAL", "UNKNOWN"]),
    verified: z.literal(true),
    converted: z.boolean(),
    originalUnit: nullableText(80),
    originalNumericValue: finite.nullable(),
    originalTextValue: nullableText(240),
    originalReferenceRange: nullableText(160),
    laboratory: nullableText(180),
    method: nullableText(180),
    specimen: nullableText(180),
    valueKind: z.enum(["EXACT", "BOUNDED", "QUALITATIVE", "MISSING"]),
    change: z
      .object({
        previousMeasurementId: z.uuid(),
        absolute: finite,
        percentChange: finite.nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type TrendPointDto = z.infer<typeof trendPointSchema>;
export const measurementSeriesSchema = z
  .object({
    id: z.string().min(1).max(800),
    normalizedTestName: z.string().min(1).max(180),
    canonicalUnit: nullableText(80),
    comparability: z.enum(["ESTABLISHED", "UNCERTAIN"]),
    limitations: z.array(z.string().max(300)).max(10),
    points: z.array(trendPointSchema).max(SUMMARY_MAX_OBSERVATIONS),
    excluded: z.array(z.object({ measurementId: z.uuid(), reason: z.string().max(300) }).strict()),
  })
  .strict();
export type MeasurementSeriesDto = z.infer<typeof measurementSeriesSchema>;
export type SeriesIncompatibilityNote = MeasurementSeriesDto["excluded"][number];

export const terminologySourceSchema = z
  .object({
    title: z.string().min(1).max(200),
    publisher: z.string().min(1).max(120),
    url: z.url().refine((value) => value.startsWith("https://"), "Sources require HTTPS"),
  })
  .strict();
export const metricExplanationSchema = z
  .object({
    normalizedTestName: z.string().min(1).max(180),
    displayName: z.string().min(1).max(180),
    explanation: z.string().min(1).max(600),
    uncertainty: z.string().min(1).max(600),
    mappingVersion: z.literal(TERMINOLOGY_MAPPING_VERSION),
    certainty: z.enum(["MAPPED_GENERAL_INFORMATION", "UNMAPPED"]),
    source: terminologySourceSchema.nullable(),
  })
  .strict();
export type MetricExplanationDto = z.infer<typeof metricExplanationSchema>;

export const latestMetricCardSchema = z
  .object({
    normalizedTestName: z.string().min(1).max(180),
    canonicalUnit: nullableText(80),
    comparability: z.enum(["ESTABLISHED", "UNCERTAIN"]),
    observationCount: z.number().int().positive(),
    latest: trendPointSchema,
    explanation: metricExplanationSchema,
  })
  .strict();
export type LatestMetricCardDto = z.infer<typeof latestMetricCardSchema>;

export const attentionRuleInputSchema = z
  .object({
    normalizedTestName: z.string().min(1).max(180),
    valueKind: z.enum(["EXACT", "BOUNDED", "QUALITATIVE", "MISSING"]),
    numericValue: finite.nullable(),
    textValue: nullableText(240),
    unit: nullableText(80),
    referenceRange: nullableText(160),
    sourceFlag: nullableText(40),
    laboratory: nullableText(180),
    method: nullableText(180),
    specimen: nullableText(180),
    patientContext: z
      .object({
        ageYears: z.number().int().min(0).max(130).nullable(),
        sex: nullableText(40),
        pregnancyStatus: nullableText(40),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type AttentionRuleInput = z.infer<typeof attentionRuleInputSchema>;

export const attentionAssessmentSchema = z
  .object({
    status: z.literal("CANNOT_ASSESS"),
    reason: z.enum([
      "NO_CLINICALLY_APPROVED_RULE_SET",
      "OUTSIDE_VALIDATED_COVERAGE",
      "REQUIRED_CONTEXT_MISSING",
    ]),
    message: z.string().min(1).max(1000),
    rulesVersion: z.literal(ATTENTION_RULES_VERSION),
    coverage: z
      .object({
        automatedUrgencyEnabled: z.literal(false),
        supportedMetrics: z.array(z.string().max(180)).max(100),
        requiredContext: z
          .array(
            z.enum([
              "normalizedTestName",
              "value",
              "unit",
              "sourceReferenceRange",
              "laboratory",
              "method",
              "specimen",
              "patientContext",
            ]),
          )
          .max(20),
      })
      .strict(),
    provenance: z
      .array(
        terminologySourceSchema.extend({
          purpose: z.literal("INFORMATIONAL_BOUNDARY_ONLY"),
          clinicalApproval: z.literal("NOT_APPROVED"),
        }),
      )
      .max(10),
  })
  .strict();
export type AttentionAssessmentDto = z.infer<typeof attentionAssessmentSchema>;

export const measurementHistorySchema = z
  .object({
    series: z.array(measurementSeriesSchema),
    explanations: z.array(metricExplanationSchema),
    excludedReports: z.array(z.object({ id: z.uuid(), reason: z.string().max(100) }).strict()),
    latestMetrics: z.array(latestMetricCardSchema).max(12),
    sourceReportCount: z.number().int().nonnegative(),
    limited: z.boolean(),
    attention: attentionAssessmentSchema,
  })
  .strict();
export type MeasurementHistoryDto = z.infer<typeof measurementHistorySchema>;
export const measurementHistoryResponseSchema = z
  .object({ history: measurementHistorySchema })
  .strict();
export const episodeTrendSchema = z
  .object({
    episodeId: z.uuid(),
    series: z.array(measurementSeriesSchema),
    excludedReports: z.array(z.object({ id: z.uuid(), reason: z.string().max(100) }).strict()),
  })
  .strict();
export type EpisodeTrendDto = z.infer<typeof episodeTrendSchema>;
export const episodeTrendResponseSchema = z.object({ trend: episodeTrendSchema });

// Snapshot contract: reviewed values only. Raw extraction remains in its existing models.
export const analysisSourceSchema = z
  .object({
    id: z.uuid(),
    patientId: z.uuid(),
    checksum: z.string().length(64),
    documentType: z.enum(["REPORT", "PRESCRIPTION"]),
    processingStatus: z.enum([
      "NOT_APPLICABLE",
      "UPLOADED",
      "QUEUED",
      "PROCESSING",
      "NEEDS_REVIEW",
      "VERIFIED",
      "FAILED",
    ]),
    verificationStatus: z.enum(["NOT_APPLICABLE", "PENDING", "VERIFIED"]),
    documentVersion: z.number().int().positive(),
    documentDate: z.iso.date().nullable(),
    updatedAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
    laboratory: nullableText(180),
    method: nullableText(180),
    specimen: nullableText(180),
    extraction: z
      .object({
        id: z.uuid(),
        status: z.enum(["DRAFT", "VERIFIED"]),
        documentVersion: z.number().int().positive(),
        updatedAt: z.iso.datetime(),
        measurements: z
          .array(
            z
              .object({
                id: z.uuid(),
                sortOrder: z.number().int().nonnegative(),
                name: z.string().max(180),
                numericValue: finite.nullable(),
                textValue: nullableText(240),
                unit: nullableText(80),
                referenceRange: nullableText(160),
                sourceFlag: nullableText(40),
                updatedAt: z.iso.datetime(),
              })
              .strict(),
          )
          .max(300),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type AnalysisSource = z.infer<typeof analysisSourceSchema>;

// Gemini may select supplied facts, never author new values, diagnoses or urgency thresholds.
export const summaryFactSchema = z
  .object({
    id: z.string().min(1).max(180),
    kind: z.enum(["OBSERVATION", "CHANGE", "SOURCE_FLAG"]),
    measurementIds: z.array(z.uuid()).min(1).max(2),
    text: z.string().min(1).max(1000),
  })
  .strict();
export type SummaryFact = z.infer<typeof summaryFactSchema>;
export const summaryInputSchema = z
  .object({
    scope: z.enum(["REPORT", "EPISODE"]),
    configVersion: z.literal(ANALYSIS_CONFIG_VERSION),
    promptVersion: z.literal(SUMMARY_PROMPT_VERSION),
    facts: z.array(summaryFactSchema).min(1).max(1500),
    explanations: z.array(metricExplanationSchema).max(500),
  })
  .strict();
export type SummaryInput = z.infer<typeof summaryInputSchema>;
export const summarySelectionSchema = z
  .object({
    findings: z
      .array(z.object({ factId: z.string().min(1).max(180) }).strict())
      .min(1)
      .max(30),
  })
  .strict();
export const groundedSummarySchema = z
  .object({
    findings: z.array(summaryFactSchema).min(1).max(30),
    explanations: z.array(metricExplanationSchema).max(500).default([]),
    limitations: z.array(z.string().max(500)).min(1).max(10),
    guidance: z
      .object({
        status: z.literal("CANNOT_ASSESS"),
        message: z.string().max(1000),
        rulesVersion: z.literal("disabled-no-validated-clinical-rules"),
      })
      .strict(),
  })
  .strict();
export type GroundedSummary = z.infer<typeof groundedSummarySchema>;

export const SUMMARY_LIMITATIONS = [
  "Based on patient-reviewed structured observations, not clinician certification. Extraction or review errors may remain.",
  "A numerical increase or decrease is not automatically improvement or deterioration. Laboratory, method and specimen differences may limit comparison.",
  "Date-only reports do not establish the order of different tests on the same day. Unknown reference ranges remain unknown.",
  "This is not a diagnosis, treatment recommendation or assurance of good health.",
];
export const SUMMARY_GUIDANCE = {
  status: "CANNOT_ASSESS" as const,
  message:
    "Clinical significance and urgency cannot be assessed from these results alone. Review source-report flags and discuss concerns with a qualified clinician. Automated urgency rules are disabled because no clinically validated, context-specific rule set is configured.",
  rulesVersion: ATTENTION_RULES_VERSION,
};

export function groundSummarySelection(raw: unknown, input: SummaryInput): GroundedSummary {
  const selection = summarySelectionSchema.parse(raw);
  const lookup = new Map(input.facts.map((f) => [f.id, f]));
  const seen = new Set<string>();
  const findings = selection.findings.map(({ factId }) => {
    const fact = lookup.get(factId);
    if (!fact || seen.has(factId)) throw new Error("AI_INVALID_REFERENCES");
    seen.add(factId);
    return fact;
  });
  return groundedSummarySchema.parse({
    findings,
    explanations: input.explanations,
    limitations: SUMMARY_LIMITATIONS,
    guidance: SUMMARY_GUIDANCE,
  });
}

export function validateGroundedSummary(raw: unknown, input: SummaryInput): GroundedSummary {
  const value = groundedSummarySchema.parse(raw);
  const expected = groundSummarySelection(
    { findings: value.findings.map((f) => ({ factId: f.id })) },
    input,
  );
  if (JSON.stringify(expected) !== JSON.stringify(value)) throw new Error("AI_UNGROUNDED_OUTPUT");
  return value;
}
export const episodeAnalysisSchema = z
  .object({
    id: z.uuid(),
    status: summaryStatusSchema,
    summaryText: nullableText(32000),
    result: groundedSummarySchema.nullable(),
    provider: z.string().max(40),
    model: z.string().max(120),
    promptVersion: z.string().max(80),
    inputFingerprint: z.string().length(64),
    createdAt: z.iso.datetime(),
    analyzedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
    failureCode: nullableText(80),
  })
  .strict();
export type EpisodeAnalysisDto = z.infer<typeof episodeAnalysisSchema>;
export const summaryResponseSchema = z.object({ analysis: episodeAnalysisSchema.nullable() });

export const analysisFilterSchema = z
  .object({
    metric: z.string().max(180).optional(),
    dateFrom: z.iso.date().optional(),
    dateTo: z.iso.date().optional(),
  })
  .strict()
  .refine((v) => !v.dateFrom || !v.dateTo || v.dateFrom <= v.dateTo, "Date range is reversed");
export type AnalysisFilter = z.infer<typeof analysisFilterSchema>;

export function formatClinicalDate(value: string | null): string {
  if (value === null) return "Date unknown";
  const parsed = z.iso.date().safeParse(value);
  if (!parsed.success) return "Date unknown";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${parsed.data}T00:00:00.000Z`));
}
