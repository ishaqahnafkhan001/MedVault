import "dotenv/config";
import { getPrismaClient } from "@medvault/database";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { SupabaseAuthVerifier } from "./middleware/auth.js";
import { PrismaAppService } from "./services/prisma-service.js";
import { BullMqReportQueue } from "./services/queue.js";
import { SupabasePrivateStorage } from "./services/storage.js";
import { initializeSentry } from "./sentry.js";

const config = loadConfig();
initializeSentry(config.SENTRY_DSN, config.SENTRY_ENVIRONMENT);
const prisma = getPrismaClient();
const queue = new BullMqReportQueue(config.REDIS_URL);
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
  signedUrlTtlSeconds: config.SIGNED_URL_TTL_SECONDS,
});

const server = app.listen(config.API_PORT, () => {
  process.stdout.write(`MedVault API listening on port ${String(config.API_PORT)}\n`);
});

async function shutdown(): Promise<void> {
  server.close();
  await queue.close();
  await prisma.$disconnect();
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
