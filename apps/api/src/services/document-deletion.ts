import type { DocumentType, PrismaClient, ProcessingStatus } from "@medvault/database";
import { AppError, notFound } from "../errors.js";
import type { ReportQueue } from "./queue.js";
import type { PrivateStorage } from "./storage.js";

export interface DeletableDocument {
  id: string;
  patientId: string;
  documentType: DocumentType;
  documentVersion: number;
  storagePath: string;
  processingStatus: ProcessingStatus;
  processingStartedAt: Date | null;
  failureCode: string | null;
}

export interface DocumentDeletionRepository {
  findOwned(authUserId: string, documentId: string): Promise<DeletableDocument | null>;
  markPending(document: DeletableDocument): Promise<boolean>;
  restore(document: DeletableDocument, processingStatus: ProcessingStatus): Promise<boolean>;
  markQueueCompensationFailed(document: DeletableDocument): Promise<void>;
  deletePending(document: DeletableDocument): Promise<boolean>;
}

export class DocumentDeletionCoordinator {
  constructor(
    private readonly repository: DocumentDeletionRepository,
    private readonly storage: PrivateStorage,
    private readonly queue: ReportQueue,
  ) {}

  async delete(authUserId: string, documentId: string): Promise<void> {
    const document = await this.repository.findOwned(authUserId, documentId);
    if (!document) throw notFound();

    const job = { documentId: document.id, documentVersion: document.documentVersion };
    let queueResult: "removed" | "missing" | "active" = "missing";
    if (document.documentType === "REPORT") {
      queueResult = await this.queue.removeForDeletion(job);
      if (queueResult === "active") {
        throw new AppError(
          409,
          "DOCUMENT_BUSY",
          "This report is actively processing. Please retry deletion shortly.",
        );
      }
    }

    if (!(await this.repository.markPending(document))) {
      await this.compensateQueue(document, queueResult);
      throw new AppError(409, "DOCUMENT_CHANGED", "The document changed. Refresh and try again.");
    }

    try {
      await this.storage.remove(document.storagePath);
    } catch (error) {
      const restoreStatus = shouldQueue(document.processingStatus)
        ? "QUEUED"
        : document.processingStatus;
      const restored = await this.repository.restore(document, restoreStatus);
      if (!restored) throw deletionIncomplete();
      try {
        if (shouldQueue(document.processingStatus)) await this.queue.ensureQueued(job);
      } catch {
        await this.repository.markQueueCompensationFailed(document);
        throw deletionIncomplete();
      }
      throw error;
    }

    try {
      if (!(await this.repository.deletePending(document))) throw deletionIncomplete();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw deletionIncomplete();
    }
  }

  private async compensateQueue(
    document: DeletableDocument,
    queueResult: "removed" | "missing" | "active",
  ): Promise<void> {
    if (
      document.documentType === "REPORT" &&
      queueResult === "removed" &&
      shouldQueue(document.processingStatus)
    ) {
      await this.queue.ensureQueued({
        documentId: document.id,
        documentVersion: document.documentVersion,
      });
    }
  }
}

export class PrismaDocumentDeletionRepository implements DocumentDeletionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findOwned(authUserId: string, documentId: string): Promise<DeletableDocument | null> {
    return this.prisma.medicalDocument.findFirst({
      where: { id: documentId, patient: { authUserId } },
      select: {
        id: true,
        patientId: true,
        documentType: true,
        documentVersion: true,
        storagePath: true,
        processingStatus: true,
        processingStartedAt: true,
        failureCode: true,
      },
    });
  }

  async markPending(document: DeletableDocument): Promise<boolean> {
    const result = await this.prisma.medicalDocument.updateMany({
      where: {
        id: document.id,
        patientId: document.patientId,
        documentVersion: document.documentVersion,
        processingStatus: document.processingStatus,
      },
      data: {
        processingStatus: "FAILED",
        processingStartedAt: null,
        failureCode: "DELETE_PENDING",
      },
    });
    return result.count === 1;
  }

  async restore(document: DeletableDocument, processingStatus: ProcessingStatus): Promise<boolean> {
    const result = await this.prisma.medicalDocument.updateMany({
      where: {
        id: document.id,
        patientId: document.patientId,
        documentVersion: document.documentVersion,
        processingStatus: "FAILED",
        failureCode: "DELETE_PENDING",
      },
      data: {
        processingStatus,
        processingStartedAt:
          processingStatus === document.processingStatus ? document.processingStartedAt : null,
        failureCode: document.failureCode,
      },
    });
    return result.count === 1;
  }

  async markQueueCompensationFailed(document: DeletableDocument): Promise<void> {
    await this.prisma.medicalDocument.updateMany({
      where: {
        id: document.id,
        patientId: document.patientId,
        documentVersion: document.documentVersion,
      },
      data: { processingStatus: "FAILED", failureCode: "DELETE_ROLLBACK_QUEUE_FAILED" },
    });
  }

  async deletePending(document: DeletableDocument): Promise<boolean> {
    const result = await this.prisma.medicalDocument.deleteMany({
      where: {
        id: document.id,
        patientId: document.patientId,
        documentVersion: document.documentVersion,
        processingStatus: "FAILED",
        failureCode: "DELETE_PENDING",
      },
    });
    return result.count === 1;
  }
}

function shouldQueue(status: ProcessingStatus): boolean {
  return status === "UPLOADED" || status === "QUEUED" || status === "PROCESSING";
}

function deletionIncomplete(): AppError {
  return new AppError(
    503,
    "DOCUMENT_DELETE_INCOMPLETE",
    "Document deletion is incomplete and can be retried safely.",
  );
}
