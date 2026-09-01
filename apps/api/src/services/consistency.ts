import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { PrismaClient } from "@medvault/database";

export interface DocumentReference {
  id: string;
  storagePath: string;
}

export interface PatientReference {
  id: string;
  authUserId: string;
}

export interface ConsistencyRepository {
  listDocuments(afterId: string | undefined, limit: number): Promise<DocumentReference[]>;
  existingStoragePaths(paths: readonly string[]): Promise<Set<string>>;
  listPatients(afterId: string | undefined, limit: number): Promise<PatientReference[]>;
}

export interface StorageInventory {
  isBucketPrivate(): Promise<boolean>;
  objectExists(path: string): Promise<boolean>;
  listObjectPaths(
    maxObjects: number,
    pageSize: number,
  ): Promise<{
    paths: string[];
    truncated: boolean;
  }>;
}

export interface AuthDirectory {
  userExists(authUserId: string): Promise<boolean>;
}

export interface StorageConsistencyReport {
  bucketPrivate: boolean;
  documentsChecked: number;
  objectsChecked: number;
  databaseScanTruncated: boolean;
  storageScanTruncated: boolean;
  missingObjects: Array<{ documentId: string; pathFingerprint: string }>;
  potentialOrphans: Array<{ pathFingerprint: string }>;
}

export interface AuthOrphanReport {
  patientsChecked: number;
  scanTruncated: boolean;
  missingAuthUsers: Array<{ patientId: string; authUserFingerprint: string }>;
}

export class DatabaseStorageConsistencyChecker {
  constructor(
    private readonly repository: ConsistencyRepository,
    private readonly storage: StorageInventory,
    private readonly pageSize = 100,
    private readonly maxItems = 10_000,
  ) {}

  async check(): Promise<StorageConsistencyReport> {
    const missingObjects: StorageConsistencyReport["missingObjects"] = [];
    let documentsChecked = 0;
    let afterId: string | undefined;
    let databaseScanTruncated = false;

    while (documentsChecked < this.maxItems) {
      const limit = Math.min(this.pageSize, this.maxItems - documentsChecked);
      const documents = await this.repository.listDocuments(afterId, limit);
      for (const document of documents) {
        documentsChecked += 1;
        if (!(await this.storage.objectExists(document.storagePath))) {
          missingObjects.push({
            documentId: document.id,
            pathFingerprint: fingerprint(document.storagePath),
          });
        }
      }
      if (documents.length < limit) break;
      afterId = documents.at(-1)?.id;
      if (documentsChecked >= this.maxItems) databaseScanTruncated = true;
    }

    const inventory = await this.storage.listObjectPaths(this.maxItems, this.pageSize);
    const potentialOrphans: StorageConsistencyReport["potentialOrphans"] = [];
    for (let index = 0; index < inventory.paths.length; index += this.pageSize) {
      const paths = inventory.paths.slice(index, index + this.pageSize);
      const existing = await this.repository.existingStoragePaths(paths);
      for (const path of paths) {
        if (!existing.has(path)) potentialOrphans.push({ pathFingerprint: fingerprint(path) });
      }
    }

    return {
      bucketPrivate: await this.storage.isBucketPrivate(),
      documentsChecked,
      objectsChecked: inventory.paths.length,
      databaseScanTruncated,
      storageScanTruncated: inventory.truncated,
      missingObjects,
      potentialOrphans,
    };
  }
}

export class AuthOrphanChecker {
  constructor(
    private readonly repository: ConsistencyRepository,
    private readonly auth: AuthDirectory,
    private readonly pageSize = 100,
    private readonly maxItems = 10_000,
  ) {}

  async check(): Promise<AuthOrphanReport> {
    const missingAuthUsers: AuthOrphanReport["missingAuthUsers"] = [];
    let patientsChecked = 0;
    let afterId: string | undefined;
    let scanTruncated = false;
    while (patientsChecked < this.maxItems) {
      const limit = Math.min(this.pageSize, this.maxItems - patientsChecked);
      const patients = await this.repository.listPatients(afterId, limit);
      for (const patient of patients) {
        patientsChecked += 1;
        if (!(await this.auth.userExists(patient.authUserId))) {
          missingAuthUsers.push({
            patientId: patient.id,
            authUserFingerprint: fingerprint(patient.authUserId),
          });
        }
      }
      if (patients.length < limit) break;
      afterId = patients.at(-1)?.id;
      if (patientsChecked >= this.maxItems) scanTruncated = true;
    }
    return { patientsChecked, scanTruncated, missingAuthUsers };
  }
}

export class PrismaConsistencyRepository implements ConsistencyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listDocuments(afterId: string | undefined, limit: number): Promise<DocumentReference[]> {
    return this.prisma.medicalDocument.findMany({
      orderBy: { id: "asc" },
      take: limit,
      ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
      select: { id: true, storagePath: true },
    });
  }

  async existingStoragePaths(paths: readonly string[]): Promise<Set<string>> {
    if (paths.length === 0) return new Set();
    const documents = await this.prisma.medicalDocument.findMany({
      where: { storagePath: { in: [...paths] } },
      select: { storagePath: true },
    });
    return new Set(documents.map(({ storagePath }) => storagePath));
  }

  listPatients(afterId: string | undefined, limit: number): Promise<PatientReference[]> {
    return this.prisma.patient.findMany({
      orderBy: { id: "asc" },
      take: limit,
      ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
      select: { id: true, authUserId: true },
    });
  }
}

export class SupabaseStorageInventory implements StorageInventory {
  private readonly client: ReturnType<typeof serverSupabaseClient>;

  constructor(
    url: string,
    serviceRoleKey: string,
    private readonly bucket: string,
  ) {
    this.client = serverSupabaseClient(url, serviceRoleKey);
  }

  async isBucketPrivate(): Promise<boolean> {
    const { data, error } = await this.client.storage.getBucket(this.bucket);
    if (error) throw new Error("Storage bucket metadata is unavailable");
    return !data.public;
  }

  async objectExists(path: string): Promise<boolean> {
    const separator = path.lastIndexOf("/");
    if (separator < 1 || separator === path.length - 1) return false;
    const folder = path.slice(0, separator);
    const filename = path.slice(separator + 1);
    const { data, error } = await this.client.storage.from(this.bucket).list(folder, {
      limit: 100,
      offset: 0,
      search: filename,
    });
    if (error) throw new Error("Storage inventory is unavailable");
    return data.some((object) => object.id !== null && object.name === filename);
  }

  async listObjectPaths(
    maxObjects: number,
    pageSize: number,
  ): Promise<{ paths: string[]; truncated: boolean }> {
    const paths: string[] = [];
    const folders = [""];
    const visited = new Set<string>();
    while (folders.length > 0 && paths.length < maxObjects) {
      const folder = folders.shift();
      if (folder === undefined || visited.has(folder)) continue;
      visited.add(folder);
      for (let offset = 0; paths.length < maxObjects; offset += pageSize) {
        const { data, error } = await this.client.storage.from(this.bucket).list(folder, {
          limit: pageSize,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
        if (error) throw new Error("Storage inventory is unavailable");
        for (const object of data) {
          const path = folder ? `${folder}/${object.name}` : object.name;
          if (object.id === null) folders.push(path);
          else paths.push(path);
          if (paths.length >= maxObjects) break;
        }
        if (data.length < pageSize) break;
      }
    }
    return { paths, truncated: paths.length >= maxObjects || folders.length > 0 };
  }
}

export class SupabaseAuthDirectory implements AuthDirectory {
  private readonly client: ReturnType<typeof serverSupabaseClient>;

  constructor(url: string, serviceRoleKey: string) {
    this.client = serverSupabaseClient(url, serviceRoleKey);
  }

  async userExists(authUserId: string): Promise<boolean> {
    const { data, error } = await this.client.auth.admin.getUserById(authUserId);
    if (!error) return Boolean(data.user);
    if (error.status === 404) return false;
    throw new Error("Supabase Auth inventory is unavailable");
  }
}

export function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function serverSupabaseClient(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
