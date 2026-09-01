import {
  AiExtractionError,
  type ExtractionResult,
  type ReportExtractionAdapter,
} from "@medvault/ai";
import { categorizeTestName, normalizeTestName } from "@medvault/medical";
import { reportExtractionSchema, type DocumentType } from "@medvault/shared";

export interface ClaimedReport {
  id: string;
  documentType: DocumentType;
  documentVersion: number;
  storagePath: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
}

export interface ReportProcessorRepository {
  claim(documentId: string, documentVersion: number): Promise<ClaimedReport | "complete" | null>;
  persist(document: ClaimedReport, result: ExtractionResult): Promise<boolean>;
  markRetry(document: ClaimedReport, safeCode: string): Promise<void>;
  markFailed(document: ClaimedReport, safeCode: string): Promise<void>;
}

export interface ReportFileStorage {
  download(path: string): Promise<Uint8Array>;
}

export interface ProcessingAttempt {
  number: number;
  maximum: number;
}

export class PermanentProcessingError extends Error {
  constructor(readonly safeCode: string) {
    super(safeCode);
    this.name = "PermanentProcessingError";
  }
}

export class ReportProcessor {
  constructor(
    private readonly repository: ReportProcessorRepository,
    private readonly storage: ReportFileStorage,
    private readonly ai: ReportExtractionAdapter,
  ) {}

  async process(
    data: { documentId: string; documentVersion: number },
    attempt: ProcessingAttempt,
  ): Promise<"processed" | "already-complete" | "not-found" | "stale"> {
    const document = await this.repository.claim(data.documentId, data.documentVersion);
    if (document === "complete") return "already-complete";
    if (!document) return "not-found";
    if (document.documentType !== "REPORT") {
      await this.repository.markFailed(document, "PRESCRIPTION_AI_FORBIDDEN");
      throw new PermanentProcessingError("PRESCRIPTION_AI_FORBIDDEN");
    }

    try {
      const bytes = await this.storage.download(document.storagePath);
      const result = await this.ai.extract({ bytes, mimeType: document.mimeType });
      const extraction = reportExtractionSchema.parse(result.extraction);
      const normalizedTestName = normalizeTestName(
        extraction.normalizedTestName ?? extraction.testName,
      );
      const normalizedResult: ExtractionResult = {
        ...result,
        extraction: {
          ...extraction,
          normalizedTestName,
          category:
            extraction.category === "OTHER"
              ? categorizeTestName(extraction.testName)
              : extraction.category,
          measurements: extraction.measurements.map((measurement) => ({
            ...measurement,
            normalizedName: normalizeTestName(measurement.normalizedName ?? measurement.name),
          })),
        },
      };
      return (await this.repository.persist(document, normalizedResult)) ? "processed" : "stale";
    } catch (error) {
      const permanent =
        error instanceof PermanentProcessingError ||
        (error instanceof AiExtractionError && !error.transient);
      const finalAttempt = attempt.number >= attempt.maximum;
      const safeCode =
        error instanceof PermanentProcessingError
          ? error.safeCode
          : error instanceof AiExtractionError
            ? error.safeCode
            : "ANALYSIS_FAILED";
      if (permanent || finalAttempt) {
        await this.repository.markFailed(document, safeCode);
        throw new PermanentProcessingError(safeCode);
      }
      await this.repository.markRetry(document, safeCode);
      throw error;
    }
  }
}
