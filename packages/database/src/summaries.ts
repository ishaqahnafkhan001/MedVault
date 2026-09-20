import { createHash, randomUUID } from "node:crypto";
import {
  ANALYSIS_CONFIG_VERSION,
  DEFAULT_GEMINI_MODEL,
  SUMMARY_PROMPT_VERSION,
  SUMMARY_MAX_OBSERVATIONS,
  SUMMARY_MAX_REPORTS,
  TERMINOLOGY_MAPPING_VERSION,
  ATTENTION_RULES_VERSION,
  episodeAnalysisSchema,
  groundedSummarySchema,
  summaryJobSchema,
  validateGroundedSummary,
  type AnalysisSource,
  type EpisodeAnalysisDto,
  type GroundedSummary,
  type SummaryJob,
} from "@medvault/shared";
import { buildMeasurementSeries, buildSummaryInput, sourceExclusion } from "@medvault/medical";
import { Prisma, type PrismaClient, type MedicalSummary } from "./generated/client.js";

type Transaction = Prisma.TransactionClient;
export type SummaryScope = "REPORT" | "EPISODE";
export const sourceInclude = {
  extraction: {
    include: { measurements: { orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }] } },
  },
} satisfies Prisma.MedicalDocumentInclude;
export type SourceDocument = Prisma.MedicalDocumentGetPayload<{ include: typeof sourceInclude }>;
export class SummaryError extends Error {
  constructor(
    readonly code: string,
    readonly status = 409,
  ) {
    super(code);
  }
}

async function summaryTable<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
      throw new SummaryError("SUMMARY_SCHEMA_PENDING", 503);
    }
    throw error;
  }
}

export function reviewedSources(documents: readonly SourceDocument[]): AnalysisSource[] {
  return documents.map((d) => ({
    id: d.id,
    patientId: d.patientId,
    checksum: d.checksumSha256,
    documentType: d.documentType,
    processingStatus: d.processingStatus,
    verificationStatus: d.verificationStatus,
    documentVersion: d.documentVersion,
    documentDate: d.documentDate?.toISOString().slice(0, 10) ?? null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    laboratory: d.hospitalName,
    method: null,
    specimen: null,
    extraction: d.extraction
      ? {
          id: d.extraction.id,
          status: d.extraction.status,
          documentVersion: d.extraction.documentVersion,
          updatedAt: d.extraction.updatedAt.toISOString(),
          measurements: d.extraction.measurements.map((m) => ({
            id: m.id,
            sortOrder: m.sortOrder,
            name: m.verifiedName ?? m.name,
            // Deliberate null corrections must not fall back to raw AI guesses.
            numericValue: m.verifiedNumericValue,
            textValue: m.verifiedTextValue,
            unit: m.verifiedUnit,
            referenceRange: m.verifiedReferenceRange,
            sourceFlag: m.verifiedSourceFlag,
            updatedAt: m.updatedAt.toISOString(),
          })),
        }
      : null,
  }));
}

export function stableFingerprint(value: unknown): string {
  const canonical = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonical);
    if (v !== null && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, x]) => [k, canonical(x)]),
      );
    return v;
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

export async function lockSummaryPatient(tx: Transaction, patientId: string): Promise<void> {
  // Source invalidation triggers take this same lock. Never hold it across Redis or AI calls.
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM public.patients WHERE id = ${patientId}::uuid FOR UPDATE`;
  if (rows.length !== 1) throw new SummaryError("NOT_FOUND", 404);
}

export async function loadSummarySnapshot(
  tx: Transaction,
  patientId: string,
  scope: SummaryScope,
  id: string,
  model: string,
) {
  let documents: SourceDocument[];
  let context: { title: string; startDate: string | null; endDate: string | null } | null = null;
  if (scope === "REPORT") {
    const document = await tx.medicalDocument.findFirst({
      where: { id, patientId },
      include: sourceInclude,
    });
    if (!document) throw new SummaryError("NOT_FOUND", 404);
    documents = [document];
  } else {
    const episode = await tx.episode.findFirst({
      where: { id, patientId },
      include: {
        memberships: {
          orderBy: { documentId: "asc" },
          include: { document: { include: sourceInclude } },
        },
      },
    });
    if (!episode) throw new SummaryError("NOT_FOUND", 404);
    if (episode.memberships.length > SUMMARY_MAX_REPORTS)
      throw new SummaryError("SUMMARY_INPUT_LIMIT", 422);
    documents = episode.memberships.map((m) => m.document);
    context = {
      title: episode.title,
      startDate: episode.startDate?.toISOString().slice(0, 10) ?? null,
      endDate: episode.endDate?.toISOString().slice(0, 10) ?? null,
    };
  }
  const sources = reviewedSources(documents).sort((a, b) => a.id.localeCompare(b.id));
  if (!sources.length || sources.some((s) => sourceExclusion(s, patientId)))
    throw new SummaryError("SUMMARY_SOURCE_NOT_ELIGIBLE", 422);
  if (
    sources.reduce((total, s) => total + (s.extraction?.measurements.length ?? 0), 0) >
    SUMMARY_MAX_OBSERVATIONS
  )
    throw new SummaryError("SUMMARY_INPUT_LIMIT", 422);
  const snapshot = {
    scope,
    id,
    context,
    sources,
    model,
    promptVersion: SUMMARY_PROMPT_VERSION,
    configVersion: ANALYSIS_CONFIG_VERSION,
    terminologyVersion: TERMINOLOGY_MAPPING_VERSION,
    attentionRulesVersion: ATTENTION_RULES_VERSION,
  };
  const trend = buildMeasurementSeries(sources, patientId);
  if (!trend.series.some((s) => s.points.length))
    throw new SummaryError("NO_REVIEWED_OBSERVATIONS", 422);
  const input = buildSummaryInput(scope, trend.series);
  if (JSON.stringify(input).length > 120_000) throw new SummaryError("SUMMARY_INPUT_LIMIT", 422);
  return { snapshot, input, fingerprint: stableFingerprint(snapshot) };
}

export function summaryDto(row: MedicalSummary, stale = false): EpisodeAnalysisDto {
  const result = row.result === null ? null : groundedSummarySchema.parse(row.result);
  return episodeAnalysisSchema.parse({
    id: row.id,
    status: stale ? "STALE" : row.status,
    result,
    summaryText: result?.findings.map((f) => f.text).join("\n\n") ?? null,
    provider: row.provider,
    model: row.model,
    promptVersion: row.promptVersion,
    inputFingerprint: row.inputFingerprint,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    analyzedAt: row.analyzedAt?.toISOString() ?? null,
    failureCode: row.failureCode,
  });
}

export class SummaryStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly model = DEFAULT_GEMINI_MODEL,
  ) {}

  async request(patientId: string, scope: SummaryScope, id: string, force = false) {
    return this.prisma.$transaction(
      async (tx) => {
        await lockSummaryPatient(tx, patientId);
        const current = await loadSummarySnapshot(tx, patientId, scope, id, this.model);
        const scopeKey = `${scope}-${id}`;
        const existing = await summaryTable(() =>
          tx.medicalSummary.findUnique({ where: { scopeKey } }),
        );
        if (existing && existing.patientId !== patientId) throw new SummaryError("NOT_FOUND", 404);
        if (existing?.inputFingerprint === current.fingerprint) {
          const abandoned =
            force &&
            ((existing.status === "PROCESSING" &&
              (!existing.leaseUntil || existing.leaseUntil.getTime() <= Date.now())) ||
              (existing.status === "QUEUED" &&
                Date.now() - existing.updatedAt.getTime() >= 120_000));
          if (!abandoned && ["QUEUED", "PROCESSING", "COMPLETED"].includes(existing.status))
            return {
              analysis: summaryDto(existing),
              job: existing.status === "QUEUED" ? jobFor(existing) : null,
            };
          if (!force) return { analysis: summaryDto(existing), job: null };
        }
        if (existing && Date.now() - existing.updatedAt.getTime() < 30_000)
          throw new SummaryError("SUMMARY_COOLDOWN", 429);
        const data = {
          patientId,
          scopeKey,
          episodeId: scope === "EPISODE" ? id : null,
          documentId: scope === "REPORT" ? id : null,
          inputFingerprint: current.fingerprint,
          sourceSnapshot: current.snapshot satisfies Prisma.InputJsonObject,
          status: "QUEUED",
          model: this.model,
          promptVersion: SUMMARY_PROMPT_VERSION,
          correlationId: randomUUID(),
          claimToken: null,
          leaseUntil: null,
          failureCode: null,
          analyzedAt: null,
          attempts: 0,
          result: Prisma.DbNull,
        };
        const row = existing
          ? await tx.medicalSummary.update({
              where: { id: existing.id },
              data: { ...data, generation: { increment: 1 } },
            })
          : await tx.medicalSummary.create({ data });
        return { analysis: summaryDto(row), job: jobFor(row) };
      },
      { timeout: 10_000 },
    );
  }

  async get(
    patientId: string,
    scope: SummaryScope,
    id: string,
  ): Promise<EpisodeAnalysisDto | null> {
    return this.prisma.$transaction(
      async (tx) => {
        await lockSummaryPatient(tx, patientId);
        // Verify ownership even when there is no summary yet.
        const owner =
          scope === "REPORT"
            ? await tx.medicalDocument.findFirst({ where: { id, patientId }, select: { id: true } })
            : await tx.episode.findFirst({ where: { id, patientId }, select: { id: true } });
        if (!owner) throw new SummaryError("NOT_FOUND", 404);
        const row = await summaryTable(() =>
          tx.medicalSummary.findFirst({ where: { scopeKey: `${scope}-${id}`, patientId } }),
        );
        if (!row) return null;
        let stale: boolean;
        try {
          stale =
            (await loadSummarySnapshot(tx, patientId, scope, id, this.model)).fingerprint !==
            row.inputFingerprint;
        } catch (error) {
          if (error instanceof SummaryError) stale = true;
          else throw error;
        }
        return summaryDto(row, stale);
      },
      { timeout: 10_000 },
    );
  }

  async enqueueFailed(job: SummaryJob) {
    await this.prisma.medicalSummary.updateMany({
      where: {
        id: job.analysisId,
        generation: job.generation,
        inputFingerprint: job.inputFingerprint,
        status: "QUEUED",
      },
      data: { status: "FAILED", failureCode: "QUEUE_UNAVAILABLE" },
    });
  }

  async claim(rawJob: SummaryJob) {
    const job = summaryJobSchema.parse(rawJob);
    return this.prisma.$transaction(
      async (tx) => {
        await lockSummaryPatient(tx, job.patientId);
        const row = await tx.medicalSummary.findFirst({
          where: {
            id: job.analysisId,
            patientId: job.patientId,
            generation: job.generation,
            inputFingerprint: job.inputFingerprint,
            correlationId: job.correlationId,
          },
        });
        if (!row || ["STALE", "FAILED"].includes(row.status)) return { state: "obsolete" as const };
        if (row.status === "COMPLETED") return { state: "complete" as const };
        if (row.status === "PROCESSING" && row.leaseUntil && row.leaseUntil.getTime() > Date.now())
          return { state: "busy" as const };
        if (row.attempts >= 4) {
          await tx.medicalSummary.update({
            where: { id: row.id },
            data: { status: "FAILED", failureCode: "ATTEMPT_LIMIT" },
          });
          return { state: "obsolete" as const };
        }
        const scope = row.episodeId ? "EPISODE" : "REPORT";
        const id = row.episodeId ?? row.documentId;
        if (!id) throw new SummaryError("INVALID_SUMMARY_SCOPE");
        let current;
        try {
          current = await loadSummarySnapshot(tx, row.patientId, scope, id, this.model);
        } catch (error) {
          if (!(error instanceof SummaryError)) throw error;
        }
        if (!current || current.fingerprint !== row.inputFingerprint) {
          await tx.medicalSummary.update({
            where: { id: row.id },
            data: { status: "STALE", claimToken: null, leaseUntil: null },
          });
          return { state: "obsolete" as const };
        }
        const token = randomUUID();
        const updated = await tx.medicalSummary.updateMany({
          where: {
            id: row.id,
            generation: job.generation,
            status: row.status,
            claimToken: row.claimToken,
          },
          data: {
            status: "PROCESSING",
            claimToken: token,
            leaseUntil: new Date(Date.now() + 75_000),
            attempts: { increment: 1 },
            failureCode: null,
          },
        });
        if (!updated.count) return { state: "busy" as const };
        return { state: "claimed" as const, token, input: current.input, model: row.model };
      },
      { timeout: 10_000 },
    );
  }

  async complete(job: SummaryJob, token: string, result: GroundedSummary): Promise<boolean> {
    const validated = groundedSummarySchema.parse(result);
    return this.prisma.$transaction(
      async (tx) => {
        await lockSummaryPatient(tx, job.patientId);
        const row = await tx.medicalSummary.findFirst({ where: claimWhere(job, token) });
        if (!row) return false;
        const id = row.episodeId ?? row.documentId;
        if (!id) return false;
        let current;
        try {
          current = await loadSummarySnapshot(
            tx,
            row.patientId,
            row.episodeId ? "EPISODE" : "REPORT",
            id,
            this.model,
          );
        } catch (error) {
          if (!(error instanceof SummaryError)) throw error;
        }
        if (!current || current.fingerprint !== job.inputFingerprint) {
          await tx.medicalSummary.updateMany({
            where: claimWhere(job, token),
            data: { status: "STALE", claimToken: null, leaseUntil: null },
          });
          return false;
        }
        validateGroundedSummary(validated, current.input);
        const changed = await tx.medicalSummary.updateMany({
          where: claimWhere(job, token),
          data: {
            status: "COMPLETED",
            result: validated,
            analyzedAt: new Date(),
            failureCode: null,
            claimToken: null,
            leaseUntil: null,
          },
        });
        return changed.count === 1;
      },
      { timeout: 10_000 },
    );
  }

  async failed(job: SummaryJob, token: string, code: string, retry: boolean) {
    await this.prisma.medicalSummary.updateMany({
      where: claimWhere(job, token),
      data: {
        status: retry ? "QUEUED" : "FAILED",
        failureCode: code,
        claimToken: null,
        leaseUntil: null,
      },
    });
  }
}

function claimWhere(job: SummaryJob, token: string): Prisma.MedicalSummaryWhereInput {
  return {
    id: job.analysisId,
    patientId: job.patientId,
    generation: job.generation,
    inputFingerprint: job.inputFingerprint,
    correlationId: job.correlationId,
    status: "PROCESSING",
    claimToken: token,
  };
}
function jobFor(row: MedicalSummary): SummaryJob {
  return summaryJobSchema.parse({
    analysisId: row.id,
    patientId: row.patientId,
    inputFingerprint: row.inputFingerprint,
    correlationId: row.correlationId,
    generation: row.generation,
  });
}
