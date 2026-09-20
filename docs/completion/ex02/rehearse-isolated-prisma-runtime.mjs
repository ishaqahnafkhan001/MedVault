// One-time Prisma/SummaryStore proof against the already migrated local restore.
// Uses synthetic rows only, retains none, and never loads repository environments.
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
  Client,
  runRoot,
  localConfig,
  assertLocal,
  protection,
  invariant,
  saveJson,
  safeFailure,
} from "./recovery-common.mjs";

const folder = `${runRoot}/snapshot-20260912T055058Z`;
const database = "medvault_ex02_restore_20260912";
const migrationEvidence = `${folder}/migration-rehearsal-result.json`;
const evidencePath = `${folder}/prisma-runtime-rehearsal-result.json`;
let admin;
let prisma;
let fresh;
let patientId;
let stage = "preflight";

try {
  invariant(
    process.argv.length === 3 && process.argv[2] === "--run-reviewed-prisma-rehearsal",
    "EXPLICIT_PRISMA_REHEARSAL_FLAG_REQUIRED",
  );
  invariant(!existsSync(evidencePath), "PRISMA_REHEARSAL_ALREADY_RECORDED_INSPECT_FIRST");
  const prior = JSON.parse(readFileSync(migrationEvidence, "utf8"));
  invariant(
    prior.result === "PASS_LOCAL_MIGRATION_AND_SECURITY_REHEARSAL" &&
      prior.hostedMutation === false &&
      prior.syntheticRowsRetained === false,
    "MIGRATION_REHEARSAL_EVIDENCE_REQUIRED",
  );
  protection();
  const [{ createPrismaClient, SummaryStore }, { groundSummarySelection }] = await Promise.all([
    import("../../../packages/database/dist/index.js"),
    import("../../../packages/shared/dist/index.js"),
  ]);
  admin = new Client(localConfig(database));
  await admin.connect();
  await assertLocal(admin, database);
  const {
    rows: [role],
  } = await admin.query(
    "SELECT rolcanlogin,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname='medvault_runtime'",
  );
  invariant(role && !role.rolcanlogin && role.rolbypassrls, "DISABLED_RUNTIME_ROLE_REQUIRED");

  stage = "temporary-local-login";
  const password = randomBytes(32).toString("hex");
  await admin.query(
    `ALTER ROLE medvault_runtime LOGIN PASSWORD '${password}' VALID UNTIL '${new Date(Date.now() + 15 * 60_000).toISOString()}'`,
  );
  const runtimeUrl = `postgresql://medvault_runtime:${encodeURIComponent(password)}@127.0.0.1:55441/${database}`;
  prisma = createPrismaClient(runtimeUrl);
  fresh = createPrismaClient(runtimeUrl);

  stage = "prisma-create-and-summary";
  patientId = randomUUID();
  const documentId = randomUUID();
  const measurementId = randomUUID();
  await prisma.patient.create({
    data: {
      id: patientId,
      authUserId: randomUUID(),
      profile: { create: { fullName: "Synthetic EX-02 Prisma fixture" } },
      documents: {
        create: {
          id: documentId,
          documentType: "REPORT",
          originalFilename: "synthetic-no-file.pdf",
          mimeType: "application/pdf",
          fileSize: 1,
          storagePath: `synthetic-ex02-prisma/${documentId}`,
          checksumSha256: "c".repeat(64),
          documentVersion: 1,
          documentDate: new Date("2026-01-01T00:00:00Z"),
          processingStatus: "VERIFIED",
          verificationStatus: "VERIFIED",
          extraction: {
            create: {
              status: "VERIFIED",
              documentVersion: 1,
              documentReportType: "Synthetic",
              extractedTestName: "Synthetic",
              normalizedTestName: "synthetic",
              extractedCategory: "OTHER",
              provider: "fixture",
              model: "fixture",
              schemaVersion: "fixture",
              rawOutput: {},
              analyzedAt: new Date(),
              verifiedAt: new Date(),
              measurements: {
                create: {
                  id: measurementId,
                  sortOrder: 0,
                  name: "Synthetic",
                  normalizedName: "synthetic",
                  verifiedName: "Synthetic",
                  verifiedNormalizedName: "synthetic",
                  verifiedNumericValue: 1,
                  verifiedUnit: "unit",
                  verifiedReferenceRange: "0-2",
                },
              },
            },
          },
        },
      },
    },
  });
  const store = new SummaryStore(prisma, "fixture-model");
  const freshStore = new SummaryStore(fresh, "fixture-model");
  const requested = await store.request(patientId, "REPORT", documentId);
  invariant(requested.job, "SUMMARY_JOB_NOT_CREATED");
  const claim = await store.claim(requested.job);
  invariant(claim.state === "claimed", "SUMMARY_JOB_NOT_CLAIMED");
  const result = groundSummarySelection(
    { findings: [{ factId: claim.input.facts[0].id }] },
    claim.input,
  );
  invariant(await store.complete(requested.job, claim.token, result), "SUMMARY_PUBLICATION_FAILED");
  invariant(
    (await freshStore.get(patientId, "REPORT", documentId))?.status === "COMPLETED",
    "FRESH_PRISMA_RELOAD_FAILED",
  );

  stage = "prisma-trigger-and-cleanup";
  await fresh.reportMeasurement.update({
    where: { id: measurementId },
    data: { verifiedNumericValue: 2 },
  });
  invariant(
    (await freshStore.get(patientId, "REPORT", documentId))?.status === "STALE",
    "PRISMA_TRIGGER_INVALIDATION_FAILED",
  );
  await prisma.patient.delete({ where: { id: patientId } });
  invariant(
    (await fresh.patient.findUnique({ where: { id: patientId } })) === null,
    "PRISMA_SYNTHETIC_CLEANUP_FAILED",
  );
  patientId = undefined;
  await Promise.all([prisma.$disconnect(), fresh.$disconnect()]);
  prisma = undefined;
  fresh = undefined;
  await admin.query("ALTER ROLE medvault_runtime NOLOGIN PASSWORD NULL VALID UNTIL 'infinity'");

  stage = "final-verification";
  const {
    rows: [disabled],
  } = await admin.query(
    "SELECT NOT rolcanlogin AS disabled FROM pg_catalog.pg_roles WHERE rolname='medvault_runtime'",
  );
  invariant(disabled?.disabled === true, "RUNTIME_ROLE_NOT_DISABLED");
  await admin.query("CHECKPOINT");
  protection();
  const evidence = {
    result: "PASS_LOCAL_PRISMA_RUNTIME_REHEARSAL",
    completedAt: new Date().toISOString(),
    database,
    prismaNonOwnerRole: "medvault_runtime",
    createReloadUpdateDelete: true,
    summaryRequestClaimComplete: true,
    triggerInvalidation: true,
    freshPrismaClientReload: true,
    syntheticRowsRetained: false,
    runtimeRoleReturnedToNoLogin: true,
    hostedConnections: 0,
    hostedMutation: false,
    redisStorageGeminiMutation: false,
  };
  saveJson(evidencePath, evidence);
  protection();
  console.log(JSON.stringify(evidence));
} catch (error) {
  safeFailure(error, stage);
} finally {
  await Promise.allSettled([prisma?.$disconnect(), fresh?.$disconnect()]);
  if (admin) {
    if (patientId)
      await admin.query("DELETE FROM public.patients WHERE id=$1", [patientId]).catch(() => {});
    await admin
      .query("ALTER ROLE medvault_runtime NOLOGIN PASSWORD NULL VALID UNTIL 'infinity'")
      .catch(() => {});
    await admin.end().catch(() => {});
  }
}
