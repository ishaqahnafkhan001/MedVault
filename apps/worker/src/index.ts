import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as Sentry from "@sentry/node";
import { GeminiReportExtractionAdapter } from "@medvault/ai";
import { getPrismaClient } from "@medvault/database";
import {
  REPORT_ANALYSIS_QUEUE,
  describeEnvironmentTopology,
  formatEnvironmentTopology,
} from "@medvault/shared";
import { UnrecoverableError, Worker, type Job } from "bullmq";
import { loadWorkerConfig } from "./config.js";
import { parseReportJob } from "./job-contract.js";
import { PermanentProcessingError, ReportProcessor } from "./processor.js";
import { PrismaReportProcessorRepository } from "./prisma-repository.js";
import { closeWorkerRedisConnection, createWorkerRedisConnection } from "./redis-connection.js";
import { initializeWorkerSentry } from "./sentry.js";
import { SupabaseReportFileStorage } from "./storage.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const localEnvironment = resolve(repositoryRoot, ".env.local");
const rootEnvironment = resolve(repositoryRoot, ".env");
if (existsSync(localEnvironment)) process.loadEnvFile(localEnvironment);
if (existsSync(rootEnvironment)) process.loadEnvFile(rootEnvironment);

const environment = loadWorkerConfig();
const topology = describeEnvironmentTopology({
  databaseUrl: environment.DATABASE_URL,
  redisUrl: environment.REDIS_URL,
  supabaseConfigured: true,
  geminiConfigured: Boolean(environment.GEMINI_API_KEY),
  apiUrl: environment.NEXT_PUBLIC_API_URL,
});
process.stdout.write(`MedVault worker environment: ${formatEnvironmentTopology(topology)}\n`);
initializeWorkerSentry(environment.SENTRY_DSN, environment.SENTRY_ENVIRONMENT);

if (!environment.GEMINI_API_KEY) {
  process.stdout.write("Report worker idle: GEMINI_API_KEY is not configured\n");
  const idleTimer = setInterval(() => undefined, 60_000);
  const stopIdleWorker = () => {
    clearInterval(idleTimer);
    process.exit(0);
  };
  process.on("SIGTERM", stopIdleWorker);
  process.on("SIGINT", stopIdleWorker);
} else {
  const prisma = getPrismaClient();
  const connection = createWorkerRedisConnection(environment.REDIS_URL);
  const processor = new ReportProcessor(
    new PrismaReportProcessorRepository(prisma),
    new SupabaseReportFileStorage(
      environment.SUPABASE_URL,
      environment.SUPABASE_SERVICE_ROLE_KEY,
      environment.SUPABASE_STORAGE_BUCKET,
    ),
    new GeminiReportExtractionAdapter(environment.GEMINI_API_KEY, environment.GEMINI_MODEL),
  );

  const worker = new Worker<unknown>(
    REPORT_ANALYSIS_QUEUE,
    async (job: Job<unknown>) => {
      const data = parseReportJob(job);
      try {
        return await processor.process(data, {
          number: job.attemptsMade + 1,
          maximum: job.opts.attempts ?? 1,
        });
      } catch (error) {
        Sentry.captureMessage("MedVault report processing failed", "error");
        if (error instanceof PermanentProcessingError) throw new UnrecoverableError(error.safeCode);
        throw error;
      }
    },
    { connection, concurrency: environment.REPORT_QUEUE_CONCURRENCY },
  );

  worker.on("error", () => {
    process.stderr.write("Report worker infrastructure error\n");
  });

  let shuttingDown = false;
  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    await worker.close().catch(() => undefined);
    await Promise.allSettled([closeWorkerRedisConnection(connection), prisma.$disconnect()]);
  }

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}
