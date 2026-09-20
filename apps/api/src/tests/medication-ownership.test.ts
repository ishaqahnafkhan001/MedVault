import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { Medication, PrismaClient } from "@medvault/database";
import { updateMedicationSchema } from "@medvault/shared";
import { createApp } from "../app.js";
import { PrismaAppService } from "../services/prisma-service.js";
import type { PrivateStorage } from "../services/storage.js";
import type { ReportQueue } from "../services/queue.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const patientId = id(1);
const authUserId = id(90);
const medicationId = id(2);
const oldPrescriptionId = id(3);
const replacementId = id(4);
const foreignPrescriptionId = id(5);
const reportId = id(6);
const missingId = id(7);

// Real HTTP/middleware/Zod/service path, with synthetic Auth and stateful Prisma doubles.
// This intentionally does not connect to hosted PostgreSQL, Supabase or queues.
function fixture() {
  let row: Medication = {
    id: medicationId,
    patientId,
    name: "Synthetic original",
    resolvedGeneric: null,
    resolvedStatus: "UNRESOLVED",
    strength: null,
    doseAmount: null,
    doseUnit: null,
    formulation: null,
    route: null,
    startDate: null,
    endDate: null,
    status: "PAUSED",
    notes: "Synthetic original note",
    prescriptionId: oldPrescriptionId,
    createdAt: new Date("2026-09-10T00:00:00Z"),
    updatedAt: new Date("2026-09-10T00:00:00Z"),
  };
  const documents = [
    { id: oldPrescriptionId, patientId, documentType: "PRESCRIPTION" },
    { id: replacementId, patientId, documentType: "PRESCRIPTION" },
    { id: foreignPrescriptionId, patientId: id(99), documentType: "PRESCRIPTION" },
    { id: reportId, patientId, documentType: "REPORT" },
  ];
  const patient = {
    upsert: vi.fn(({ where }: { where: { authUserId: string } }) =>
      Promise.resolve({ id: where.authUserId === authUserId ? patientId : id(99) }),
    ),
  };
  const medicalDocument = {
    findFirst: vi.fn(
      ({ where }: { where: { id: string; patientId?: string; documentType?: string } }) =>
        Promise.resolve(
          documents.find(
            (doc) =>
              doc.id === where.id &&
              (where.patientId === undefined || doc.patientId === where.patientId) &&
              (where.documentType === undefined || doc.documentType === where.documentType),
          ) ?? null,
        ),
    ),
  };
  const medication = {
    findFirst: vi.fn(({ where }: { where: { id: string; patientId?: string } }) =>
      Promise.resolve(
        row.id === where.id && (where.patientId === undefined || row.patientId === where.patientId)
          ? { ...row }
          : null,
      ),
    ),
    create: vi.fn(({ data }: { data: Partial<Medication> }) => {
      row = { ...row, ...data };
      return Promise.resolve({ ...row });
    }),
    update: vi.fn(({ data }: { data: Partial<Medication> }) => {
      row = { ...row, ...data, updatedAt: new Date("2026-09-10T01:00:00Z") };
      return Promise.resolve({ ...row });
    }),
  };
  const service = new PrismaAppService(
    { patient, medicalDocument, medication } as unknown as PrismaClient,
    {} as PrivateStorage,
    {} as ReportQueue,
    300,
  );
  const app = createApp({
    service,
    authVerifier: {
      verify: (token) =>
        Promise.resolve(
          token === "synthetic-a"
            ? { id: authUserId }
            : token === "synthetic-b"
              ? { id: id(91) }
              : null,
        ),
    },
    webOrigin: "http://localhost:3000",
    maxUploadBytes: 1024,
  });
  return { app, service, patient, medicalDocument, medication, snapshot: () => ({ ...row }) };
}

const invalidLinks = [
  ["foreign prescription", foreignPrescriptionId],
  ["owned report", reportId],
  ["missing document", missingId],
] as const;

describe("medication prescription ownership at the Prisma service boundary", () => {
  it("replaces an owned prescription and reloads the saved link", async () => {
    const f = fixture();
    const saved = await f.service.updateMedication(authUserId, medicationId, {
      name: "Synthetic replacement",
      prescriptionId: replacementId,
    });
    expect(saved).toMatchObject({ prescriptionId: replacementId, status: "PAUSED" });
    expect(await f.service.getMedication(authUserId, medicationId)).toEqual(saved);
    expect(f.patient.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { authUserId } }),
    );
    expect(f.medicalDocument.findFirst).toHaveBeenCalledWith({
      where: { id: replacementId, patientId, documentType: "PRESCRIPTION" },
      select: { id: true },
    });
  });

  it.each(invalidLinks)(
    "rejects %s on edit without changing any medication fields",
    async (_, prescriptionId) => {
      const f = fixture();
      const before = f.snapshot();
      await expect(
        f.service.updateMedication(authUserId, medicationId, {
          name: "Must not persist",
          status: "ARCHIVED",
          notes: "Must not replace the note",
          prescriptionId,
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: "INVALID_PRESCRIPTION",
        message: "Prescription not found.",
      });
      expect(f.medication.update).not.toHaveBeenCalled();
      expect(f.snapshot()).toEqual(before);
    },
  );

  it.each(invalidLinks)("preserves create rejection for %s", async (_, prescriptionId) => {
    const f = fixture();
    await expect(
      f.service.createMedication(authUserId, { name: "Synthetic new", prescriptionId }),
    ).rejects.toMatchObject({ status: 400, code: "INVALID_PRESCRIPTION" });
    expect(f.medication.create).not.toHaveBeenCalled();
  });

  it.each([undefined, null])(
    "preserves PUT unlink semantics for prescriptionId=%s",
    async (prescriptionId) => {
      const f = fixture();
      const input = updateMedicationSchema.parse({ name: "Synthetic unlinked", prescriptionId });
      expect(await f.service.updateMedication(authUserId, medicationId, input)).toMatchObject({
        prescriptionId: null,
        status: "PAUSED",
      });
      expect(f.medicalDocument.findFirst).not.toHaveBeenCalled();
    },
  );

  it("keeps medication ownership denial ahead of prescription validation", async () => {
    const f = fixture();
    const before = f.snapshot();
    await expect(
      f.service.updateMedication(id(91), medicationId, {
        name: "Must not persist",
        prescriptionId: replacementId,
      }),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(f.medicalDocument.findFirst).not.toHaveBeenCalled();
    expect(f.medication.update).not.toHaveBeenCalled();
    expect(f.snapshot()).toEqual(before);
  });
});

describe("medication HTTP contract with the real service", () => {
  it.each(["post", "put"] as const)("%s accepts an owned prescription", async (method) => {
    const f = fixture();
    const operation =
      method === "post"
        ? request(f.app).post("/v1/medications")
        : request(f.app).put(`/v1/medications/${medicationId}`);
    const response = await operation
      .set("Authorization", "Bearer synthetic-a")
      .send({ name: "Synthetic medicine", prescriptionId: replacementId });
    expect(response.status).toBe(method === "post" ? 201 : 200);
    expect(response.body.medication.prescriptionId).toBe(replacementId);
  });

  it.each(invalidLinks)(
    "PUT rejects %s with a safe envelope and no write",
    async (_, prescriptionId) => {
      const f = fixture();
      const before = f.snapshot();
      const response = await request(f.app)
        .put(`/v1/medications/${medicationId}`)
        .set("Authorization", "Bearer synthetic-a")
        .send({ name: "Must not persist", prescriptionId, patientId: id(99), authUserId: id(91) });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: {
          code: "INVALID_PRESCRIPTION",
          message: "Prescription not found.",
          requestId: expect.any(String),
        },
      });
      expect(f.medication.update).not.toHaveBeenCalled();
      expect(f.snapshot()).toEqual(before);
    },
  );

  it.each([{}, { prescriptionId: null }])("PUT supports unlink input %j", async (link) => {
    const f = fixture();
    const response = await request(f.app)
      .put(`/v1/medications/${medicationId}`)
      .set("Authorization", "Bearer synthetic-a")
      .send({ name: "Synthetic unlinked", ...link });
    expect(response.status).toBe(200);
    expect(response.body.medication.prescriptionId).toBeNull();
    expect(f.medicalDocument.findFirst).not.toHaveBeenCalled();
  });

  it.each(["not-a-uuid", "", [replacementId], { id: replacementId }])(
    "rejects malformed link %j before service access",
    async (prescriptionId) => {
      const f = fixture();
      const response = await request(f.app)
        .put(`/v1/medications/${medicationId}`)
        .set("Authorization", "Bearer synthetic-a")
        .send({ name: "Synthetic medicine", prescriptionId });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(f.patient.upsert).not.toHaveBeenCalled();
      expect(f.medication.update).not.toHaveBeenCalled();
    },
  );

  it("ignores a forged patient ID and denies a second authenticated account", async () => {
    const f = fixture();
    const response = await request(f.app)
      .put(`/v1/medications/${medicationId}`)
      .set("Authorization", "Bearer synthetic-b")
      .send({ name: "Must not persist", prescriptionId: replacementId, patientId });
    expect(response.status).toBe(404);
    expect(f.medication.update).not.toHaveBeenCalled();
    expect(f.medicalDocument.findFirst).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated edits without accessing patient data", async () => {
    const f = fixture();
    const response = await request(f.app)
      .put(`/v1/medications/${medicationId}`)
      .set("Authorization", "Bearer invalid-synthetic")
      .send({ name: "Must not persist", prescriptionId: replacementId });
    expect(response.status).toBe(401);
    expect(f.patient.upsert).not.toHaveBeenCalled();
    expect(f.medication.update).not.toHaveBeenCalled();
  });
});
