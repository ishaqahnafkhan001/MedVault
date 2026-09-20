import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@medvault/database";
import { PrismaAppService } from "../services/prisma-service.js";
import type { PrivateStorage } from "../services/storage.js";
import type { ReportQueue } from "../services/queue.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("real Phase 2 service authorization with a mocked Prisma boundary", () => {
  function fixture() {
    const patient = { upsert: vi.fn().mockResolvedValue({ id: id(1) }) };
    const medicalDocument = {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    };
    const episode = {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    const episodeMembership = { createMany: vi.fn(), deleteMany: vi.fn() };
    const tx = {
      patient,
      medicalDocument,
      episode,
      episodeMembership,
      $queryRaw: vi.fn().mockResolvedValue([{ id: id(1) }]),
    };
    const prisma = {
      ...tx,
      $transaction: <T>(fn: (value: typeof tx) => Promise<T>) => fn(tx),
    } as unknown as PrismaClient;
    const enqueueSummary = vi.fn();
    const service = new PrismaAppService(
      prisma,
      {} as PrivateStorage,
      { enqueueSummary } as unknown as ReportQueue,
      300,
    );
    return { service, ...tx, enqueueSummary };
  }
  it("derives ownership from verified auth and rejects foreign episode operations", async () => {
    const f = fixture();
    for (const call of [
      () => f.service.getEpisode(id(90), id(2)),
      () => f.service.getEpisodeTrend(id(90), id(2)),
      () => f.service.updateEpisode(id(90), id(2), { title: "Synthetic title" }),
      () => f.service.deleteEpisode(id(90), id(2)),
      () => f.service.addDocumentsToEpisode(id(90), id(2), [id(3)]),
      () => f.service.removeDocumentFromEpisode(id(90), id(2), id(3)),
      () => f.service.getReportSummary(id(90), id(3)),
      () => f.service.requestReportSummary(id(90), id(3), { forceRegenerate: false }),
    ])
      await expect(call()).rejects.toMatchObject({ status: 404 });
    expect(f.patient.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { authUserId: id(90) } }),
    );
    expect(f.episode.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: id(2), patientId: id(1) } }),
    );
    expect(f.episodeMembership.createMany).not.toHaveBeenCalled();
    expect(f.episodeMembership.deleteMany).not.toHaveBeenCalled();
    expect(f.enqueueSummary).not.toHaveBeenCalled();
  });
  it("rejects an array containing foreign report IDs without partial membership writes", async () => {
    const f = fixture();
    f.episode.findFirst.mockResolvedValue({ id: id(2), patientId: id(1), memberships: [] });
    f.medicalDocument.findMany.mockResolvedValue([{ id: id(3), patientId: id(1) }]);
    await expect(
      f.service.addDocumentsToEpisode(id(90), id(2), [id(3), id(99)]),
    ).rejects.toMatchObject({ status: 404 });
    expect(f.medicalDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [id(3), id(99)] }, patientId: id(1) } }),
    );
    expect(f.episodeMembership.createMany).not.toHaveBeenCalled();
  });
  it("refuses stale extraction versions before verification writes", async () => {
    const f = fixture();
    f.medicalDocument.findFirst.mockResolvedValue({
      id: id(3),
      documentVersion: 2,
      extraction: { documentVersion: 1 },
    });
    await expect(
      f.service.verifyReport(id(90), id(3), {
        testName: "CBC",
        reportDate: "2026-08-01",
        hospitalName: null,
        category: "HEMATOLOGY",
        measurements: [],
      }),
    ).rejects.toMatchObject({ code: "SOURCE_VERSION_MISMATCH" });
    expect(f.medicalDocument.update).not.toHaveBeenCalled();
  });
  it("rejects duplicate measurement IDs without writing corrections", async () => {
    const f = fixture();
    f.medicalDocument.findFirst.mockResolvedValue({
      id: id(3),
      documentVersion: 1,
      processingStatus: "VERIFIED",
      verificationStatus: "VERIFIED",
      extraction: {
        documentVersion: 1,
        status: "VERIFIED",
        measurements: [{ id: id(4) }, { id: id(5) }],
      },
    });
    const measurement = {
      id: id(4),
      name: "Hb",
      normalizedName: "hemoglobin",
      numericValue: 14,
      textValue: null,
      unit: "g/dL",
      referenceRange: null,
      sourceFlag: null,
    };
    await expect(
      f.service.verifyReport(id(90), id(3), {
        testName: "CBC",
        reportDate: "2026-08-01",
        hospitalName: null,
        category: "HEMATOLOGY",
        measurements: [measurement, measurement],
      }),
    ).rejects.toMatchObject({ code: "MEASUREMENT_MISMATCH" });
    expect(f.medicalDocument.update).not.toHaveBeenCalled();
  });
  it("scopes global measurement history to the authenticated patient and clinical dates", async () => {
    const f = fixture();
    await expect(
      f.service.getMeasurementHistory(id(90), {
        metric: "Hb",
        dateFrom: "2026-08-01",
        dateTo: "2026-08-31",
      }),
    ).resolves.toMatchObject({ series: [], latestMetrics: [], limited: false });
    expect(f.medicalDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          patientId: id(1),
          documentType: "REPORT",
          processingStatus: "VERIFIED",
          verificationStatus: "VERIFIED",
          documentDate: {
            gte: new Date("2026-08-01T00:00:00.000Z"),
            lte: new Date("2026-08-31T00:00:00.000Z"),
          },
        }),
      }),
    );
  });
});
