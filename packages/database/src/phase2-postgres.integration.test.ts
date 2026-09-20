import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "pg";
import { expect, it } from "vitest";
import { groundSummarySelection } from "@medvault/shared";
import { createPrismaClient, SummaryStore, lockSummaryPatient } from "./index.js";

const target = process.env.MEDVAULT_PHASE2_TEST_DATABASE_URL;
// Never use DATABASE_URL as fallback. This test creates schema in an EMPTY,
// dedicated, loopback-only synthetic database. It must not run on Supabase.
it.skipIf(!target)(
  "rehearses migrations, real PostgreSQL invalidation/locks, reload and ownership",
  async () => {
    if (!target) throw new Error("Explicit synthetic database required");
    const url = new URL(target);
    if (
      url.hostname !== "127.0.0.1" ||
      !/^\/medvault_phase2_synthetic(?:_\d{14})?$/.test(url.pathname)
    )
      throw new Error("Refusing non-fixture database");
    const sql = new Client({
      connectionString: target,
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
    });
    const first = createPrismaClient(target),
      second = createPrismaClient(target);
    try {
      await sql.connect();
      const inventory = await sql.query<{ count: number }>(
        "SELECT count(*)::int FROM pg_tables WHERE schemaname='public'",
      );
      if (inventory.rows[0]?.count !== 0)
        throw new Error("Fixture database must be empty; this test never resets it");
      for (const role of ["anon", "authenticated"]) {
        const existing = await sql.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role]);
        if (!existing.rowCount) await sql.query(`CREATE ROLE ${role} NOLOGIN`);
      }
      for (const migration of [
        "20260807000000_initial",
        "20260908000000_capture_existing_episode_medication_schema",
        "20260908010000_reviewed_medical_summaries",
      ]) {
        if (migration.includes("reviewed_medical"))
          await sql.query(
            "GRANT ALL ON public.episodes,public.episode_memberships,public.episode_analyses TO anon,authenticated",
          );
        await sql.query(
          await readFile(
            resolve(import.meta.dirname, "../prisma/migrations", migration, "migration.sql"),
            "utf8",
          ),
        );
      }
      const patient = await first.patient.create({
        data: { authUserId: "00000000-0000-4000-8000-000000000001" },
      });
      const other = await first.patient.create({
        data: { authUserId: "00000000-0000-4000-8000-000000000002" },
      });
      const makeReport = (n: number) =>
        first.medicalDocument.create({
          data: {
            patientId: patient.id,
            documentType: "REPORT",
            originalFilename: "synthetic-no-file.pdf",
            mimeType: "application/pdf",
            fileSize: 1,
            storagePath: `synthetic-only/${n}`,
            checksumSha256: String(n).padStart(64, "0"),
            documentVersion: 1,
            documentDate: new Date(`2026-08-${n === 1 ? "01" : "12"}T00:00:00Z`),
            processingStatus: "VERIFIED",
            verificationStatus: "VERIFIED",
            extraction: {
              create: {
                documentVersion: 1,
                status: "VERIFIED",
                documentReportType: "Synthetic fixture",
                extractedTestName: "CBC",
                normalizedTestName: "cbc",
                extractedCategory: "HEMATOLOGY",
                provider: "fixture",
                model: "fixture",
                schemaVersion: "fixture",
                rawOutput: {},
                analyzedAt: new Date(),
                verifiedAt: new Date(),
                measurements: {
                  create: {
                    sortOrder: 0,
                    name: "Hb",
                    normalizedName: "hemoglobin",
                    numericValue: 14,
                    unit: "g/dL",
                    verifiedName: "Hb",
                    verifiedNormalizedName: "hemoglobin",
                    verifiedNumericValue: 14,
                    verifiedUnit: "g/dL",
                    verifiedReferenceRange: "12-16",
                  },
                },
              },
            },
          },
          include: { extraction: { include: { measurements: true } } },
        });
      const a = await makeReport(1),
        b = await makeReport(2);
      const episode = await first.episode.create({
        data: {
          patientId: patient.id,
          title: "Synthetic CBC series",
          memberships: { create: [{ documentId: a.id }, { documentId: b.id }] },
        },
      });
      const store = new SummaryStore(first, "fixture-model"),
        fresh = new SummaryStore(second, "fixture-model");
      const [request, duplicate] = await Promise.all([
        store.request(patient.id, "REPORT", a.id),
        fresh.request(patient.id, "REPORT", a.id),
      ]);
      expect(request.job).toEqual(duplicate.job);
      const claim = await store.claim(request.job!);
      if (claim.state !== "claimed") throw new Error("claim failed");
      expect((await fresh.claim(request.job!)).state).toBe("busy");
      const result = groundSummarySelection(
        { findings: [{ factId: claim.input.facts[0]!.id }] },
        claim.input,
      );
      // Simulate patient correction while the original model call is outstanding.
      await second.reportMeasurement.update({
        where: { id: a.extraction!.measurements[0]!.id },
        data: { verifiedNumericValue: 15 },
      });
      expect(await store.complete(request.job!, claim.token, result)).toBe(false);
      expect((await fresh.get(patient.id, "REPORT", a.id))?.status).toBe("STALE");
      await expect(fresh.get(other.id, "REPORT", a.id)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      // Advance only this synthetic row's cooldown; no sleep or production override.
      await sql.query(
        "UPDATE public.medical_summaries SET updated_at=(now() AT TIME ZONE 'UTC')-interval '1 minute' WHERE id=$1",
        [request.analysis.id],
      );
      const next = await store.request(patient.id, "REPORT", a.id, true);
      expect(next.job!.generation).toBe(2);
      const nextClaim = await store.claim(next.job!);
      if (nextClaim.state !== "claimed") throw new Error("second claim failed");
      const current = groundSummarySelection(
        { findings: [{ factId: nextClaim.input.facts[0]!.id }] },
        nextClaim.input,
      );
      expect(await store.complete(next.job!, nextClaim.token, current)).toBe(true);
      expect((await fresh.get(patient.id, "REPORT", a.id))?.result).toEqual(current);
      expect((await store.request(patient.id, "REPORT", a.id, true)).job).toBeNull();
      const episodeRequest = await store.request(patient.id, "EPISODE", episode.id);
      const episodeClaim = await store.claim(episodeRequest.job!);
      if (episodeClaim.state !== "claimed") throw new Error("episode claim failed");
      const episodeResult = groundSummarySelection(
        { findings: [{ factId: episodeClaim.input.facts[0]!.id }] },
        episodeClaim.input,
      );
      expect(await store.complete(episodeRequest.job!, episodeClaim.token, episodeResult)).toBe(
        true,
      );
      expect((await fresh.get(patient.id, "EPISODE", episode.id))?.status).toBe("COMPLETED");
      await second.episodeMembership.delete({
        where: { episodeId_documentId: { episodeId: episode.id, documentId: b.id } },
      });
      expect((await fresh.get(patient.id, "EPISODE", episode.id))?.status).toBe("STALE");
      // Verify the actual source trigger waits behind the publication's patient-row fence.
      let release!: () => void, locked!: () => void;
      const ready = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const holder = first.$transaction(
        async (tx) => {
          await lockSummaryPatient(tx, patient.id);
          locked();
          await gate;
        },
        { timeout: 5000 },
      );
      await ready;
      let finished = false;
      const writer = second.reportMeasurement
        .update({
          where: { id: a.extraction!.measurements[0]!.id },
          data: { verifiedNumericValue: 16 },
        })
        .then(() => {
          finished = true;
        });
      try {
        await delay(100);
        expect(finished).toBe(false);
      } finally {
        release();
      }
      await Promise.all([holder, writer]);
      expect(finished).toBe(true);
      const guards = await sql.query<{
        relrowsecurity: boolean;
        anon_select: boolean;
        auth_select: boolean;
      }>(
        "SELECT c.relrowsecurity,has_table_privilege('anon',c.oid,'SELECT') AS anon_select,has_table_privilege('authenticated',c.oid,'SELECT') AS auth_select FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('episodes','episode_memberships','episode_analyses','medical_summaries')",
      );
      expect(guards.rows).toHaveLength(4);
      expect(guards.rows.every((r) => r.relrowsecurity && !r.anon_select && !r.auth_select)).toBe(
        true,
      );
      for (const role of ["anon", "authenticated"]) {
        await sql.query(`SET ROLE ${role}`);
        await expect(
          sql.query("SELECT count(*) FROM public.medical_summaries"),
        ).rejects.toMatchObject({ code: "42501" });
        await sql.query("RESET ROLE");
      }
      expect(await first.medication.count()).toBe(0); // Preserved models are still queryable.
    } finally {
      await Promise.allSettled([first.$disconnect(), second.$disconnect(), sql.end()]);
    }
  },
  30000,
);
