import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describeEnvironmentTopology, formatEnvironmentTopology } from "@medvault/shared";
import { loadPublicEnvironment } from "./lib/env";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../..");
const localEnvironment = resolve(repositoryRoot, ".env.local");
const rootEnvironment = resolve(repositoryRoot, ".env");
if (existsSync(localEnvironment)) process.loadEnvFile(localEnvironment);
if (existsSync(rootEnvironment)) process.loadEnvFile(rootEnvironment);
const publicEnvironment = loadPublicEnvironment();
const topology = describeEnvironmentTopology({
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  supabaseConfigured: true,
  geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
  apiUrl: publicEnvironment.NEXT_PUBLIC_API_URL,
});
process.stdout.write(`MedVault web environment: ${formatEnvironmentTopology(topology)}\n`);

const nextConfig: NextConfig = {
  transpilePackages: ["@medvault/shared"],
  poweredByHeader: false,
  turbopack: { root: resolve(currentDirectory, "../..") },
};

export default process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      silent: true,
      sourcemaps: { deleteSourcemapsAfterUpload: true },
    })
  : nextConfig;
