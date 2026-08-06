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
      include: { extraction: { select: { documentVersion: true } } },
    });
    if (!document || document.documentVersion !== documentVersion) return null;
    if (
      document.extraction?.documentVersion === documentVersion &&
      (document.processingStatus === "NEEDS_REVIEW" || document.processingStatus === "VERIFIED")
    ) {
      return "complete";
    }
    if (!supportedMimeTypes.has(document.mimeType)) {
      await this.markFailed(document.id, "UNSUPPORTED_REPORT");
      return null;
    }
    const claimed = await this.prisma.medicalDocument.updateMany({
      where: {
        id: documentId,
        documentVersion,
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

  async persist(document: ClaimedReport, result: ExtractionResult): Promise<void> {
    const extraction = result.extraction;
    await this.prisma.$transaction(async (transaction) => {
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
        if (existing.documentVersion > document.documentVersion) return;
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
      await transaction.medicalDocument.update({
        where: { id: document.id },
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
    });
  }

  async markRetry(documentId: string, safeCode: string): Promise<void> {
    await this.prisma.medicalDocument.updateMany({
      where: { id: documentId, documentType: "REPORT", processingStatus: "PROCESSING" },
      data: { processingStatus: "QUEUED", failureCode: safeCode },
    });
  }

  async markFailed(documentId: string, safeCode: string): Promise<void> {
    await this.prisma.medicalDocument.updateMany({
      where: { id: documentId, documentType: "REPORT" },
      data: { processingStatus: "FAILED", failureCode: safeCode },
    });
  }
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
