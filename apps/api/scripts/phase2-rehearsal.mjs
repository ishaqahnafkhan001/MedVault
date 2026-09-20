// Explicit synthetic PostgreSQL + isolated real Redis queue + MOCK Gemini.
// Run only after building packages and the database migration rehearsal. Never loads .env.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import request from "supertest";
import Redis from "ioredis";
import { Queue, Worker } from "bullmq";
import { createPrismaClient, SummaryStore } from "@medvault/database";
import {
  EPISODE_SUMMARY_QUEUE,
  SUMMARY_JOB,
  summaryResponseSchema,
  episodeResponseSchema,
  episodeCreateResponseSchema,
  episodeAddResponseSchema,
  episodeTrendResponseSchema,
  reportDetailResponseSchema,
} from "@medvault/shared";
import { createApp } from "../dist/app.js";
import { PrismaAppService } from "../dist/services/prisma-service.js";
import { BullMqReportQueue } from "../dist/services/queue.js";
import { EpisodeSummaryProcessor } from "../../worker/dist/episode-processor.js";
import { MockEpisodeSummaryAdapter } from "../../../packages/ai/dist/index.js";

const fixtureUrl = process.env.MEDVAULT_PHASE2_TEST_DATABASE_URL;
if (!fixtureUrl || !process.env.MEDVAULT_PHASE2_TEST_REDIS_URL)
  throw new Error("Explicit fixture DB and test Redis URL required; no application fallback");
const url = new URL(fixtureUrl);
if (url.hostname !== "127.0.0.1" || !/^\/medvault_phase2_synthetic_\d{14}$/.test(url.pathname))
  throw new Error("Refusing non-fixture database");
const prefix = `medvault-phase2-synthetic-${randomUUID()}`;
const prisma = createPrismaClient(fixtureUrl),
  fresh = createPrismaClient(fixtureUrl);
const redis = new Redis(process.env.MEDVAULT_PHASE2_TEST_REDIS_URL, {
  maxRetriesPerRequest: null,
  connectTimeout: 5000,
  retryStrategy: () => null,
});
redis.on("error", () => {});
const producer = new BullMqReportQueue(process.env.MEDVAULT_PHASE2_TEST_REDIS_URL, prefix);
const inspector = new Queue(EPISODE_SUMMARY_QUEUE, { connection: redis, prefix });
process.env.GEMINI_MODEL = "mock-gemini"; // Process-only, never writes root .env.
const processor = new EpisodeSummaryProcessor(
  new SummaryStore(prisma, "mock-gemini"),
  new MockEpisodeSummaryAdapter(),
);
let processed = 0;
const worker = new Worker(
  EPISODE_SUMMARY_QUEUE,
  async (job) => {
    assert.equal(job.name, SUMMARY_JOB);
    const result = await processor.process(job.data, { number: job.attemptsMade + 1, maximum: 4 });
    if (result === "processed") processed++;
    return result;
  },
  { connection: redis, prefix, concurrency: 2 },
);
worker.on("error", () => {});
const authA = randomUUID(),
  authB = randomUUID();
const storage = new Proxy(
  {},
  {
    get: () => () => {
      throw new Error("Storage outside rehearsal");
    },
  },
);
const app = (db) =>
  createApp({
    service: new PrismaAppService(db, storage, producer, 300),
    authVerifier: {
      verify: async (token) =>
        token === "fixture-a" ? { id: authA } : token === "fixture-b" ? { id: authB } : null,
    },
    webOrigin: "http://localhost:3000",
    maxUploadBytes: 1000,
    rateLimitMax: 10000,
  });
const firstApp = app(prisma),
  freshApp = app(fresh);
const send = (server, method, path, body, token = "fixture-a") => {
  const call = request(server)[method](path).set("Authorization", `Bearer ${token}`);
  return body === undefined ? call : call.send(body);
};
const jobIds = [];
async function completeThroughApi(path, resultPath) {
  const response = await send(firstApp, "post", path, {});
  assert.equal(response.status, 202);
  const requested = summaryResponseSchema.parse(response.body).analysis;
  assert.ok(requested);
  const jobId = `summary-${requested.id}-1`;
  jobIds.push(jobId);
  assert.ok(await inspector.getJob(jobId));
  let saved;
  for (let attempt = 0; attempt < 50; attempt++) {
    const get = await send(freshApp, "get", resultPath(requested.id));
    assert.equal(get.status, 200);
    saved = summaryResponseSchema.parse(get.body).analysis;
    if (saved?.status === "COMPLETED") break;
    await delay(100);
  }
  assert.equal(saved?.status, "COMPLETED");
  assert.equal(saved?.model, "mock-gemini");
  assert.equal(
    (await send(freshApp, "get", resultPath(requested.id), undefined, "fixture-b")).status,
    404,
  );
  const duplicate = await send(firstApp, "post", path, {});
  assert.equal(duplicate.status, 202);
  assert.equal(summaryResponseSchema.parse(duplicate.body).analysis?.id, saved.id);
  return saved;
}
try {
  await Promise.race([
    worker.waitUntilReady(),
    delay(8000).then(() => {
      throw new Error("Redis unavailable");
    }),
  ]);
  const owner = await prisma.patient.create({ data: { authUserId: authA } });
  const reports = [];
  for (const day of [12, 1]) {
    // Out-of-order uploads, 11-day CBC window.
    reports.push(
      await prisma.medicalDocument.create({
        data: {
          patientId: owner.id,
          documentType: "REPORT",
          originalFilename: "synthetic-no-upload.pdf",
          mimeType: "application/pdf",
          fileSize: 1,
          storagePath: `synthetic-only/${randomUUID()}`,
          checksumSha256: String(day).padStart(64, "0"),
          processingStatus: "VERIFIED",
          verificationStatus: "VERIFIED",
          documentVersion: 1,
          documentDate: new Date(`2026-08-${String(day).padStart(2, "0")}T00:00:00Z`),
          extraction: {
            create: {
              documentVersion: 1,
              status: "VERIFIED",
              documentReportType: "CBC",
              extractedTestName: "CBC",
              normalizedTestName: "cbc",
              extractedCategory: "HEMATOLOGY",
              provider: "fixture",
              model: "fixture",
              schemaVersion: "fixture",
              rawOutput: {},
              analyzedAt: new Date(),
              measurements: {
                create: {
                  sortOrder: 0,
                  name: "Hb",
                  normalizedName: "hemoglobin",
                  numericValue: 14,
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
      }),
    );
  }
  const created = await send(firstApp, "post", "/v1/episodes", {
    title: "Synthetic CBC episode",
    startDate: "2026-08-01",
    endDate: "2026-08-12",
  });
  assert.equal(created.status, 201);
  const episode = episodeCreateResponseSchema.parse(created.body).episode;
  const added = await send(firstApp, "post", `/v1/episodes/${episode.id}/documents`, {
    documentIds: reports.map((d) => d.id),
  });
  assert.equal(added.status, 200);
  assert.equal(episodeAddResponseSchema.parse(added.body).added.length, 2);
  const edited = await send(firstApp, "put", `/v1/episodes/${episode.id}`, {
    title: "Edited synthetic episode",
    startDate: "2026-08-01",
    endDate: "2026-08-12",
  });
  assert.equal(edited.status, 200);
  const reload = await send(freshApp, "get", `/v1/episodes/${episode.id}`);
  assert.equal(episodeResponseSchema.parse(reload.body).episode.title, "Edited synthetic episode");
  const trend = await send(freshApp, "get", `/v1/episodes/${episode.id}/trend`);
  assert.deepEqual(
    episodeTrendResponseSchema.parse(trend.body).trend.series[0].points.map((p) => p.reportDate),
    ["2026-08-01", "2026-08-12"],
  );
  const report = await send(freshApp, "get", `/v1/reports/${reports[0].id}`);
  assert.equal(report.status, 200);
  reportDetailResponseSchema.parse(report.body);
  await completeThroughApi(
    `/v1/reports/${reports[0].id}/summary`,
    () => `/v1/reports/${reports[0].id}/summary`,
  );
  await completeThroughApi(
    `/v1/episodes/${episode.id}/summary`,
    (id) => `/v1/episodes/${episode.id}/analyses/${id}`,
  );
  assert.equal(processed, 2);
  const removed = await send(
    firstApp,
    "delete",
    `/v1/episodes/${episode.id}/documents/${reports[1].id}`,
  );
  assert.equal(removed.status, 200);
  assert.equal(episodeResponseSchema.parse(removed.body).episode.analyses[0].status, "STALE");
  assert.equal(
    (await send(firstApp, "get", `/v1/episodes/${episode.id}`, undefined, "invalid")).status,
    401,
  );
  console.log(
    JSON.stringify({
      result: "passed",
      realPostgres: true,
      realRedis: true,
      mockGemini: true,
      controlledAuth: true,
      reportAndEpisodeJobsProcessed: processed,
      freshApiAndDatabaseConnection: true,
      hostedPersistence: false,
      browserSession: false,
      storageTested: false,
      isolatedQueuePrefix: prefix,
    }),
  );
} catch {
  console.error("Phase 2 rehearsal failed (details suppressed to avoid source-data logs).");
  process.exitCode = 1;
} finally {
  await worker.close(true);
  // Remove only this run's known, non-active jobs; never flush or scan application queues.
  for (const id of jobIds) {
    const job = await inspector.getJob(id).catch(() => null);
    if (job && (await job.getState()) !== "active") await job.remove();
  }
  await Promise.allSettled([
    producer.close(),
    inspector.close(),
    prisma.$disconnect(),
    fresh.$disconnect(),
  ]);
  redis.disconnect();
}
