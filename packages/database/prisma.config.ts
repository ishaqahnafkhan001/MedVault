import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { defineConfig, env } from "prisma/config";
import {
  assertMigrationCredentialIsProcessOnly,
  validatePrismaDatabaseEnvironment,
} from "../shared/src/environment.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const localEnvironment = resolve(repositoryRoot, ".env.local");
const rootEnvironment = resolve(repositoryRoot, ".env");
for (const environmentFile of [localEnvironment, rootEnvironment]) {
  if (!existsSync(environmentFile)) continue;
  assertMigrationCredentialIsProcessOnly(
    parseEnv(readFileSync(environmentFile, "utf8")),
    "a shared application environment file",
  );
  process.loadEnvFile(environmentFile);
}
const { databaseUrl } = validatePrismaDatabaseEnvironment(process.env);
process.env.DATABASE_URL = new URL(databaseUrl).toString();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
