import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getPrismaClient } from "@medvault/database";
import { describeEnvironmentTopology, formatEnvironmentTopology } from "@medvault/shared";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { SupabaseAuthVerifier } from "./middleware/auth.js";
import { PrismaAppService } from "./services/prisma-service.js";
import { BullMqReportQueue } from "./services/queue.js";
import { createRedisRateLimitStore } from "./services/rate-limit.js";
import {
  PrismaReconciliationRepository,
  ReportQueueReconciler,
  ReportReconciliationLoop,
} from "./services/reconciliation.js";
import { SupabasePrivateStorage } from "./services/storage.js";
import { initializeSentry } from "./sentry.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const localEnvironment = resolve(repositoryRoot, ".env.local");
const rootEnvironment = resolve(repositoryRoot, ".env");
if (existsSync(localEnvironment)) process.loadEnvFile(localEnvironment);
if (existsSync(rootEnvironment)) process.loadEnvFile(rootEnvironment);

const config = loadConfig();
const topology = describeEnvironmentTopology({
  databaseUrl: config.DATABASE_URL,
  redisUrl: config.REDIS_URL,
  supabaseConfigured: true,
  geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
  apiUrl: config.NEXT_PUBLIC_API_URL ?? `http://localhost:${String(config.API_PORT)}`,
});
process.stdout.write(`MedVault API environment: ${formatEnvironmentTopology(topology)}\n`);
initializeSentry(config.SENTRY_DSN, config.SENTRY_ENVIRONMENT);
const prisma = getPrismaClient();
const queue = new BullMqReportQueue(config.REDIS_URL);
const rateLimitStore =
  config.RATE_LIMIT_BACKEND === "redis" ? createRedisRateLimitStore(config.REDIS_URL) : undefined;
const storage = new SupabasePrivateStorage(
  config.SUPABASE_URL,
  config.SUPABASE_SERVICE_ROLE_KEY,
  config.SUPABASE_STORAGE_BUCKET,
);
const service = new PrismaAppService(prisma, storage, queue, config.SIGNED_URL_TTL_SECONDS);
const app = createApp({
  authVerifier: new SupabaseAuthVerifier(config.SUPABASE_URL, config.SUPABASE_ANON_KEY),
  service,
  webOrigin: config.WEB_ORIGIN,
  maxUploadBytes: config.MAX_UPLOAD_BYTES,
  rateLimitWindowMs: config.RATE_LIMIT_WINDOW_MS,
  rateLimitMax: config.RATE_LIMIT_MAX,
  ...(rateLimitStore ? { rateLimitStore } : {}),
  rateLimitPassOnStoreError: config.RATE_LIMIT_FAIL_OPEN,
  signedUrlTtlSeconds: config.SIGNED_URL_TTL_SECONDS,
});

app.set("trust proxy", 1);

const server = app.listen(config.API_PORT, () => {
  process.stdout.write(`MedVault API is running at http://localhost:${String(config.API_PORT)}\n`);
});

const reconciliation = new ReportReconciliationLoop(
  new ReportQueueReconciler(
    new PrismaReconciliationRepository(prisma),
    queue,
    config.REPORT_STALE_AFTER_SECONDS * 1_000,
    config.REPORT_RECONCILE_BATCH_SIZE,
    config.REPORT_MAX_PROCESSING_ATTEMPTS,
  ),
  config.REPORT_RECONCILE_INTERVAL_SECONDS * 1_000,
);
reconciliation.start();

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  reconciliation.stop();
  server.close();
  await Promise.allSettled([
    queue.close(),
    rateLimitStore?.shutdown() ?? Promise.resolve(),
    prisma.$disconnect(),
  ]);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
