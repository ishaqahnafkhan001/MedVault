import { z } from "zod";

export * from "./environment.js";
export * from "./queue.js";
export * from "./analysis.js";
import {
  episodeAnalysisSchema,
  latestMetricCardSchema,
  type EpisodeAnalysisDto,
  type LatestMetricCardDto,
} from "./analysis.js";

export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

export const documentTypes = ["REPORT", "PRESCRIPTION"] as const;
export const processingStatuses = [
  "NOT_APPLICABLE",
  "UPLOADED",
  "QUEUED",
  "PROCESSING",
  "NEEDS_REVIEW",
  "VERIFIED",
  "FAILED",
] as const;
export const verificationStatuses = ["NOT_APPLICABLE", "PENDING", "VERIFIED"] as const;
export const reportCategories = [
  "HEMATOLOGY",
  "BIOCHEMISTRY",
  "IMMUNOLOGY",
  "MICROBIOLOGY",
  "ENDOCRINOLOGY",
  "CARDIOLOGY",
  "RADIOLOGY",
  "PATHOLOGY",
  "URINALYSIS",
  "OTHER",
] as const;

export const documentTypeSchema = z.enum(documentTypes);
export const processingStatusSchema = z.enum(processingStatuses);
export const verificationStatusSchema = z.enum(verificationStatuses);
export const reportCategorySchema = z.enum(reportCategories);

const nullableTrimmed = (max: number) => z.string().trim().max(max).nullable().optional();

export const patientProfileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    dateOfBirth: z.iso.date().nullable().optional(),
    gender: nullableTrimmed(40),
    bloodGroup: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).nullable().optional(),
    allergies: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
    chronicConditions: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
    emergencyContactName: nullableTrimmed(120),
    emergencyContactPhone: nullableTrimmed(40),
    emergencyContactRelation: nullableTrimmed(60),
  })
  .strict();

export const documentMetadataSchema = z
  .object({
    documentType: documentTypeSchema,
    documentDate: z.iso.date().nullable().optional(),
    testName: nullableTrimmed(180),
    hospitalName: nullableTrimmed(180),
    category: reportCategorySchema.nullable().optional(),
  })
  .strict();

export const updateDocumentSchema = z
  .object({
    testName: nullableTrimmed(180),
    hospitalName: nullableTrimmed(180),
    documentDate: z.iso.date().nullable().optional(),
  })
  .strict();

export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;

export const extractionMeasurementSchema = z
  .object({
    name: z.string().trim().min(1).max(180),
    normalizedName: z.string().trim().min(1).max(180).nullable().default(null),
    textValue: z.string().trim().max(240).nullable().default(null),
    numericValue: z.number().finite().nullable().default(null),
    unit: z.string().trim().max(80).nullable().default(null),
    referenceRange: z.string().trim().max(160).nullable().default(null),
    sourceFlag: z.string().trim().max(40).nullable().default(null),
  })
  .strict()
  .superRefine((measurement, context) => {
    if (measurement.textValue === null && measurement.numericValue === null) {
      context.addIssue({
        code: "custom",
        message: "A text or numeric measurement value is required",
        path: ["textValue"],
      });
    }
  });

export const reportExtractionSchema = z
  .object({
    documentReportType: z.string().trim().min(1).max(120),
    testName: z.string().trim().min(1).max(180),
    normalizedTestName: z.string().trim().min(1).max(180).nullable().default(null),
    reportDate: z.iso.date().nullable().default(null),
    hospitalName: z.string().trim().max(180).nullable().default(null),
    category: reportCategorySchema,
    patientNameOnReport: z.string().trim().max(120).nullable().default(null),
    measurements: z.array(extractionMeasurementSchema).max(300),
  })
  .strict();

export const verificationMeasurementSchema = extractionMeasurementSchema.extend({
  id: z.uuid(),
});

export const verifyReportSchema = z
  .object({
    testName: z.string().trim().min(1).max(180),
    reportDate: z.iso.date(),
    hospitalName: z.string().trim().max(180).nullable(),
    category: reportCategorySchema,
    measurements: z.array(verificationMeasurementSchema).max(300),
  })
  .strict();

const optionalQueryText = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().max(180).optional(),
);

export const documentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: optionalQueryText,
  documentType: documentTypeSchema.optional(),
  status: processingStatusSchema.optional(),
  category: reportCategorySchema.optional(),
  hospital: optionalQueryText,
  test: optionalQueryText,
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
  sort: z.enum(["date_desc", "date_asc", "created_desc"]).default("date_desc"),
});

export type DocumentType = z.infer<typeof documentTypeSchema>;
export type ProcessingStatus = z.infer<typeof processingStatusSchema>;
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;
export type ReportCategory = z.infer<typeof reportCategorySchema>;
export type PatientProfileInput = z.infer<typeof patientProfileSchema>;
export type DocumentMetadataInput = z.infer<typeof documentMetadataSchema>;
export type ReportExtraction = z.infer<typeof reportExtractionSchema>;
export type VerifyReportInput = z.infer<typeof verifyReportSchema>;
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;

export const createEpisodeSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    startDate: z.iso.date().nullable().optional(),
    endDate: z.iso.date().nullable().optional(),
  })
  .strict()
  .refine(
    (v) => !v.startDate || !v.endDate || v.startDate <= v.endDate,
    "End date must not precede start date",
  );
export type CreateEpisodeInput = z.infer<typeof createEpisodeSchema>;

export const episodeDocumentIdsSchema = z
  .object({
    documentIds: z
      .array(z.uuid())
      .min(1)
      .max(30)
      .refine((ids) => new Set(ids).size === ids.length, "Duplicate report IDs"),
  })
  .strict();
export type EpisodeDocumentIdsInput = z.infer<typeof episodeDocumentIdsSchema>;

export interface PatientProfileDto extends PatientProfileInput {
  patientId: string;
  completed: boolean;
}

export interface DocumentDto {
  id: string;
  documentType: DocumentType;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  documentDate: string | null;
  hospitalName: string | null;
  testName: string | null;
  normalizedTestName: string | null;
  category: ReportCategory | null;
  processingStatus: ProcessingStatus;
  verificationStatus: VerificationStatus;
  failureCode: string | null;
}

export interface MeasurementDto {
  id: string;
  name: string;
  normalizedName: string;
  textValue: string | null;
  numericValue: number | null;
  unit: string | null;
  referenceRange: string | null;
  sourceFlag: string | null;
  patientCorrected: boolean;
}

export interface ReportDetailDto extends DocumentDto {
  patientNameOnReport: string | null;
  measurements: MeasurementDto[];
  fileUrl?: string;
}

export interface EpisodeDto {
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EpisodeDetailDto extends EpisodeDto {
  documents: DocumentDto[];
  analyses: EpisodeAnalysisDto[];
  summaryUnavailable?: boolean;
}

export const documentDtoSchema = z.object({
  id: z.uuid(),
  documentType: documentTypeSchema,
  originalFilename: z.string(),
  mimeType: z.string(),
  fileSize: z.number().int().nonnegative(),
  uploadedAt: z.iso.datetime(),
  documentDate: z.iso.date().nullable(),
  hospitalName: z.string().nullable(),
  testName: z.string().nullable(),
  normalizedTestName: z.string().nullable(),
  category: reportCategorySchema.nullable(),
  processingStatus: processingStatusSchema,
  verificationStatus: verificationStatusSchema,
  failureCode: z.string().nullable(),
});
export const measurementDtoSchema = z
  .object({
    id: z.uuid(),
    name: z.string().max(180),
    normalizedName: z.string().max(180),
    textValue: z.string().max(240).nullable(),
    numericValue: z.number().finite().nullable(),
    unit: z.string().max(80).nullable(),
    referenceRange: z.string().max(160).nullable(),
    sourceFlag: z.string().max(40).nullable(),
    patientCorrected: z.boolean(),
  })
  .strict();
export const reportDetailDtoSchema = documentDtoSchema
  .extend({
    patientNameOnReport: z.string().max(120).nullable(),
    measurements: z.array(measurementDtoSchema).max(300),
  })
  .strict();
export const reportDetailResponseSchema = z.object({ report: reportDetailDtoSchema }).strict();
export const signedFileResponseSchema = z
  .object({
    url: z
      .url()
      .refine((value) => value.startsWith("https://"), "Private file links require HTTPS"),
    expiresInSeconds: z.number().int().min(30).max(3600),
  })
  .strict();
export const documentResponseSchema = z.object({ document: documentDtoSchema }).strict();

export const episodeDtoSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(120),
  startDate: z.iso.date().nullable(),
  endDate: z.iso.date().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const episodeDetailDtoSchema = episodeDtoSchema.extend({
  documents: z.array(documentDtoSchema),
  analyses: z.array(episodeAnalysisSchema),
  summaryUnavailable: z.boolean().optional(),
});
export const episodeResponseSchema = z.object({ episode: episodeDetailDtoSchema });
export const episodeCreateResponseSchema = z.object({ episode: episodeDtoSchema });
export const episodeListResponseSchema = z.object({ episodes: z.array(episodeDtoSchema) });
export const episodeAddResponseSchema = z.object({
  episode: episodeDetailDtoSchema,
  added: z.array(z.uuid()),
  skipped: z.array(z.object({ id: z.uuid(), reason: z.string() })),
});
export const documentListResponseSchema = z.object({
  items: z.array(documentDtoSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export interface DashboardDto {
  recentDocuments: DocumentDto[];
  latestReports: DocumentDto[];
  latestMetrics: LatestMetricCardDto[];
  latestMetricsLimited: boolean;
  counts: { processing: number; needsReview: number; verified: number };
}
export const dashboardResponseSchema = z
  .object({
    recentDocuments: z.array(documentDtoSchema).max(6),
    latestReports: z.array(documentDtoSchema).max(12),
    latestMetrics: z.array(latestMetricCardSchema).max(12),
    latestMetricsLimited: z.boolean(),
    counts: z
      .object({
        processing: z.number().int().nonnegative(),
        needsReview: z.number().int().nonnegative(),
        verified: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export interface PaginatedDto<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiErrorDto {
  error: { code: string; message: string; requestId?: string; fieldErrors?: unknown };
}

// ── Episode trend / summary ───────────────────────────────────────────────────

export interface EpisodeAddResultDto {
  added: string[];
  skipped: { id: string; reason: string }[];
  episode: EpisodeDetailDto;
}

// ── Medication ────────────────────────────────────────────────────────────────

export const MEDICATION_STATUS = [
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "DISCONTINUED",
  "ARCHIVED",
] as const;
export type MedicationStatus = (typeof MEDICATION_STATUS)[number];

export const SCHEDULE_FREQUENCY = [
  "ONCE_DAILY",
  "TWICE_DAILY",
  "THREE_TIMES_DAILY",
  "FOUR_TIMES_DAILY",
  "EVERY_X_HOURS",
  "AS_NEEDED",
  "CUSTOM",
] as const;
export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCY)[number];

export const MEAL_TIMING = ["BEFORE_MEAL", "WITH_MEAL", "AFTER_MEAL", "NOT_SPECIFIED"] as const;
export type MealTiming = (typeof MEAL_TIMING)[number];

export const OCCURRENCE_STATUS = [
  "SCHEDULED",
  "DUE",
  "OVERDUE",
  "TAKEN",
  "SKIPPED",
  "CANCELLED",
] as const;
export type OccurrenceStatus = (typeof OCCURRENCE_STATUS)[number];

export const createMedicationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  resolvedGeneric: z.string().trim().max(200).optional().nullable(),
  strength: z.string().trim().max(80).optional().nullable(),
  doseAmount: z.string().trim().max(80).optional().nullable(),
  doseUnit: z.string().trim().max(40).optional().nullable(),
  formulation: z.string().trim().max(80).optional().nullable(),
  route: z.string().trim().max(80).optional().nullable(),
  startDate: z.iso.date().optional().nullable(),
  endDate: z.iso.date().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  prescriptionId: z.string().uuid().optional().nullable(),
});
export type CreateMedicationInput = z.infer<typeof createMedicationSchema>;

export const updateMedicationSchema = createMedicationSchema.extend({
  status: z.enum(MEDICATION_STATUS).optional(),
});
export type UpdateMedicationInput = z.infer<typeof updateMedicationSchema>;

export interface MedicationDto {
  id: string;
  name: string;
  resolvedGeneric: string | null;
  resolvedStatus: string;
  strength: string | null;
  doseAmount: string | null;
  doseUnit: string | null;
  formulation: string | null;
  route: string | null;
  startDate: string | null;
  endDate: string | null;
  status: MedicationStatus;
  notes: string | null;
  prescriptionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const createScheduleSchema = z.object({
  frequency: z.enum(SCHEDULE_FREQUENCY),
  administrationTimes: z.array(z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:mm")).min(1),
  mealTiming: z.enum(MEAL_TIMING).optional().default("NOT_SPECIFIED"),
  ianaTimezone: z.string().min(1).max(80),
  startDate: z.iso.date(),
  endDate: z.iso.date().optional().nullable(),
  stockCount: z.number().int().min(0).optional().nullable(),
  refillAlertAt: z.number().int().min(0).optional().nullable(),
});
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;

export interface MedicationScheduleDto {
  id: string;
  medicationId: string;
  version: number;
  frequency: ScheduleFrequency;
  administrationTimes: string[];
  mealTiming: MealTiming;
  ianaTimezone: string;
  startDate: string;
  endDate: string | null;
  stockCount: number | null;
  refillAlertAt: number | null;
  active: boolean;
  createdAt: string;
}

export const logIntakeSchema = z.object({
  action: z.enum(["TAKEN", "SKIPPED"]),
  loggedAt: z.iso.datetime(),
  notes: z.string().trim().max(500).optional().nullable(),
});
export type LogIntakeInput = z.infer<typeof logIntakeSchema>;

export interface OccurrenceDto {
  id: string;
  scheduleId: string;
  dueAt: string;
  localTimeStr: string;
  status: OccurrenceStatus;
}

// ── Queue constants ───────────────────────────────────────────────────────────

export const EPISODE_SUMMARY_QUEUE = "episode-summary";
export const REMINDER_QUEUE = "medication-reminders";
