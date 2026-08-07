import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, env } from "prisma/config";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const localEnvironment = resolve(repositoryRoot, ".env.local");
const rootEnvironment = resolve(repositoryRoot, ".env");
if (existsSync(localEnvironment)) process.loadEnvFile(localEnvironment);
if (existsSync(rootEnvironment)) process.loadEnvFile(rootEnvironment);
if (process.env.DATABASE_URL)
  process.env.DATABASE_URL = new URL(process.env.DATABASE_URL).toString();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
