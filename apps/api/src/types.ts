import type {
  DocumentDto,
  DocumentListQuery,
  DocumentMetadataInput,
  PaginatedDto,
  PatientProfileDto,
  PatientProfileInput,
  ReportDetailDto,
  VerifyReportInput,
} from "@medvault/shared";

export interface AuthenticatedUser {
  id: string;
}

export interface AuthVerifier {
  verify(accessToken: string): Promise<AuthenticatedUser | null>;
}

export interface UploadedDocumentFile {
  bytes: Buffer;
  originalFilename: string;
  detectedMimeType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
}

export interface AppService {
  getProfile(authUserId: string): Promise<PatientProfileDto | null>;
  updateProfile(authUserId: string, input: PatientProfileInput): Promise<PatientProfileDto>;
  createDocument(
    authUserId: string,
    file: UploadedDocumentFile,
    metadata: DocumentMetadataInput,
  ): Promise<DocumentDto>;
  listDocuments(authUserId: string, query: DocumentListQuery): Promise<PaginatedDto<DocumentDto>>;
  getDocument(authUserId: string, documentId: string): Promise<DocumentDto>;
  getFileUrl(authUserId: string, documentId: string): Promise<string>;
  listReports(authUserId: string, query: DocumentListQuery): Promise<PaginatedDto<DocumentDto>>;
  latestReports(authUserId: string): Promise<DocumentDto[]>;
  getReport(authUserId: string, documentId: string): Promise<ReportDetailDto>;
  verifyReport(
    authUserId: string,
    documentId: string,
    input: VerifyReportInput,
  ): Promise<ReportDetailDto>;
  retryReport(authUserId: string, documentId: string): Promise<DocumentDto>;
  getDashboard(authUserId: string): Promise<{
    recentDocuments: DocumentDto[];
    latestReports: DocumentDto[];
    counts: { processing: number; needsReview: number; verified: number };
  }>;
}
