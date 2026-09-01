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
} from "@medvault/shared";
import { normalizeTestName } from "@medvault/medical";
import type { Prisma, PrismaClient } from "@medvault/database";
import { AppError, notFound } from "../errors.js";
import type { AppService, UploadedDocumentFile } from "../types.js";
import type { ReportQueue } from "./queue.js";
import type { PrivateStorage } from "./storage.js";
import {
  DocumentDeletionCoordinator,
  PrismaDocumentDeletionRepository,
} from "./document-deletion.js";

export class PrismaAppService implements AppService {
  private readonly deletion: DocumentDeletionCoordinator;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: PrivateStorage,
    private readonly reportQueue: ReportQueue,
    private readonly signedUrlTtlSeconds: number,
  ) {
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
          processingStatus: metadata.documentType === "REPORT" ? "UPLOADED" : "NOT_APPLICABLE",
          verificationStatus: metadata.documentType === "REPORT" ? "PENDING" : "NOT_APPLICABLE",
        },
      });
    } catch (error) {
      await this.storage.remove(storagePath).catch(() => undefined);
      throw error;
    }

    if (metadata.documentType === "REPORT") {
      try {
        await this.reportQueue.enqueue("REPORT", { documentId: document.id, documentVersion: 1 });
        document = await this.prisma.medicalDocument.update({
          where: { id: document.id },
          data: { processingStatus: "QUEUED", failureCode: null },
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
    const latestGroups = await this.prisma.medicalDocument.groupBy({
      by: ["normalizedTestName"],
      where: {
        patientId,
        documentType: "REPORT",
        verificationStatus: "VERIFIED",
        normalizedTestName: { not: null },
        documentDate: { not: null },
      },
      _max: { documentDate: true },
      orderBy: { _max: { documentDate: "desc" } },
      take: 12,
    });
    const reports = await Promise.all(
      latestGroups.map((group) =>
        this.prisma.medicalDocument.findFirst({
          where: {
            patientId,
            documentType: "REPORT",
            verificationStatus: "VERIFIED",
            normalizedTestName: group.normalizedTestName,
            documentDate: group._max.documentDate,
          },
          orderBy: { createdAt: "desc" },
        }),
      ),
    );
    return reports
      .filter((report): report is NonNullable<typeof report> => report !== null)
      .sort((left, right) => {
        const byDate = (right.documentDate?.getTime() ?? 0) - (left.documentDate?.getTime() ?? 0);
        return byDate || right.createdAt.getTime() - left.createdAt.getTime();
      })
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
      const report = await transaction.medicalDocument.findFirst({
        where: {
          id: documentId,
          patientId,
          documentType: "REPORT",
          processingStatus: "NEEDS_REVIEW",
          verificationStatus: "PENDING",
        },
        include: { extraction: { include: { measurements: true } } },
      });
      if (!report?.extraction) throw notFound();
      const storedIds = new Set(report.extraction.measurements.map(({ id }) => id));
      if (
        storedIds.size !== input.measurements.length ||
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

  async retryReport(authUserId: string, documentId: string): Promise<DocumentDto> {
    const patientId = await this.patientId(authUserId);
    const report = await this.prisma.medicalDocument.findFirst({
      where: { id: documentId, patientId, documentType: "REPORT", processingStatus: "FAILED" },
    });
    if (!report) throw notFound();
    await this.reportQueue.ensureQueued({
      documentId: report.id,
      documentVersion: report.documentVersion,
    });
    const updated = await this.prisma.medicalDocument.update({
      where: { id: report.id },
      data: { processingStatus: "QUEUED", failureCode: null },
    });
    return documentDto(updated);
  }

  async getDashboard(authUserId: string) {
    const patientId = await this.patientId(authUserId);
    const [recent, processing, needsReview, verified, latestReports] = await Promise.all([
      this.prisma.medicalDocument.findMany({
        where: { patientId },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      this.prisma.medicalDocument.count({
        where: { patientId, processingStatus: { in: ["UPLOADED", "QUEUED", "PROCESSING"] } },
      }),
      this.prisma.medicalDocument.count({ where: { patientId, processingStatus: "NEEDS_REVIEW" } }),
      this.prisma.medicalDocument.count({ where: { patientId, verificationStatus: "VERIFIED" } }),
      this.latestReports(authUserId),
    ]);
    return {
      recentDocuments: recent.map(documentDto),
      latestReports,
      counts: { processing, needsReview, verified },
    };
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
