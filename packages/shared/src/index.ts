import { z } from "zod";

export * from "./environment.js";

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
