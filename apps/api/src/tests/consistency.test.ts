import { describe, expect, it } from "vitest";
import {
  AuthOrphanChecker,
  DatabaseStorageConsistencyChecker,
  fingerprint,
  type AuthDirectory,
  type ConsistencyRepository,
  type DocumentReference,
  type PatientReference,
  type StorageInventory,
} from "../services/consistency.js";

describe("read-only consistency checks", () => {
  it("reports missing objects and potential orphans without raw paths", async () => {
    const documents = [
      document("doc-a", "user/doc-a/report.pdf"),
      document("doc-b", "user/doc-b/report.pdf"),
    ];
    const repository = new FakeRepository(documents, []);
    const storage = new FakeStorage(new Set(["user/doc-a/report.pdf"]), [
      "user/doc-a/report.pdf",
      "user/orphan/file.pdf",
    ]);
    const report = await new DatabaseStorageConsistencyChecker(repository, storage, 1, 10).check();

    expect(report.bucketPrivate).toBe(true);
    expect(report.missingObjects).toEqual([
      { documentId: "doc-b", pathFingerprint: fingerprint("user/doc-b/report.pdf") },
    ]);
    expect(report.potentialOrphans).toEqual([
      { pathFingerprint: fingerprint("user/orphan/file.pdf") },
    ]);
    expect(JSON.stringify(report)).not.toContain("user/");
    expect(repository.mutations).toBe(0);
  });

  it("caps large scans and reports truncation", async () => {
    const documents = Array.from({ length: 4 }, (_, index) =>
      document(`doc-${String(index)}`, `user/doc-${String(index)}/report.pdf`),
    );
    const repository = new FakeRepository(documents, []);
    const storage = new FakeStorage(new Set(documents.map(({ storagePath }) => storagePath)), []);
    const report = await new DatabaseStorageConsistencyChecker(repository, storage, 2, 2).check();
    expect(report.documentsChecked).toBe(2);
    expect(report.databaseScanTruncated).toBe(true);
  });

  it("reports deleted Auth accounts without deleting patient data", async () => {
    const patients = [
      { id: "patient-a", authUserId: "auth-a" },
      { id: "patient-b", authUserId: "auth-b" },
    ];
    const repository = new FakeRepository([], patients);
    const auth: AuthDirectory = { userExists: (id) => Promise.resolve(id === "auth-a") };
    const report = await new AuthOrphanChecker(repository, auth, 1, 10).check();
    expect(report.missingAuthUsers).toEqual([
      { patientId: "patient-b", authUserFingerprint: fingerprint("auth-b") },
    ]);
    expect(repository.mutations).toBe(0);
  });
});

function document(id: string, storagePath: string): DocumentReference {
  return { id, storagePath };
}

class FakeRepository implements ConsistencyRepository {
  mutations = 0;

  constructor(
    private readonly documents: DocumentReference[],
    private readonly patients: PatientReference[],
  ) {}

  listDocuments(afterId: string | undefined, limit: number) {
    return Promise.resolve(page(this.documents, afterId, limit));
  }

  existingStoragePaths(paths: readonly string[]) {
    const stored = new Set(this.documents.map(({ storagePath }) => storagePath));
    return Promise.resolve(new Set(paths.filter((path) => stored.has(path))));
  }

  listPatients(afterId: string | undefined, limit: number) {
    return Promise.resolve(page(this.patients, afterId, limit));
  }
}

class FakeStorage implements StorageInventory {
  constructor(
    private readonly existing: Set<string>,
    private readonly inventory: string[],
  ) {}

  isBucketPrivate() {
    return Promise.resolve(true);
  }

  objectExists(path: string) {
    return Promise.resolve(this.existing.has(path));
  }

  listObjectPaths(maxObjects: number) {
    return Promise.resolve({
      paths: this.inventory.slice(0, maxObjects),
      truncated: this.inventory.length > maxObjects,
    });
  }
}

function page<T extends { id: string }>(
  items: T[],
  afterId: string | undefined,
  limit: number,
): T[] {
  const start = afterId ? items.findIndex(({ id }) => id === afterId) + 1 : 0;
  return items.slice(start, start + limit);
}
