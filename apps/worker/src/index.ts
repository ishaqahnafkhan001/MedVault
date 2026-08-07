import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as Sentry from "@sentry/node";
import { GeminiReportExtractionAdapter } from "@medvault/ai";
import { getPrismaClient } from "@medvault/database";
import { UnrecoverableError, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { z } from "zod";
import { PermanentProcessingError, ReportProcessor } from "./processor.js";
import { PrismaReportProcessorRepository } from "./prisma-repository.js";
import { initializeWorkerSentry } from "./sentry.js";
import { SupabaseReportFileStorage } from "./storage.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const localEnvironment = resolve(repositoryRoot, ".env.local");
const rootEnvironment = resolve(repositoryRoot, ".env");
if (existsSync(localEnvironment)) process.loadEnvFile(localEnvironment);
if (existsSync(rootEnvironment)) process.loadEnvFile(rootEnvironment);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_STORAGE_BUCKET: z.string().default("medical-documents"),
  GEMINI_API_KEY: z.string().default(""),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  REPORT_QUEUE_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().default("development"),
});
const environment = envSchema.parse(process.env);
initializeWorkerSentry(environment.SENTRY_DSN, environment.SENTRY_ENVIRONMENT);

interface ReportJobData {
  documentId: string;
  documentVersion: number;
}

if (!environment.GEMINI_API_KEY) {
  if (environment.NODE_ENV === "production") {
    throw new Error("GEMINI_API_KEY is required in production");
  }
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
  const connection = new IORedis(environment.REDIS_URL, { maxRetriesPerRequest: null });
  const processor = new ReportProcessor(
    new PrismaReportProcessorRepository(prisma),
    new SupabaseReportFileStorage(
      environment.SUPABASE_URL,
      environment.SUPABASE_SERVICE_ROLE_KEY,
      environment.SUPABASE_STORAGE_BUCKET,
    ),
    new GeminiReportExtractionAdapter(environment.GEMINI_API_KEY, environment.GEMINI_MODEL),
  );

  const worker = new Worker<ReportJobData>(
    "report-analysis",
    async (job: Job<ReportJobData>) => {
      try {
        return await processor.process(job.data, {
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

  async function shutdown(): Promise<void> {
    await worker.close();
    connection.disconnect();
    await prisma.$disconnect();
  }

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}
