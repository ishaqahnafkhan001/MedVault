import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getPrismaClient } from "@medvault/database";
import { loadConfig } from "../config.js";
import {
  AuthOrphanChecker,
  DatabaseStorageConsistencyChecker,
  PrismaConsistencyRepository,
  SupabaseAuthDirectory,
  SupabaseStorageInventory,
} from "../services/consistency.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const localEnvironment = resolve(repositoryRoot, ".env.local");
const rootEnvironment = resolve(repositoryRoot, ".env");
if (existsSync(localEnvironment)) process.loadEnvFile(localEnvironment);
if (existsSync(rootEnvironment)) process.loadEnvFile(rootEnvironment);

const config = loadConfig();
const prisma = getPrismaClient();
const repository = new PrismaConsistencyRepository(prisma);

try {
  const storage = await new DatabaseStorageConsistencyChecker(
    repository,
    new SupabaseStorageInventory(
      config.SUPABASE_URL,
      config.SUPABASE_SERVICE_ROLE_KEY,
      config.SUPABASE_STORAGE_BUCKET,
    ),
  ).check();
  const auth = await new AuthOrphanChecker(
    repository,
    new SupabaseAuthDirectory(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY),
  ).check();
  process.stdout.write(`${JSON.stringify({ storage, auth }, null, 2)}\n`);
} finally {
  await prisma.$disconnect();
}
