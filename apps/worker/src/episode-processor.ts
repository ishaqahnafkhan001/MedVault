import { AiExtractionError, type EpisodeSummaryAdapter } from "@medvault/ai";
import {
  summaryJobSchema,
  validateGroundedSummary,
  type SummaryJob,
  type SummaryInput,
  type GroundedSummary,
} from "@medvault/shared";
export type SummaryClaim =
  | { state: "claimed"; token: string; input: SummaryInput; model: string }
  | { state: "busy" | "complete" | "obsolete" };
export interface EpisodeProcessorRepository {
  claim(job: SummaryJob): Promise<SummaryClaim>;
  complete(job: SummaryJob, token: string, result: GroundedSummary): Promise<boolean>;
  failed(job: SummaryJob, token: string, code: string, retry: boolean): Promise<unknown>;
}
export class PermanentSummaryError extends Error {
  constructor(readonly safeCode: string) {
    super(safeCode);
  }
}
export class EpisodeSummaryProcessor {
  constructor(
    private readonly repository: EpisodeProcessorRepository,
    private readonly ai: EpisodeSummaryAdapter,
  ) {}
  async process(raw: unknown, attempt: { number: number; maximum: number }) {
    const parsed = summaryJobSchema.safeParse(raw);
    if (!parsed.success) throw new PermanentSummaryError("INVALID_SUMMARY_JOB");
    const job = parsed.data;
    let claim: SummaryClaim;
    try {
      claim = await this.repository.claim(job);
    } catch {
      throw new Error("SUMMARY_DEPENDENCY_UNAVAILABLE");
    }
    if (claim.state === "busy") throw new Error("SUMMARY_LEASE_BUSY");
    if (claim.state !== "claimed") return claim.state;
    const started = Date.now();
    process.stdout.write(
      `Summary stage=claimed correlation=${job.correlationId} attempt=${attempt.number}\n`,
    );
    try {
      const response = await this.ai.summarize(claim.input);
      let result: GroundedSummary;
      try {
        if (response.model !== claim.model || response.provider !== "google")
          throw new Error("MODEL_MISMATCH");
        result = validateGroundedSummary(response.result, claim.input);
      } catch {
        throw new PermanentSummaryError("AI_INVALID_OUTPUT");
      }
      const saved = await this.repository.complete(job, claim.token, result);
      process.stdout.write(
        `Summary stage=${saved ? "persisted" : "stale-discarded"} correlation=${job.correlationId} durationMs=${Date.now() - started}\n`,
      );
      return saved ? "processed" : "obsolete";
    } catch (error) {
      const permanent =
        error instanceof PermanentSummaryError ||
        (error instanceof AiExtractionError && !error.transient);
      const retry = !permanent && attempt.number < Math.min(4, attempt.maximum);
      const code =
        error instanceof PermanentSummaryError
          ? error.safeCode
          : error instanceof AiExtractionError
            ? error.safeCode
            : "SUMMARY_DEPENDENCY_UNAVAILABLE";
      await this.repository.failed(job, claim.token, code, retry);
      process.stderr.write(
        `Summary stage=${retry ? "retry" : "failed"} code=${code} correlation=${job.correlationId}\n`,
      );
      if (!retry) throw new PermanentSummaryError(code);
      // Do not serialize a provider/database cause into BullMQ logs: it may contain private input.
      // eslint-disable-next-line preserve-caught-error
      throw new Error(code);
    }
  }
}
