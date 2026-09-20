import type { PrismaClient } from "@medvault/database";
import { describe, expect, it } from "vitest";
import { PrismaAppService } from "../services/prisma-service.js";
import type { ReportJobData, ReportQueue } from "../services/queue.js";
import type { PrivateStorage } from "../services/storage.js";

const authUserId = "10000000-0000-4000-8000-000000000001";
const patientId = "20000000-0000-4000-8000-000000000002";

describe("document upload recovery boundaries", () => {
  it("maps an unexpected readiness dependency failure to a safe 503", async () => {
    const prisma = new UploadPrisma();
    prisma.failHealth = true;
    const service = new PrismaAppService(
      prisma as unknown as PrismaClient,
      new UploadStorage(),
      new UploadQueue(),
      300,
    );

    await expect(service.checkHealth()).rejects.toMatchObject({
      status: 503,
      code: "DEPENDENCY_UNAVAILABLE",
      message: "A required service is temporarily unavailable.",
    });
  });

  it("keeps the stored document recoverable when the queue producer is unavailable", async () => {
    const prisma = new UploadPrisma();
    const storage = new UploadStorage();
    const queue = new UploadQueue();
    queue.failEnqueue = true;
    const service = new PrismaAppService(prisma as unknown as PrismaClient, storage, queue, 300);

    const result = await service.createDocument(
      authUserId,
      {
        bytes: Buffer.from("synthetic report"),
        originalFilename: "synthetic.pdf",
        detectedMimeType: "application/pdf",
      },
      { documentType: "REPORT" },
      "ex04.queue-failure",
    );

    expect(result).toMatchObject({
      processingStatus: "FAILED",
      failureCode: "QUEUE_UNAVAILABLE",
    });
    expect(storage.uploaded).toHaveLength(1);
    expect(storage.removed).toEqual([]);
    expect(queue.jobs[0]).toMatchObject({ correlationId: "ex04.queue-failure" });
  });

  it("removes the just-uploaded object if metadata persistence fails", async () => {
    const prisma = new UploadPrisma();
    prisma.failCreate = true;
    const storage = new UploadStorage();
    const service = new PrismaAppService(
      prisma as unknown as PrismaClient,
      storage,
      new UploadQueue(),
      300,
    );

    await expect(
      service.createDocument(
        authUserId,
        {
          bytes: Buffer.from("synthetic report"),
          originalFilename: "synthetic.pdf",
          detectedMimeType: "application/pdf",
        },
        { documentType: "REPORT" },
      ),
    ).rejects.toThrow("database unavailable");
    expect(storage.uploaded).toHaveLength(1);
    expect(storage.removed).toEqual(storage.uploaded);
  });
});

class UploadPrisma {
  failCreate = false;
  failHealth = false;
  private row: Record<string, unknown> | null = null;

  $queryRaw = () =>
    this.failHealth ? Promise.reject(new Error("database unavailable")) : Promise.resolve([1]);

  patient = {
    upsert: () => Promise.resolve({ id: patientId }),
  };

  medicalDocument = {
    create: ({ data }: { data: Record<string, unknown> }) => {
      if (this.failCreate) return Promise.reject(new Error("database unavailable"));
      this.row = {
        ...data,
        uploadedAt: new Date("2026-09-20T00:00:00.000Z"),
        documentVersion: 1,
        failureCode: null,
      };
      return Promise.resolve(this.row);
    },
    update: ({ data }: { data: Record<string, unknown> }) => {
      this.row = { ...this.row, ...data };
      return Promise.resolve(this.row);
    },
  };
}

class UploadStorage implements PrivateStorage {
  uploaded: string[] = [];
  removed: string[] = [];

  checkHealth() {
    return Promise.resolve();
  }

  upload(path: string) {
    this.uploaded.push(path);
    return Promise.resolve();
  }

  createSignedUrl() {
    return Promise.resolve("https://private.example/signed");
  }

  remove(path: string) {
    this.removed.push(path);
    return Promise.resolve();
  }
}

class UploadQueue implements ReportQueue {
  failEnqueue = false;
  jobs: ReportJobData[] = [];

  enqueue(_documentType: "REPORT" | "PRESCRIPTION", data: ReportJobData) {
    this.jobs.push(data);
    return this.failEnqueue ? Promise.reject(new Error("redis unavailable")) : Promise.resolve();
  }

  ensureQueued() {
    return Promise.resolve("enqueued" as const);
  }

  getState() {
    return Promise.resolve("missing" as const);
  }

  removeForDeletion() {
    return Promise.resolve("missing" as const);
  }

  enqueueSummary() {
    return Promise.resolve();
  }

  checkHealth() {
    return Promise.resolve();
  }

  close() {
    return Promise.resolve();
  }
}
