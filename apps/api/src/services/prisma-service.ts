import { createHash, randomUUID } from "node:crypto";
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
  EpisodeAddResultDto,
  EpisodeAnalysisDto,
  EpisodeTrendDto,
  AnalysisFilter,
  CreateEpisodeInput,
  RequestSummaryInput,
  MedicationDto,
  MedicationScheduleDto,
  OccurrenceDto,
  CreateMedicationInput,
  UpdateMedicationInput,
  CreateScheduleInput,
  LogIntakeInput,
  MeasurementHistoryDto,
} from "@medvault/shared";
import {
  normalizeTestName,
  buildMeasurementSeries,
  sourceExclusion,
  buildLatestMetricCards,
  cannotAssessAttention,
  explainNormalizedMetric,
  selectLatestVerifiedReports,
} from "@medvault/medical";
import {
  DEFAULT_GEMINI_MODEL,
  MEASUREMENT_HISTORY_MAX_REPORTS,
  createScheduleSchema,
  measurementHistorySchema,
} from "@medvault/shared";
import {
  SummaryStore,
  SummaryError,
  lockSummaryPatient,
  reviewedSources,
  sourceInclude,
  type SummaryScope,
  type Episode,
} from "@medvault/database";
import type {
  Prisma,
  PrismaClient,
  Medication,
  MedicationSchedule,
  ScheduleOccurrence,
} from "@medvault/database";

import { AppError, notFound } from "../errors.js";
import type { AppService, UploadedDocumentFile } from "../types.js";
import type { ReportQueue } from "./queue.js";
import type { PrivateStorage } from "./storage.js";
import {
  DocumentDeletionCoordinator,
  PrismaDocumentDeletionRepository,
} from "./document-deletion.js";

export class PrismaAppService implements AppService {
  private readonly summaryStore: SummaryStore;
  private readonly deletion: DocumentDeletionCoordinator;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: PrivateStorage,
    private readonly reportQueue: ReportQueue,
    private readonly signedUrlTtlSeconds: number,
    geminiModel = DEFAULT_GEMINI_MODEL,
  ) {
    this.summaryStore = new SummaryStore(prisma, geminiModel);
    this.deletion = new DocumentDeletionCoordinator(
      new PrismaDocumentDeletionRepository(prisma),
      storage,
      reportQueue,
    );
  }

  private async patientId(authUserId: string): Promise<string> {
    const patient = await this.prisma.patient.upsert({
      where: { authUserId },
      create: { authUserId },
      update: {},
      select: { id: true },
    });
    return patient.id;
  }

  async getProfile(authUserId: string): Promise<PatientProfileDto | null> {
    const patient = await this.prisma.patient.findUnique({
      where: { authUserId },
      select: { id: true, profile: true },
    });
    if (!patient?.profile) return null;
    return profileDto(patient.id, patient.profile);
  }

  async updateProfile(authUserId: string, input: PatientProfileInput): Promise<PatientProfileDto> {
    const patientId = await this.patientId(authUserId);
    const profile = await this.prisma.patientProfile.upsert({
      where: { patientId },
      create: { patientId, ...profileData(input) },
      update: profileData(input),
    });
    return profileDto(patientId, profile);
  }

  async createDocument(
    authUserId: string,
    file: UploadedDocumentFile,
    metadata: DocumentMetadataInput,
    correlationId?: string,
  ): Promise<DocumentDto> {
    const patientId = await this.patientId(authUserId);
    const id = randomUUID();
    const filename = sanitizeFilename(file.originalFilename);
    const storagePath = `${authUserId}/${id}/${filename}`;
    const checksumSha256 = createHash("sha256").update(file.bytes).digest("hex");
    await this.storage.upload(storagePath, file.bytes, file.detectedMimeType);

    let document;
    try {
      document = await this.prisma.medicalDocument.create({
        data: {
          id,
          patientId,
          documentType: metadata.documentType,
          originalFilename: file.originalFilename.slice(0, 255),
          mimeType: file.detectedMimeType,
          fileSize: file.bytes.byteLength,
          storagePath,
          checksumSha256,
          documentDate: metadata.documentDate ? parseDate(metadata.documentDate) : null,
          hospitalName: metadata.hospitalName ?? null,
          testName: metadata.testName ?? null,
          normalizedTestName: metadata.testName ? normalizeTestName(metadata.testName) : null,
          category: metadata.category ?? null,
          processingStatus: metadata.documentType === "REPORT" ? "QUEUED" : "NOT_APPLICABLE",
          verificationStatus: metadata.documentType === "REPORT" ? "PENDING" : "NOT_APPLICABLE",
        },
      });
    } catch (error) {
      await this.storage.remove(storagePath).catch(() => undefined);
      throw error;
    }

    if (metadata.documentType === "REPORT") {
      try {
        await this.reportQueue.enqueue("REPORT", {
          documentId: document.id,
          documentVersion: 1,
          correlationId,
        });
      } catch {
        document = await this.prisma.medicalDocument.update({
          where: { id: document.id },
          data: { processingStatus: "FAILED", failureCode: "QUEUE_UNAVAILABLE" },
        });
      }
    }
    return documentDto(document);
  }

  async listDocuments(
    authUserId: string,
    query: DocumentListQuery,
  ): Promise<PaginatedDto<DocumentDto>> {
    const patientId = await this.patientId(authUserId);
    return this.list(patientId, query, false);
  }

  async getDocument(authUserId: string, documentId: string): Promise<DocumentDto> {
    const patientId = await this.patientId(authUserId);
    const document = await this.prisma.medicalDocument.findFirst({
      where: { id: documentId, patientId },
    });
    if (!document) throw notFound();
    return documentDto(document);
  }

  async getFileUrl(authUserId: string, documentId: string): Promise<string> {
    const patientId = await this.patientId(authUserId);
    const document = await this.prisma.medicalDocument.findFirst({
      where: { id: documentId, patientId },
      select: { storagePath: true },
    });
    if (!document) throw notFound();
    return this.storage.createSignedUrl(document.storagePath, this.signedUrlTtlSeconds);
  }

  deleteDocument(authUserId: string, documentId: string): Promise<void> {
    return this.deletion.delete(authUserId, documentId);
  }

  async listReports(
    authUserId: string,
    query: DocumentListQuery,
  ): Promise<PaginatedDto<DocumentDto>> {
    const patientId = await this.patientId(authUserId);
    return this.list(patientId, { ...query, documentType: "REPORT" }, true);
  }

  async latestReports(authUserId: string): Promise<DocumentDto[]> {
    const patientId = await this.patientId(authUserId);
    const candidates = await this.prisma.medicalDocument.findMany({
      where: {
        patientId,
        documentType: "REPORT",
        verificationStatus: "VERIFIED",
        normalizedTestName: { not: null },
        documentDate: { not: null },
      },
      orderBy: [
        { documentDate: "desc" },
        { createdAt: "desc" },
        { normalizedTestName: "asc" },
        { id: "asc" },
      ],
    });
    return selectLatestVerifiedReports(
      candidates.map((report) => ({
        ...report,
        reportDate: report.documentDate,
        verified: true,
      })),
    )
      .slice(0, 12)
      .map(documentDto);
  }

  async getReport(authUserId: string, documentId: string): Promise<ReportDetailDto> {
    const patientId = await this.patientId(authUserId);
    const report = await this.prisma.medicalDocument.findFirst({
      where: { id: documentId, patientId, documentType: "REPORT" },
      include: { extraction: { include: { measurements: { orderBy: { sortOrder: "asc" } } } } },
    });
    if (!report) throw notFound();
    return reportDetailDto(report);
  }

  async verifyReport(
    authUserId: string,
    documentId: string,
    input: VerifyReportInput,
  ): Promise<ReportDetailDto> {
    const patientId = await this.patientId(authUserId);
    await this.prisma.$transaction(async (transaction) => {
      await lockSummaryPatient(transaction, patientId);
      const report = await transaction.medicalDocument.findFirst({
        where: {
          id: documentId,
          patientId,
          documentType: "REPORT",
          processingStatus: { in: ["NEEDS_REVIEW", "VERIFIED"] },
          verificationStatus: { in: ["PENDING", "VERIFIED"] },
        },
        include: { extraction: { include: { measurements: true } } },
      });
      if (!report?.extraction) throw notFound();
      if (
        report.documentVersion !== report.extraction.documentVersion ||
        (report.processingStatus === "VERIFIED"
          ? report.verificationStatus !== "VERIFIED" || report.extraction.status !== "VERIFIED"
          : report.verificationStatus !== "PENDING" || report.extraction.status !== "DRAFT")
      ) {
        throw new AppError(
          409,
          "SOURCE_VERSION_MISMATCH",
          "The report changed. Refresh and try again.",
        );
      }
      const storedIds = new Set(report.extraction.measurements.map(({ id }) => id));
      const inputIds = new Set(input.measurements.map(({ id }) => id));
      if (!input.reportDate) {
        throw new AppError(400, "INVALID_INPUT", "Report date is required.");
      }
      if (
        storedIds.size !== input.measurements.length ||
        inputIds.size !== input.measurements.length ||
        input.measurements.some(({ id }) => !storedIds.has(id))
      ) {
        throw new AppError(
          400,
          "MEASUREMENT_MISMATCH",
          "The report changed. Refresh and try again.",
        );
      }

      await transaction.medicalDocument.update({
        where: { id: report.id },
        data: {
          testName: input.testName,
          normalizedTestName: normalizeTestName(input.testName),
          documentDate: parseDate(input.reportDate),
          hospitalName: input.hospitalName,
          category: input.category,
          processingStatus: "VERIFIED",
          verificationStatus: "VERIFIED",
          failureCode: null,
        },
      });
      await transaction.reportExtraction.update({
        where: { id: report.extraction.id },
        data: { status: "VERIFIED", verifiedAt: new Date() },
      });
      const byId = new Map(
        report.extraction.measurements.map((measurement) => [measurement.id, measurement]),
      );
      await Promise.all(
        input.measurements.map((measurement) => {
          const original = byId.get(measurement.id);
          if (!original) throw new AppError(400, "MEASUREMENT_MISMATCH", "The report changed.");
          return transaction.reportMeasurement.update({
            where: { id: measurement.id },
            data: {
              verifiedName: measurement.name,
              verifiedNormalizedName: normalizeTestName(measurement.name),
              verifiedTextValue: measurement.textValue,
              verifiedNumericValue: measurement.numericValue,
              verifiedUnit: measurement.unit,
              verifiedReferenceRange: measurement.referenceRange,
              verifiedSourceFlag: measurement.sourceFlag,
              patientCorrected: measurementChanged(original, measurement),
            },
          });
        }),
      );
    });
    return this.getReport(authUserId, documentId);
  }

  async retryReport(
    authUserId: string,
    documentId: string,
    correlationId?: string,
  ): Promise<DocumentDto> {
    const patientId = await this.patientId(authUserId);
    const report = await this.prisma.medicalDocument.findFirst({
      where: {
        id: documentId,
        patientId,
        documentType: "REPORT",
        processingStatus: { in: ["FAILED", "QUEUED"] },
      },
    });
    if (!report) throw notFound();

    const updateResult = await this.prisma.medicalDocument.updateMany({
      where: { id: report.id, processingStatus: report.processingStatus },
      data: { processingStatus: "QUEUED", failureCode: null },
    });
    if (updateResult.count === 0) {
      throw new AppError(
        409,
        "RACE_CONDITION",
        "The report status changed. Refresh and try again.",
      );
    }

    try {
      await this.reportQueue.ensureQueued({
        documentId: report.id,
        documentVersion: report.documentVersion,
        correlationId,
      });
    } catch (error) {
      await this.prisma.medicalDocument.update({
        where: { id: report.id },
        data: { processingStatus: "FAILED", failureCode: "QUEUE_UNAVAILABLE" },
      });
      throw error;
    }

    const finalReport = await this.prisma.medicalDocument.findUnique({
      where: { id: report.id },
    });
    return documentDto(finalReport!);
  }

  async cancelReport(authUserId: string, documentId: string): Promise<DocumentDto> {
    const patientId = await this.patientId(authUserId);
    const report = await this.prisma.medicalDocument.findFirst({
      where: {
        id: documentId,
        patientId,
        documentType: "REPORT",
        processingStatus: { in: ["UPLOADED", "QUEUED", "PROCESSING"] },
      },
    });
    if (!report) throw notFound();

    await this.reportQueue
      .removeForDeletion({
        documentId: report.id,
        documentVersion: report.documentVersion,
      })
      .catch(() => undefined);

    const updated = await this.prisma.medicalDocument.update({
      where: { id: report.id },
      data: { processingStatus: "FAILED", failureCode: "CANCELLED_BY_USER" },
    });
    return documentDto(updated);
  }

  async getMeasurementHistory(
    authUserId: string,
    filter: AnalysisFilter = {},
  ): Promise<MeasurementHistoryDto> {
    const patientId = await this.patientId(authUserId);
    return this.measurementHistoryForPatient(patientId, filter);
  }

  private async measurementHistoryForPatient(
    patientId: string,
    filter: AnalysisFilter,
  ): Promise<MeasurementHistoryDto> {
    const dateFilter =
      filter.dateFrom || filter.dateTo
        ? {
            documentDate: {
              ...(filter.dateFrom ? { gte: parseDate(filter.dateFrom) } : {}),
              ...(filter.dateTo ? { lte: parseDate(filter.dateTo) } : {}),
            },
          }
        : {};
    const metricFilter = filter.metric
      ? {
          extraction: {
            is: {
              measurements: {
                some: { verifiedNormalizedName: normalizeTestName(filter.metric) },
              },
            },
          },
        }
      : {};
    const documents = await this.prisma.medicalDocument.findMany({
      where: {
        patientId,
        documentType: "REPORT",
        processingStatus: "VERIFIED",
        verificationStatus: "VERIFIED",
        ...dateFilter,
        ...metricFilter,
      },
      include: sourceInclude,
      orderBy: [
        { documentDate: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
        { id: "asc" },
      ],
      take: MEASUREMENT_HISTORY_MAX_REPORTS + 1,
    });
    const limited = documents.length > MEASUREMENT_HISTORY_MAX_REPORTS;
    const selected = documents.slice(0, MEASUREMENT_HISTORY_MAX_REPORTS);
    const history = buildMeasurementSeries(reviewedSources(selected), patientId, filter);
    const explanations = [...new Set(history.series.map((item) => item.normalizedTestName))]
      .sort((left, right) => left.localeCompare(right, "en"))
      .map(explainNormalizedMetric);
    return measurementHistorySchema.parse({
      ...history,
      explanations,
      latestMetrics: buildLatestMetricCards(history.series),
      sourceReportCount: selected.length,
      limited,
      attention: cannotAssessAttention(),
    });
  }

  async getDashboard(authUserId: string) {
    const patientId = await this.patientId(authUserId);
    const [recent, processing, needsReview, verified, latestReports, measurementHistory] =
      await Promise.all([
        this.prisma.medicalDocument.findMany({
          where: { patientId },
          orderBy: { createdAt: "desc" },
          take: 6,
        }),
        this.prisma.medicalDocument.count({
          where: { patientId, processingStatus: { in: ["UPLOADED", "QUEUED", "PROCESSING"] } },
        }),
        this.prisma.medicalDocument.count({
          where: { patientId, processingStatus: "NEEDS_REVIEW" },
        }),
        this.prisma.medicalDocument.count({
          where: { patientId, verificationStatus: "VERIFIED" },
        }),
        this.latestReports(authUserId),
        this.measurementHistoryForPatient(patientId, {}),
      ]);
    return {
      recentDocuments: recent.map(documentDto),
      latestReports,
      latestMetrics: measurementHistory.latestMetrics,
      latestMetricsLimited: measurementHistory.limited,
      counts: { processing, needsReview, verified },
    };
  }

  async checkHealth(): Promise<void> {
    try {
      await Promise.all([
        this.prisma.$queryRaw`SELECT 1`,
        this.reportQueue.checkHealth(),
        this.storage.checkHealth(),
      ]);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        503,
        "DEPENDENCY_UNAVAILABLE",
        "A required service is temporarily unavailable.",
      );
    }
  }

  async createEpisode(authUserId: string, input: CreateEpisodeInput): Promise<EpisodeDto> {
    const patientId = await this.patientId(authUserId);
    return episodeDto(
      await this.prisma.episode.create({
        data: {
          patientId,
          title: input.title,
          startDate: input.startDate ? parseDate(input.startDate) : null,
          endDate: input.endDate ? parseDate(input.endDate) : null,
        },
      }),
    );
  }
  async listEpisodes(authUserId: string): Promise<EpisodeDto[]> {
    const patientId = await this.patientId(authUserId);
    return (
      await this.prisma.episode.findMany({
        where: { patientId },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 200,
      })
    ).map(episodeDto);
  }
  async getEpisode(authUserId: string, episodeId: string): Promise<EpisodeDetailDto> {
    const patientId = await this.patientId(authUserId);
    const episode = await this.prisma.episode.findFirst({
      where: { id: episodeId, patientId },
      include: { memberships: { include: { document: true }, orderBy: { documentId: "asc" } } },
    });
    if (!episode) throw notFound();
    let analysis: EpisodeAnalysisDto | null = null;
    let summaryUnavailable = false;
    try {
      analysis = await this.summaryStore.get(patientId, "EPISODE", episodeId);
    } catch (error) {
      if (error instanceof SummaryError && error.code === "SUMMARY_SCHEMA_PENDING")
        summaryUnavailable = true;
      else throw error;
    }
    return {
      ...episodeDto(episode),
      documents: episode.memberships
        .filter((m) => m.document.patientId === patientId)
        .map((m) => documentDto(m.document)),
      analyses: analysis ? [analysis] : [],
      summaryUnavailable,
    };
  }
  async deleteEpisode(authUserId: string, episodeId: string): Promise<void> {
    const patientId = await this.patientId(authUserId);
    const deleted = await this.prisma.episode.deleteMany({ where: { id: episodeId, patientId } });
    if (!deleted.count) throw notFound();
  }
  async updateEpisode(
    authUserId: string,
    episodeId: string,
    input: CreateEpisodeInput,
  ): Promise<EpisodeDetailDto> {
    const patientId = await this.patientId(authUserId);
    const updated = await this.prisma.episode.updateMany({
      where: { id: episodeId, patientId },
      data: {
        title: input.title,
        startDate: input.startDate ? parseDate(input.startDate) : null,
        endDate: input.endDate ? parseDate(input.endDate) : null,
      },
    });
    if (!updated.count) throw notFound();
    return this.getEpisode(authUserId, episodeId);
  }
  async addDocumentsToEpisode(
    authUserId: string,
    episodeId: string,
    documentIds: string[],
  ): Promise<EpisodeAddResultDto> {
    const patientId = await this.patientId(authUserId);
    const result = await this.prisma.$transaction(async (tx) => {
      await lockSummaryPatient(tx, patientId);
      const episode = await tx.episode.findFirst({
        where: { id: episodeId, patientId },
        include: { memberships: true },
      });
      if (!episode) throw notFound();
      const docs = await tx.medicalDocument.findMany({
        where: { id: { in: documentIds }, patientId },
        include: sourceInclude,
      });
      if (docs.length !== documentIds.length) throw notFound();
      const added: string[] = [],
        skipped: { id: string; reason: string }[] = [];
      for (const doc of reviewedSources(docs)) {
        const reason = sourceExclusion(doc, patientId);
        if (reason) skipped.push({ id: doc.id, reason });
        else if (episode.memberships.some((m) => m.documentId === doc.id))
          skipped.push({ id: doc.id, reason: "ALREADY_MEMBER" });
        else added.push(doc.id);
      }
      if (episode.memberships.length + added.length > 30)
        throw new AppError(422, "EPISODE_REPORT_LIMIT", "An episode supports up to 30 reports.");
      if (added.length)
        await tx.episodeMembership.createMany({
          data: added.map((documentId) => ({ episodeId, documentId })),
        });
      return { added, skipped };
    });
    return { ...result, episode: await this.getEpisode(authUserId, episodeId) };
  }
  async removeDocumentFromEpisode(
    authUserId: string,
    episodeId: string,
    documentId: string,
  ): Promise<EpisodeDetailDto> {
    const patientId = await this.patientId(authUserId);
    const episode = await this.prisma.episode.findFirst({ where: { id: episodeId, patientId } });
    if (!episode) throw notFound();
    await this.prisma.episodeMembership.deleteMany({ where: { episodeId, documentId } });
    return this.getEpisode(authUserId, episodeId);
  }
  async getEpisodeTrend(
    authUserId: string,
    episodeId: string,
    filter: AnalysisFilter = {},
  ): Promise<EpisodeTrendDto> {
    const patientId = await this.patientId(authUserId);
    const episode = await this.prisma.episode.findFirst({
      where: { id: episodeId, patientId },
      include: { memberships: { include: { document: { include: sourceInclude } } } },
    });
    if (!episode) throw notFound();
    return {
      episodeId,
      ...buildMeasurementSeries(
        reviewedSources(episode.memberships.map((m) => m.document)),
        patientId,
        filter,
      ),
    };
  }
  private async requestSummary(
    authUserId: string,
    scope: SummaryScope,
    id: string,
    input: RequestSummaryInput,
  ): Promise<EpisodeAnalysisDto> {
    const patientId = await this.patientId(authUserId);
    const requested = await summaryErrors(() =>
      this.summaryStore.request(patientId, scope, id, input.forceRegenerate),
    );
    if (requested.job) {
      try {
        await this.reportQueue.enqueueSummary(requested.job);
      } catch {
        await this.summaryStore.enqueueFailed(requested.job);
        throw new AppError(
          503,
          "QUEUE_UNAVAILABLE",
          "Summary processing is unavailable. Your reports are unchanged; retry later.",
        );
      }
    }
    return requested.analysis;
  }
  requestEpisodeSummary(
    authUserId: string,
    episodeId: string,
    input: RequestSummaryInput,
  ): Promise<EpisodeAnalysisDto> {
    return this.requestSummary(authUserId, "EPISODE", episodeId, input);
  }
  requestReportSummary(
    authUserId: string,
    documentId: string,
    input: RequestSummaryInput,
  ): Promise<EpisodeAnalysisDto> {
    return this.requestSummary(authUserId, "REPORT", documentId, input);
  }
  async getReportSummary(
    authUserId: string,
    documentId: string,
  ): Promise<EpisodeAnalysisDto | null> {
    const patientId = await this.patientId(authUserId);
    return summaryErrors(() => this.summaryStore.get(patientId, "REPORT", documentId));
  }
  async getEpisodeAnalysis(
    authUserId: string,
    episodeId: string,
    analysisId: string,
  ): Promise<EpisodeAnalysisDto> {
    const patientId = await this.patientId(authUserId);
    const analysis = await summaryErrors(() =>
      this.summaryStore.get(patientId, "EPISODE", episodeId),
    );
    if (!analysis || analysis.id !== analysisId) throw notFound();
    return analysis;
  }

  // ── Medication CRUD ────────────────────────────────────────────────────────

  private async validatePrescriptionLink(
    patientId: string,
    prescriptionId: string | null | undefined,
  ): Promise<void> {
    if (!prescriptionId) return;
    const prescription = await this.prisma.medicalDocument.findFirst({
      where: { id: prescriptionId, patientId, documentType: "PRESCRIPTION" },
      select: { id: true },
    });
    if (!prescription) throw new AppError(400, "INVALID_PRESCRIPTION", "Prescription not found.");
  }

  async createMedication(authUserId: string, input: CreateMedicationInput): Promise<MedicationDto> {
    const patientId = await this.patientId(authUserId);
    await this.validatePrescriptionLink(patientId, input.prescriptionId);
    const med = await this.prisma.medication.create({
      data: {
        patientId,
        name: input.name,
        resolvedGeneric: input.resolvedGeneric ?? null,
        strength: input.strength ?? null,
        doseAmount: input.doseAmount ?? null,
        doseUnit: input.doseUnit ?? null,
        formulation: input.formulation ?? null,
        route: input.route ?? null,
        startDate: input.startDate ? parseDate(input.startDate) : null,
        endDate: input.endDate ? parseDate(input.endDate) : null,
        notes: input.notes ?? null,
        prescriptionId: input.prescriptionId ?? null,
      },
    });
    return medicationDto(med);
  }

  async listMedications(authUserId: string): Promise<MedicationDto[]> {
    const patientId = await this.patientId(authUserId);
    const meds = await this.prisma.medication.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
    });
    return meds.map(medicationDto);
  }

  async getMedication(authUserId: string, medicationId: string): Promise<MedicationDto> {
    const patientId = await this.patientId(authUserId);
    const med = await this.prisma.medication.findFirst({ where: { id: medicationId, patientId } });
    if (!med) throw notFound();
    return medicationDto(med);
  }

  async updateMedication(
    authUserId: string,
    medicationId: string,
    input: UpdateMedicationInput,
  ): Promise<MedicationDto> {
    const patientId = await this.patientId(authUserId);
    const existing = await this.prisma.medication.findFirst({
      where: { id: medicationId, patientId },
    });
    if (!existing) throw notFound();
    await this.validatePrescriptionLink(patientId, input.prescriptionId);
    const med = await this.prisma.medication.update({
      where: { id: medicationId },
      data: {
        name: input.name,
        resolvedGeneric: input.resolvedGeneric ?? null,
        strength: input.strength ?? null,
        doseAmount: input.doseAmount ?? null,
        doseUnit: input.doseUnit ?? null,
        formulation: input.formulation ?? null,
        route: input.route ?? null,
        startDate: input.startDate ? parseDate(input.startDate) : null,
        endDate: input.endDate ? parseDate(input.endDate) : null,
        notes: input.notes ?? null,
        prescriptionId: input.prescriptionId ?? null,
        status: input.status ?? existing.status,
      },
    });
    return medicationDto(med);
  }

  async archiveMedication(authUserId: string, medicationId: string): Promise<void> {
    const patientId = await this.patientId(authUserId);
    const updated = await this.prisma.medication.updateMany({
      where: { id: medicationId, patientId },
      data: { status: "ARCHIVED" },
    });
    if (updated.count === 0) throw notFound();
  }

  // ── Schedule CRUD ──────────────────────────────────────────────────────────

  async createSchedule(
    authUserId: string,
    medicationId: string,
    input: CreateScheduleInput,
  ): Promise<MedicationScheduleDto> {
    const patientId = await this.patientId(authUserId);
    const med = await this.prisma.medication.findFirst({ where: { id: medicationId, patientId } });
    if (!med) throw notFound();
    const schedule = await this.prisma.medicationSchedule.create({
      data: {
        medicationId,
        patientId,
        frequency: input.frequency,
        administrationTimes: input.administrationTimes,
        mealTiming: input.mealTiming ?? "NOT_SPECIFIED",
        ianaTimezone: input.ianaTimezone,
        startDate: parseDate(input.startDate),
        endDate: input.endDate ? parseDate(input.endDate) : null,
        stockCount: input.stockCount ?? null,
        refillAlertAt: input.refillAlertAt ?? null,
      },
    });
    return scheduleDto(schedule);
  }

  async listSchedules(authUserId: string, medicationId: string): Promise<MedicationScheduleDto[]> {
    const patientId = await this.patientId(authUserId);
    const med = await this.prisma.medication.findFirst({ where: { id: medicationId, patientId } });
    if (!med) throw notFound();
    const schedules = await this.prisma.medicationSchedule.findMany({
      where: { medicationId },
      orderBy: { createdAt: "desc" },
    });
    return schedules.map(scheduleDto);
  }

  async deactivateSchedule(
    authUserId: string,
    medicationId: string,
    scheduleId: string,
  ): Promise<MedicationScheduleDto> {
    const patientId = await this.patientId(authUserId);
    const med = await this.prisma.medication.findFirst({ where: { id: medicationId, patientId } });
    if (!med) throw notFound();
    const updated = await this.prisma.medicationSchedule.updateMany({
      where: { id: scheduleId, medicationId },
      data: { active: false, version: { increment: 1 } },
    });
    if (updated.count === 0) throw notFound();
    const schedule = await this.prisma.medicationSchedule.findUniqueOrThrow({
      where: { id: scheduleId },
    });
    return scheduleDto(schedule);
  }

  async logIntake(
    authUserId: string,
    occurrenceId: string,
    input: LogIntakeInput,
  ): Promise<OccurrenceDto> {
    const patientId = await this.patientId(authUserId);
    const occurrence = await this.prisma.scheduleOccurrence.findFirst({
      where: { id: occurrenceId, patientId },
    });
    if (!occurrence) throw notFound();
    await this.prisma.$transaction(async (tx) => {
      await tx.intakeLog.create({
        data: {
          occurrenceId,
          patientId,
          action: input.action,
          loggedAt: new Date(input.loggedAt),
          notes: input.notes ?? null,
        },
      });
      await tx.scheduleOccurrence.update({
        where: { id: occurrenceId },
        data: { status: input.action === "TAKEN" ? "TAKEN" : "SKIPPED" },
      });
    });
    const updated = await this.prisma.scheduleOccurrence.findUniqueOrThrow({
      where: { id: occurrenceId },
    });
    return occurrenceDto(updated);
  }

  async listOccurrences(
    authUserId: string,
    medicationId: string,
    from: Date,
    to: Date,
  ): Promise<OccurrenceDto[]> {
    const patientId = await this.patientId(authUserId);
    const med = await this.prisma.medication.findFirst({ where: { id: medicationId, patientId } });
    if (!med) throw notFound();
    const occurrences = await this.prisma.scheduleOccurrence.findMany({
      where: {
        patientId,
        schedule: { medicationId },
        dueAt: { gte: from, lte: to },
      },
      orderBy: { dueAt: "asc" },
    });
    return occurrences.map(occurrenceDto);
  }

  private async list(patientId: string, query: DocumentListQuery, reportsOnly: boolean) {
    const where: Prisma.MedicalDocumentWhereInput = {
      patientId,
      ...(reportsOnly
        ? { documentType: "REPORT" }
        : query.documentType
          ? { documentType: query.documentType }
          : {}),
      ...(query.status ? { processingStatus: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.hospital
        ? { hospitalName: { contains: query.hospital, mode: "insensitive" } }
        : {}),
      ...(query.test ? { testName: { contains: query.test, mode: "insensitive" } } : {}),
      ...(query.search
        ? {
            OR: [
              { originalFilename: { contains: query.search, mode: "insensitive" } },
              { testName: { contains: query.search, mode: "insensitive" } },
              { hospitalName: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            documentDate: {
              ...(query.dateFrom ? { gte: parseDate(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: parseDate(query.dateTo) } : {}),
            },
          }
        : {}),
    };
    const orderBy: Prisma.MedicalDocumentOrderByWithRelationInput[] =
      query.sort === "created_desc"
        ? [{ createdAt: "desc" }]
        : [
            ...(reportsOnly ? ([{ verificationStatus: "desc" }] as const) : []),
            { documentDate: query.sort === "date_asc" ? "asc" : "desc" },
            { createdAt: "desc" },
          ];
    const [items, total] = await this.prisma.$transaction([
      this.prisma.medicalDocument.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.medicalDocument.count({ where }),
    ]);
    return {
      items: items.map(documentDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }
}

type DocumentRecord = Awaited<ReturnType<PrismaClient["medicalDocument"]["create"]>>;
type ProfileRecord = Awaited<ReturnType<PrismaClient["patientProfile"]["upsert"]>>;
type ReportWithExtraction = Prisma.MedicalDocumentGetPayload<{
  include: { extraction: { include: { measurements: true } } };
}>;

function profileData(input: PatientProfileInput) {
  return {
    fullName: input.fullName,
    dateOfBirth: input.dateOfBirth ? parseDate(input.dateOfBirth) : null,
    gender: input.gender ?? null,
    bloodGroup: input.bloodGroup ?? null,
    allergies: input.allergies,
    chronicConditions: input.chronicConditions,
    emergencyContactName: input.emergencyContactName ?? null,
    emergencyContactPhone: input.emergencyContactPhone ?? null,
    emergencyContactRelation: input.emergencyContactRelation ?? null,
  };
}

function profileDto(patientId: string, profile: ProfileRecord): PatientProfileDto {
  return {
    patientId,
    fullName: profile.fullName,
    dateOfBirth: profile.dateOfBirth ? isoDate(profile.dateOfBirth) : null,
    gender: profile.gender,
    bloodGroup: profile.bloodGroup as PatientProfileDto["bloodGroup"],
    allergies: profile.allergies,
    chronicConditions: profile.chronicConditions,
    emergencyContactName: profile.emergencyContactName,
    emergencyContactPhone: profile.emergencyContactPhone,
    emergencyContactRelation: profile.emergencyContactRelation,
    completed: true,
  };
}

function documentDto(document: DocumentRecord): DocumentDto {
  return {
    id: document.id,
    documentType: document.documentType,
    originalFilename: document.originalFilename,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    uploadedAt: document.uploadedAt.toISOString(),
    documentDate: document.documentDate ? isoDate(document.documentDate) : null,
    hospitalName: document.hospitalName,
    testName: document.testName,
    normalizedTestName: document.normalizedTestName,
    category: document.category,
    processingStatus: document.processingStatus,
    verificationStatus: document.verificationStatus,
    failureCode: document.failureCode,
  };
}

function reportDetailDto(report: ReportWithExtraction): ReportDetailDto {
  const verified = report.verificationStatus === "VERIFIED";
  return {
    ...documentDto(report),
    patientNameOnReport: report.extraction?.patientNameOnReport ?? null,
    measurements:
      report.extraction?.measurements.map((measurement) => ({
        id: measurement.id,
        name: (verified ? measurement.verifiedName : null) ?? measurement.name,
        normalizedName:
          (verified ? measurement.verifiedNormalizedName : null) ?? measurement.normalizedName,
        textValue: verified ? measurement.verifiedTextValue : measurement.textValue,
        numericValue: verified ? measurement.verifiedNumericValue : measurement.numericValue,
        unit: verified ? measurement.verifiedUnit : measurement.unit,
        referenceRange: verified ? measurement.verifiedReferenceRange : measurement.referenceRange,
        sourceFlag: verified ? measurement.verifiedSourceFlag : measurement.sourceFlag,
        patientCorrected: measurement.patientCorrected,
      })) ?? [],
  };
}

function measurementChanged(
  original: ReportWithExtraction["extraction"] extends infer E
    ? E extends { measurements: Array<infer M> }
      ? M
      : never
    : never,
  verified: VerifyReportInput["measurements"][number],
): boolean {
  return (
    original.name !== verified.name ||
    original.textValue !== verified.textValue ||
    original.numericValue !== verified.numericValue ||
    original.unit !== verified.unit ||
    original.referenceRange !== verified.referenceRange ||
    original.sourceFlag !== verified.sourceFlag
  );
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function sanitizeFilename(filename: string): string {
  const safe = filename
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (safe || "medical-document").slice(-180);
}

function episodeDto(episode: Episode): EpisodeDto {
  return {
    id: episode.id,
    title: episode.title,
    startDate: episode.startDate ? isoDate(episode.startDate) : null,
    endDate: episode.endDate ? isoDate(episode.endDate) : null,
    createdAt: episode.createdAt.toISOString(),
    updatedAt: episode.updatedAt.toISOString(),
  };
}
async function summaryErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof SummaryError)
      throw new AppError(
        error.status,
        error.code,
        error.status === 404
          ? "Not found."
          : error.status === 429
            ? "Please wait 30 seconds before requesting another summary."
            : error.code === "SUMMARY_SCHEMA_PENDING"
              ? "Summary storage is awaiting the approved database migration. Reports and comparisons remain available."
              : "Reviewed source data is not eligible for a summary. Refresh and check the report states.",
      );
    throw error;
  }
}

export function medicationDto(med: Medication): MedicationDto {
  return {
    id: med.id,
    name: med.name,
    resolvedGeneric: med.resolvedGeneric,
    resolvedStatus: med.resolvedStatus,
    strength: med.strength,
    doseAmount: med.doseAmount,
    doseUnit: med.doseUnit,
    formulation: med.formulation,
    route: med.route,
    startDate: med.startDate ? isoDate(med.startDate) : null,
    endDate: med.endDate ? isoDate(med.endDate) : null,
    status: med.status,
    notes: med.notes,
    prescriptionId: med.prescriptionId,
    createdAt: med.createdAt.toISOString(),
    updatedAt: med.updatedAt.toISOString(),
  };
}

export function scheduleDto(schedule: MedicationSchedule): MedicationScheduleDto {
  return {
    id: schedule.id,
    medicationId: schedule.medicationId,
    version: schedule.version,
    frequency: schedule.frequency,
    administrationTimes: createScheduleSchema.shape.administrationTimes.parse(
      schedule.administrationTimes,
    ),
    mealTiming: schedule.mealTiming,
    ianaTimezone: schedule.ianaTimezone,
    startDate: isoDate(schedule.startDate),
    endDate: schedule.endDate ? isoDate(schedule.endDate) : null,
    stockCount: schedule.stockCount,
    refillAlertAt: schedule.refillAlertAt,
    active: schedule.active,
    createdAt: schedule.createdAt.toISOString(),
  };
}

export function occurrenceDto(occ: ScheduleOccurrence): OccurrenceDto {
  return {
    id: occ.id,
    scheduleId: occ.scheduleId,
    dueAt: occ.dueAt.toISOString(),
    localTimeStr: occ.localTimeStr,
    status: occ.status,
  };
}
