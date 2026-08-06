import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client.js";

export * from "./generated/client.js";

const globalDatabase = globalThis as typeof globalThis & { medvaultPrisma?: PrismaClient };

export function createPrismaClient(databaseUrl = process.env.DATABASE_URL): PrismaClient {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

export function getPrismaClient(): PrismaClient {
  globalDatabase.medvaultPrisma ??= createPrismaClient();
  return globalDatabase.medvaultPrisma;
}
