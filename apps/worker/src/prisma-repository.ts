import type { ExtractionResult } from "@medvault/ai";
import type { Prisma, PrismaClient } from "@medvault/database";
import type { ClaimedReport, ReportProcessorRepository } from "./processor.js";

const supportedMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export class PrismaReportProcessorRepository implements ReportProcessorRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async claim(
    documentId: string,
    documentVersion: number,
  ): Promise<ClaimedReport | "complete" | null> {
    const document = await this.prisma.medicalDocument.findUnique({
      where: { id: documentId },
      include: {
        extraction: { select: { documentVersion: true } },
        patient: { select: { authUserId: true } },
      },
    });
    if (!document || document.documentVersion !== documentVersion) return null;
    if (document.documentType !== "REPORT") return null;
    if (
      document.extraction?.documentVersion === documentVersion &&
      (document.processingStatus === "NEEDS_REVIEW" || document.processingStatus === "VERIFIED")
    ) {
      return "complete";
    }
    if (!supportedMimeTypes.has(document.mimeType)) {
      await this.markUnclaimedFailure(document.id, documentVersion, "UNSUPPORTED_REPORT");
      return null;
    }
    if (
      !isExpectedReportStoragePath(document.patient.authUserId, document.id, document.storagePath)
    ) {
      await this.markUnclaimedFailure(document.id, documentVersion, "INVALID_STORAGE_PATH");
      return null;
    }
    const claimed = await this.prisma.medicalDocument.updateMany({
      where: {
        id: documentId,
        documentVersion,
        documentType: "REPORT",
        processingStatus: { in: ["UPLOADED", "QUEUED", "FAILED"] },
      },
      data: {
        processingStatus: "PROCESSING",
        processingStartedAt: new Date(),
        processingAttempts: { increment: 1 },
        failureCode: null,
      },
    });
    if (claimed.count !== 1) return null;
    return {
      id: document.id,
      documentType: document.documentType,
      documentVersion: document.documentVersion,
      storagePath: document.storagePath,
      mimeType: document.mimeType as ClaimedReport["mimeType"],
    };
  }

  async persist(document: ClaimedReport, result: ExtractionResult): Promise<boolean> {
    const extraction = result.extraction;
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const transitioned = await transaction.medicalDocument.updateMany({
          where: {
            id: document.id,
            documentType: "REPORT",
            documentVersion: document.documentVersion,
            processingStatus: "PROCESSING",
          },
          data: {
            testName: extraction.testName,
            normalizedTestName: extraction.normalizedTestName,
            documentDate: extraction.reportDate ? parseDate(extraction.reportDate) : null,
            hospitalName: extraction.hospitalName,
            category: extraction.category,
            processingStatus: "NEEDS_REVIEW",
            verificationStatus: "PENDING",
            failureCode: null,
          },
        });
        if (transitioned.count !== 1) return false;

        const existing = await transaction.reportExtraction.findUnique({
          where: { documentId: document.id },
          select: { id: true, documentVersion: true },
        });
        let extractionId: string;
        const data = {
          documentVersion: document.documentVersion,
          status: "DRAFT" as const,
          documentReportType: extraction.documentReportType,
          extractedTestName: extraction.testName,
          normalizedTestName: extraction.normalizedTestName ?? extraction.testName,
          extractedReportDate: extraction.reportDate ? parseDate(extraction.reportDate) : null,
          extractedHospitalName: extraction.hospitalName,
          extractedCategory: extraction.category,
          patientNameOnReport: extraction.patientNameOnReport,
          provider: result.provider,
          model: result.model,
          schemaVersion: result.schemaVersion,
          rawOutput: extraction as Prisma.InputJsonValue,
          analyzedAt: result.analyzedAt,
          verifiedAt: null,
        };
        if (existing) {
          if (existing.documentVersion > document.documentVersion)
            throw new StalePersistenceError();
          await transaction.reportMeasurement.deleteMany({ where: { extractionId: existing.id } });
          const updated = await transaction.reportExtraction.update({
            where: { id: existing.id },
            data,
            select: { id: true },
          });
          extractionId = updated.id;
        } else {
          const created = await transaction.reportExtraction.create({
            data: { documentId: document.id, ...data },
            select: { id: true },
          });
          extractionId = created.id;
        }
        if (extraction.measurements.length > 0) {
          await transaction.reportMeasurement.createMany({
            data: extraction.measurements.map((measurement, index) => ({
              extractionId,
              sortOrder: index,
              name: measurement.name,
              normalizedName: measurement.normalizedName ?? measurement.name,
              textValue: measurement.textValue,
              numericValue: measurement.numericValue,
              unit: measurement.unit,
              referenceRange: measurement.referenceRange,
              sourceFlag: measurement.sourceFlag,
            })),
          });
        }
        return true;
      });
    } catch (error) {
      if (error instanceof StalePersistenceError) return false;
      throw error;
    }
  }

  async markRetry(document: ClaimedReport, safeCode: string): Promise<void> {
    await this.prisma.medicalDocument.updateMany({
      where: {
        id: document.id,
        documentVersion: document.documentVersion,
        documentType: "REPORT",
        processingStatus: "PROCESSING",
      },
      data: { processingStatus: "QUEUED", failureCode: safeCode },
    });
  }

  async markFailed(document: ClaimedReport, safeCode: string): Promise<void> {
    await this.prisma.medicalDocument.updateMany({
      where: {
        id: document.id,
        documentVersion: document.documentVersion,
        documentType: "REPORT",
        processingStatus: "PROCESSING",
      },
      data: { processingStatus: "FAILED", failureCode: safeCode },
    });
  }

  private async markUnclaimedFailure(
    documentId: string,
    documentVersion: number,
    safeCode: string,
  ): Promise<void> {
    await this.prisma.medicalDocument.updateMany({
      where: {
        id: documentId,
        documentVersion,
        documentType: "REPORT",
        processingStatus: { in: ["UPLOADED", "QUEUED", "FAILED"] },
      },
      data: { processingStatus: "FAILED", failureCode: safeCode },
    });
  }
}

class StalePersistenceError extends Error {}

export function isExpectedReportStoragePath(
  authUserId: string,
  documentId: string,
  storagePath: string,
): boolean {
  return (
    !storagePath.includes("\\") &&
    storagePath.startsWith(`${authUserId}/${documentId}/`) &&
    storagePath.length > authUserId.length + documentId.length + 2
  );
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
