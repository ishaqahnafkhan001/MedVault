import { describe, expect, it, vi } from "vitest";
import { groundSummarySelection } from "@medvault/shared";
import {
  SummaryStore,
  reviewedSources,
  stableFingerprint,
  type SourceDocument,
} from "./summaries.js";
import { Prisma, type PrismaClient, type MedicalSummary } from "./generated/client.js";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const patient = uuid(1),
  document = uuid(2),
  episode = uuid(3);
const old = new Date("2026-08-01T00:00:00Z");
// A deliberately restricted in-memory Prisma double. It runs real SummaryStore logic,
// but its serialized transactions are NOT evidence of PostgreSQL trigger/lock behavior.
function fixture() {
  const source = {
    id: document,
    patientId: patient,
    checksumSha256: "a".repeat(64),
    documentType: "REPORT",
    processingStatus: "VERIFIED",
    verificationStatus: "VERIFIED",
    documentVersion: 1,
    documentDate: old,
    hospitalName: "Synthetic lab",
    createdAt: old,
    updatedAt: old,
    extraction: {
      id: uuid(4),
      status: "VERIFIED",
      documentVersion: 1,
      updatedAt: old,
      measurements: [
        {
          id: uuid(5),
          sortOrder: 0,
          name: "Hb",
          verifiedName: "Hb",
          verifiedNumericValue: 14,
          numericValue: 999,
          verifiedTextValue: null,
          verifiedUnit: "g/dL",
          verifiedReferenceRange: "12-16",
          verifiedSourceFlag: null,
          updatedAt: old,
        },
      ],
    },
  } as SourceDocument; // Test-only fixture; unused Prisma fields are intentionally omitted.
  let row: MedicalSummary | null = null;
  let loseClaim = false;
  const context = {
    id: episode,
    patientId: patient,
    title: "Synthetic CBC series",
    startDate: old,
    endDate: old,
    memberships: [{ document: source }],
  };
  const matches = (where: Record<string, unknown>) =>
    row !== null && Object.entries(where).every(([key, value]) => Reflect.get(row!, key) === value);
  function apply(data: Record<string, unknown>) {
    if (!row) throw new Error("missing fixture row");
    for (const [key, value] of Object.entries(data)) {
      if (
        value &&
        typeof value === "object" &&
        "increment" in value &&
        typeof value.increment === "number"
      ) {
        Reflect.set(row, key, Number(Reflect.get(row, key)) + value.increment);
      } else Reflect.set(row, key, value === Prisma.DbNull ? null : value);
    }
    row.updatedAt = new Date();
    return row;
  }
  const updateMany = vi.fn(
    ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (!matches(where) || (loseClaim && data.status === "PROCESSING"))
        return Promise.resolve({ count: 0 });
      apply(data);
      return Promise.resolve({ count: 1 });
    },
  );
  const tx = {
    $queryRaw: vi.fn((_sql: TemplateStringsArray, owner: string) =>
      Promise.resolve(owner === patient ? [{ id: patient }] : []),
    ),
    medicalDocument: {
      findFirst: vi.fn(({ where }: { where: { id: string; patientId: string } }) =>
        Promise.resolve(
          where.id === document && where.patientId === source.patientId ? source : null,
        ),
      ),
    },
    episode: {
      findFirst: vi.fn(({ where }: { where: { id: string; patientId: string } }) =>
        Promise.resolve(
          where.id === episode && where.patientId === context.patientId ? context : null,
        ),
      ),
    },
    medicalSummary: {
      findFirst: vi.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(matches(where) ? row : null),
      ),
      findUnique: vi.fn(() => Promise.resolve(row)),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        row = {
          ...data,
          id: uuid(6),
          generation: 1,
          attempts: 0,
          provider: "google",
          result: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as MedicalSummary;
        return Promise.resolve(row);
      }),
      update: vi.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve(apply(data))),
      updateMany,
    },
  };
  let tail = Promise.resolve();
  const prisma = {
    ...tx,
    $transaction: <T>(fn: (transaction: typeof tx) => Promise<T>) => {
      const running = tail.then(() => fn(tx));
      tail = running.then(
        () => undefined,
        () => undefined,
      );
      return running;
    },
  } as unknown as PrismaClient; // The boundary is a controlled test double, never production input.
  return {
    source,
    context,
    tx,
    updateMany,
    store: new SummaryStore(prisma, "fixture-model"),
    freshStore: () => new SummaryStore(prisma, "fixture-model"),
    row: () => row!,
    loseNextClaim: () => {
      loseClaim = true;
    },
  };
}

describe("summary persistence with an in-memory Prisma boundary", () => {
  it.each(["REPORT", "EPISODE"] as const)(
    "completes and reloads a persisted %s summary without a second job",
    async (scope) => {
      const f = fixture(),
        id = scope === "REPORT" ? document : episode;
      const requested = await f.store.request(patient, scope, id);
      const claim = await f.store.claim(requested.job!);
      expect(claim.state).toBe("claimed");
      if (claim.state !== "claimed") throw new Error("not claimed");
      const result = groundSummarySelection(
        { findings: [{ factId: claim.input.facts[0]!.id }] },
        claim.input,
      );
      expect(await f.store.complete(requested.job!, claim.token, result)).toBe(true);
      expect(await f.freshStore().get(patient, scope, id)).toMatchObject({
        status: "COMPLETED",
        result,
      });
      expect((await f.store.request(patient, scope, id, true)).job).toBeNull();
      expect(f.tx.medicalSummary.create).toHaveBeenCalledOnce();
      expect(f.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            patientId: patient,
            generation: 1,
            status: "PROCESSING",
            claimToken: claim.token,
            inputFingerprint: requested.job!.inputFingerprint,
          }),
        }),
      );
    },
  );
  it("concurrent requests reuse one row/job generation; duplicate delivery cannot claim twice", async () => {
    const f = fixture();
    const [a, b] = await Promise.all([
      f.store.request(patient, "REPORT", document),
      f.store.request(patient, "REPORT", document),
    ]);
    expect(a.job).toEqual(b.job);
    expect(f.tx.medicalSummary.create).toHaveBeenCalledOnce();
    expect((await f.store.claim(a.job!)).state).toBe("claimed");
    expect((await f.store.claim(b.job!)).state).toBe("busy");
  });
  it("treats lost optimistic claim as busy without returning source data", async () => {
    const f = fixture();
    const request = await f.store.request(patient, "REPORT", document);
    f.loseNextClaim();
    expect(await f.store.claim(request.job!)).toEqual({ state: "busy" });
  });
  it("correction during an attempt prevents old publication and makes retrieval stale", async () => {
    const f = fixture();
    const request = await f.store.request(patient, "REPORT", document);
    const claim = await f.store.claim(request.job!);
    if (claim.state !== "claimed") throw new Error("not claimed");
    const result = groundSummarySelection(
      { findings: [{ factId: claim.input.facts[0]!.id }] },
      claim.input,
    );
    f.source.extraction!.measurements[0]!.verifiedNumericValue = 15;
    expect(await f.store.complete(request.job!, claim.token, result)).toBe(false);
    expect(f.row().result).toBeNull();
    expect((await f.store.get(patient, "REPORT", document))?.status).toBe("STALE");
    f.row().updatedAt = old;
    const newer = await f.store.request(patient, "REPORT", document, true);
    expect(newer.job!.generation).toBe(2);
    expect(await f.store.complete(request.job!, claim.token, result)).toBe(false);
    expect(f.row().status).toBe("QUEUED");
  });
  it("membership removal invalidates an episode revision", async () => {
    const f = fixture();
    await f.store.request(patient, "EPISODE", episode);
    f.context.memberships = [];
    expect((await f.store.get(patient, "EPISODE", episode))?.status).toBe("STALE");
  });
  it("fails safely on wrong owner, ineligible sources and queue failure", async () => {
    const f = fixture();
    await expect(f.store.get(uuid(99), "REPORT", document)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    f.source.patientId = uuid(99);
    await expect(f.store.request(patient, "REPORT", document)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    f.source.patientId = patient;
    f.source.documentType = "PRESCRIPTION";
    await expect(f.store.request(patient, "REPORT", document)).rejects.toMatchObject({
      code: "SUMMARY_SOURCE_NOT_ELIGIBLE",
    });
    f.source.documentType = "REPORT";
    const request = await f.store.request(patient, "REPORT", document);
    await f.store.enqueueFailed(request.job!);
    expect(f.row()).toMatchObject({ status: "FAILED", failureCode: "QUEUE_UNAVAILABLE" });
    await expect(f.store.request(patient, "REPORT", document, true)).rejects.toMatchObject({
      code: "SUMMARY_COOLDOWN",
    });
  });
  it("recovers expired leases with a new generation and never accepts the old token", async () => {
    const f = fixture();
    const request = await f.store.request(patient, "REPORT", document);
    const claim = await f.store.claim(request.job!);
    if (claim.state !== "claimed") throw new Error("not claimed");
    f.row().leaseUntil = old;
    f.row().updatedAt = old;
    const recovered = await f.store.request(patient, "REPORT", document, true);
    expect(recovered.job!.generation).toBe(2);
    await f.store.failed(request.job!, claim.token, "OLD_FAILURE", false);
    expect(f.row().status).toBe("QUEUED");
  });
  it("recovers a long-stranded queued job and enforces the claim attempt ceiling", async () => {
    const f = fixture();
    await f.store.request(patient, "REPORT", document);
    f.row().updatedAt = old;
    const recovered = await f.store.request(patient, "REPORT", document, true);
    expect(recovered.job!.generation).toBe(2);
    f.row().attempts = 4;
    expect((await f.store.claim(recovered.job!)).state).toBe("obsolete");
    expect(f.row()).toMatchObject({ status: "FAILED", failureCode: "ATTEMPT_LIMIT" });
  });
  it("preserves deliberate null corrections instead of raw AI fallback", () => {
    const f = fixture();
    f.source.extraction!.measurements[0]!.verifiedNumericValue = null;
    expect(reviewedSources([f.source])[0]!.extraction!.measurements[0]!.numericValue).toBeNull();
  });
  it("reports missing summary schema as an explicit operational gate", async () => {
    const f = fixture();
    f.tx.medicalSummary.findFirst.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("missing table", {
        code: "P2021",
        clientVersion: "fixture",
      }),
    );
    await expect(f.store.get(patient, "REPORT", document)).rejects.toMatchObject({
      code: "SUMMARY_SCHEMA_PENDING",
      status: 503,
    });
  });
  it("canonicalizes object keys and changes the fingerprint with relevant inputs", () => {
    expect(stableFingerprint({ b: 2, a: 1 })).toBe(stableFingerprint({ a: 1, b: 2 }));
    expect(stableFingerprint({ a: 1 })).not.toBe(stableFingerprint({ a: 2 }));
    expect(stableFingerprint({ method: null, specimen: null, version: 1 })).not.toBe(
      stableFingerprint({ method: "Method A", specimen: "Serum", version: 2 }),
    );
  });
});
