import type {
  DocumentDto,
  DocumentListQuery,
  DocumentMetadataInput,
  PaginatedDto,
  PatientProfileDto,
  PatientProfileInput,
  ReportDetailDto,
  VerifyReportInput,
  EpisodeDto,
  EpisodeDetailDto,
  CreateEpisodeInput,
  EpisodeTrendDto,
  EpisodeAddResultDto,
  EpisodeAnalysisDto,
  RequestSummaryInput,
  AnalysisFilter,
  MedicationDto,
  MedicationScheduleDto,
  OccurrenceDto,
  CreateMedicationInput,
  UpdateMedicationInput,
  CreateScheduleInput,
  LogIntakeInput,
  MeasurementHistoryDto,
  LatestMetricCardDto,
  UpdateDocumentInput,
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
    correlationId?: string,
  ): Promise<DocumentDto>;
  listDocuments(authUserId: string, query: DocumentListQuery): Promise<PaginatedDto<DocumentDto>>;
  getDocument(authUserId: string, documentId: string): Promise<DocumentDto>;
  updateDocument(
    authUserId: string,
    documentId: string,
    input: UpdateDocumentInput,
  ): Promise<DocumentDto>;
  getFileUrl(authUserId: string, documentId: string): Promise<string>;
  deleteDocument(authUserId: string, documentId: string): Promise<void>;
  listReports(authUserId: string, query: DocumentListQuery): Promise<PaginatedDto<DocumentDto>>;
  latestReports(authUserId: string): Promise<DocumentDto[]>;
  getReport(authUserId: string, documentId: string): Promise<ReportDetailDto>;
  verifyReport(
    authUserId: string,
    documentId: string,
    input: VerifyReportInput,
  ): Promise<ReportDetailDto>;
  retryReport(authUserId: string, documentId: string, correlationId?: string): Promise<DocumentDto>;
  cancelReport(authUserId: string, documentId: string): Promise<DocumentDto>;
  getMeasurementHistory(
    authUserId: string,
    filter?: AnalysisFilter,
  ): Promise<MeasurementHistoryDto>;
  getDashboard(authUserId: string): Promise<{
    recentDocuments: DocumentDto[];
    latestReports: DocumentDto[];
    latestMetrics: LatestMetricCardDto[];
    latestMetricsLimited: boolean;
    counts: { processing: number; needsReview: number; verified: number };
  }>;

  // Episodes
  createEpisode(authUserId: string, input: CreateEpisodeInput): Promise<EpisodeDto>;
  listEpisodes(authUserId: string): Promise<EpisodeDto[]>;
  getEpisode(authUserId: string, episodeId: string): Promise<EpisodeDetailDto>;
  updateEpisode(
    authUserId: string,
    episodeId: string,
    input: CreateEpisodeInput,
  ): Promise<EpisodeDetailDto>;
  addDocumentsToEpisode(
    authUserId: string,
    episodeId: string,
    documentIds: string[],
  ): Promise<EpisodeAddResultDto>;
  removeDocumentFromEpisode(
    authUserId: string,
    episodeId: string,
    documentId: string,
  ): Promise<EpisodeDetailDto>;
  deleteEpisode(authUserId: string, episodeId: string): Promise<void>;
  getEpisodeTrend(
    authUserId: string,
    episodeId: string,
    filter?: AnalysisFilter,
  ): Promise<EpisodeTrendDto>;
  requestReportSummary(
    authUserId: string,
    documentId: string,
    input: RequestSummaryInput,
  ): Promise<EpisodeAnalysisDto>;
  getReportSummary(authUserId: string, documentId: string): Promise<EpisodeAnalysisDto | null>;
  requestEpisodeSummary(
    authUserId: string,
    episodeId: string,
    input: RequestSummaryInput,
  ): Promise<EpisodeAnalysisDto>;
  getEpisodeAnalysis(
    authUserId: string,
    episodeId: string,
    analysisId: string,
  ): Promise<EpisodeAnalysisDto>;

  // Medications
  createMedication(authUserId: string, input: CreateMedicationInput): Promise<MedicationDto>;
  listMedications(authUserId: string): Promise<MedicationDto[]>;
  getMedication(authUserId: string, medicationId: string): Promise<MedicationDto>;
  updateMedication(
    authUserId: string,
    medicationId: string,
    input: UpdateMedicationInput,
  ): Promise<MedicationDto>;
  archiveMedication(authUserId: string, medicationId: string): Promise<void>;

  // Schedules
  createSchedule(
    authUserId: string,
    medicationId: string,
    input: CreateScheduleInput,
  ): Promise<MedicationScheduleDto>;
  listSchedules(authUserId: string, medicationId: string): Promise<MedicationScheduleDto[]>;
  deactivateSchedule(
    authUserId: string,
    medicationId: string,
    scheduleId: string,
  ): Promise<MedicationScheduleDto>;
  logIntake(
    authUserId: string,
    occurrenceId: string,
    input: LogIntakeInput,
  ): Promise<OccurrenceDto>;
  listOccurrences(
    authUserId: string,
    medicationId: string,
    from: Date,
    to: Date,
  ): Promise<OccurrenceDto[]>;

  checkHealth(): Promise<void>;
}
