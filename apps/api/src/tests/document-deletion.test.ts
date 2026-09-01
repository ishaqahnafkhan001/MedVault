import { describe, expect, it } from "vitest";
import { AppError } from "../errors.js";
import {
  DocumentDeletionCoordinator,
  type DeletableDocument,
  type DocumentDeletionRepository,
} from "../services/document-deletion.js";
import type { ReportJobData, ReportQueue } from "../services/queue.js";
import type { PrivateStorage } from "../services/storage.js";

describe("coordinated document deletion", () => {
  it("deletes storage and cascading database metadata for an owned report", async () => {
    const context = setup(document("NEEDS_REVIEW"));
    await expect(context.coordinator.delete(ownerId, documentId)).resolves.toBeUndefined();
    expect(context.storage.removed).toBe(1);
    expect(context.repository.deleted).toBe(1);
  });

  it("treats an already-missing storage object as an idempotent success", async () => {
    const context = setup(document("VERIFIED"));
    context.storage.objectMissing = true;
    await expect(context.coordinator.delete(ownerId, documentId)).resolves.toBeUndefined();
    expect(context.repository.deleted).toBe(1);
  });

  it("restores metadata and the queue when storage deletion fails", async () => {
    const context = setup(document("QUEUED"));
    context.storage.fail = true;
    await expect(context.coordinator.delete(ownerId, documentId)).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE",
    });
    expect(context.repository.deleted).toBe(0);
    expect(context.repository.restored).toBe(1);
    expect(context.queue.ensured).toEqual([{ documentId, documentVersion: 1 }]);
  });

  it("leaves the recoverable deletion marker when the database delete fails", async () => {
    const context = setup(document("NEEDS_REVIEW"));
    context.repository.failDelete = true;
    await expect(context.coordinator.delete(ownerId, documentId)).rejects.toMatchObject({
      code: "DOCUMENT_DELETE_INCOMPLETE",
    });
    expect(context.storage.removed).toBe(1);
    expect(context.repository.pending).toBe(true);
  });

  it("removes a queued job before deleting a queued report", async () => {
    const context = setup(document("QUEUED"));
    context.queue.removal = "removed";
    await context.coordinator.delete(ownerId, documentId);
    expect(context.queue.removed).toEqual([{ documentId, documentVersion: 1 }]);
    expect(context.repository.deleted).toBe(1);
  });

  it("refuses deletion while the matching job is active", async () => {
    const context = setup(document("PROCESSING"));
    context.queue.removal = "active";
    await expect(context.coordinator.delete(ownerId, documentId)).rejects.toMatchObject({
      code: "DOCUMENT_BUSY",
      status: 409,
    });
    expect(context.storage.removed).toBe(0);
    expect(context.repository.deleted).toBe(0);
  });

  it("does not reveal or mutate another patient's document", async () => {
    const context = setup(null);
    await expect(context.coordinator.delete(ownerId, documentId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(context.storage.removed).toBe(0);
    expect(context.queue.removed).toEqual([]);
  });
});

const ownerId = "10000000-0000-4000-8000-000000000001";
const patientId = "20000000-0000-4000-8000-000000000002";
const documentId = "30000000-0000-4000-8000-000000000003";

function document(processingStatus: DeletableDocument["processingStatus"]): DeletableDocument {
  return {
    id: documentId,
    patientId,
    documentType: "REPORT",
    documentVersion: 1,
    storagePath: `${ownerId}/${documentId}/report.pdf`,
    processingStatus,
    processingStartedAt: processingStatus === "PROCESSING" ? new Date() : null,
    failureCode: null,
  };
}

function setup(ownedDocument: DeletableDocument | null) {
  const repository = new FakeRepository(ownedDocument);
  const storage = new FakeStorage();
  const queue = new FakeQueue();
  return {
    repository,
    storage,
    queue,
    coordinator: new DocumentDeletionCoordinator(repository, storage, queue),
  };
}

class FakeRepository implements DocumentDeletionRepository {
  deleted = 0;
  restored = 0;
  pending = false;
  failDelete = false;

  constructor(private readonly document: DeletableDocument | null) {}

  findOwned() {
    return Promise.resolve(this.document);
  }

  markPending() {
    this.pending = true;
    return Promise.resolve(true);
  }

  restore() {
    this.pending = false;
    this.restored += 1;
    return Promise.resolve(true);
  }

  markQueueCompensationFailed() {
    return Promise.resolve();
  }

  deletePending(): Promise<boolean> {
    if (this.failDelete) return Promise.reject(new Error("database unavailable"));
    this.deleted += 1;
    this.pending = false;
    return Promise.resolve(true);
  }
}

class FakeStorage implements PrivateStorage {
  removed = 0;
  fail = false;
  objectMissing = false;

  upload() {
    return Promise.resolve();
  }

  createSignedUrl() {
    return Promise.resolve("https://private.example/signed");
  }

  remove(): Promise<void> {
    this.removed += 1;
    if (this.fail) {
      return Promise.reject(
        new AppError(503, "STORAGE_UNAVAILABLE", "The file could not be removed right now."),
      );
    }
    void this.objectMissing;
    return Promise.resolve();
  }
}

class FakeQueue implements ReportQueue {
  removal: "removed" | "missing" | "active" = "missing";
  removed: ReportJobData[] = [];
  ensured: ReportJobData[] = [];

  enqueue() {
    return Promise.resolve();
  }

  ensureQueued(data: ReportJobData): Promise<"enqueued"> {
    this.ensured.push(data);
    return Promise.resolve("enqueued");
  }

  getState() {
    return Promise.resolve("missing" as const);
  }

  removeForDeletion(data: ReportJobData) {
    this.removed.push(data);
    return Promise.resolve(this.removal);
  }

  close() {
    return Promise.resolve();
  }
}
