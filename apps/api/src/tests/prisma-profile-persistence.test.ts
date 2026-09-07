import type { PrismaClient } from "@medvault/database";
import type { PatientProfileInput } from "@medvault/shared";
import { describe, expect, it, vi } from "vitest";
import { PrismaAppService } from "../services/prisma-service.js";
import type { ReportQueue } from "../services/queue.js";
import type { PrivateStorage } from "../services/storage.js";

describe("Prisma profile persistence", () => {
  it("hydrates the same Supabase identity in a fresh service without duplicating Patient", async () => {
    const database = inMemoryProfileDatabase();
    const firstSession = service(database.prisma);
    const secondSession = service(database.prisma);
    const authUserId = "10000000-0000-4000-8000-000000000001";

    await firstSession.updateProfile(authUserId, profileInput("Patient A"));

    await expect(secondSession.getProfile(authUserId)).resolves.toMatchObject({
      fullName: "Patient A",
      allergies: ["Penicillin"],
      completed: true,
    });
    await secondSession.updateProfile(authUserId, profileInput("Patient A Updated"));
    expect(database.patientCount()).toBe(1);
    await expect(
      secondSession.getProfile("20000000-0000-4000-8000-000000000002"),
    ).resolves.toBeNull();
  });
});

interface ProfileRecord {
  fullName: string;
  dateOfBirth: Date | null;
  gender: string | null;
  bloodGroup: string | null;
  allergies: string[];
  chronicConditions: string[];
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
}

function inMemoryProfileDatabase(): { prisma: PrismaClient; patientCount: () => number } {
  const patients = new Map<string, string>();
  const profiles = new Map<string, ProfileRecord>();
  const patient = {
    upsert: vi.fn(({ where }: { where: { authUserId: string } }) => {
      let id = patients.get(where.authUserId);
      if (!id) {
        id = `patient-${String(patients.size + 1)}`;
        patients.set(where.authUserId, id);
      }
      return Promise.resolve({ id });
    }),
    findUnique: vi.fn(({ where }: { where: { authUserId: string } }) => {
      const id = patients.get(where.authUserId);
      return Promise.resolve(id ? { id, profile: profiles.get(id) ?? null } : null);
    }),
  };
  const patientProfile = {
    upsert: vi.fn(
      ({
        where,
        create,
        update,
      }: {
        where: { patientId: string };
        create: ProfileRecord & { patientId: string };
        update: ProfileRecord;
      }) => {
        const existing = profiles.get(where.patientId);
        const next = existing ? { ...existing, ...update } : create;
        profiles.set(where.patientId, next);
        return Promise.resolve(next);
      },
    ),
  };
  return {
    prisma: { patient, patientProfile } as unknown as PrismaClient,
    patientCount: () => patients.size,
  };
}

function service(prisma: PrismaClient): PrismaAppService {
  return new PrismaAppService(prisma, {} as PrivateStorage, {} as ReportQueue, 300);
}

function profileInput(fullName: string): PatientProfileInput {
  return {
    fullName,
    dateOfBirth: "1990-01-01",
    gender: null,
    bloodGroup: "O+",
    allergies: ["Penicillin"],
    chronicConditions: [],
    emergencyContactName: null,
    emergencyContactPhone: null,
    emergencyContactRelation: null,
  };
}
