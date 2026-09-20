import { describe, expect, it, vi } from "vitest";
import { AiExtractionError, type EpisodeSummaryAdapter } from "@medvault/ai";
import {
  ANALYSIS_CONFIG_VERSION,
  SUMMARY_PROMPT_VERSION,
  groundSummarySelection,
  type SummaryInput,
  type SummaryJob,
} from "@medvault/shared";
import {
  EpisodeSummaryProcessor,
  PermanentSummaryError,
  type EpisodeProcessorRepository,
  type SummaryClaim,
} from "../episode-processor.js";
const id = "00000000-0000-4000-8000-000000000001";
const job: SummaryJob = {
  analysisId: id,
  patientId: id,
  correlationId: id,
  generation: 1,
  inputFingerprint: "a".repeat(64),
};
const input: SummaryInput = {
  scope: "REPORT",
  configVersion: ANALYSIS_CONFIG_VERSION,
  promptVersion: SUMMARY_PROMPT_VERSION,
  facts: [
    {
      id: "observation-1",
      kind: "OBSERVATION",
      measurementIds: [id],
      text: "Synthetic observation: 14 g/dL.",
    },
  ],
  explanations: [],
};
function fixture() {
  const result = groundSummarySelection({ findings: [{ factId: "observation-1" }] }, input);
  const claim = vi
    .fn<EpisodeProcessorRepository["claim"]>()
    .mockResolvedValue({ state: "claimed", token: id, input, model: "fixture-model" });
  const complete = vi.fn<EpisodeProcessorRepository["complete"]>().mockResolvedValue(true);
  const failed = vi.fn<EpisodeProcessorRepository["failed"]>().mockResolvedValue(undefined);
  const summarize = vi
    .fn<EpisodeSummaryAdapter["summarize"]>()
    .mockResolvedValue({ result, provider: "google", model: "fixture-model" });
  return {
    claim,
    complete,
    failed,
    summarize,
    result,
    processor: new EpisodeSummaryProcessor({ claim, complete, failed }, { summarize }),
  };
}
describe("summary job processing (mock provider and repository)", () => {
  it.each(["REPORT", "EPISODE"] as const)("persists validated %s results", async (scope) => {
    const f = fixture();
    f.claim.mockResolvedValue({
      state: "claimed",
      token: id,
      input: { ...input, scope },
      model: "fixture-model",
    });
    await expect(f.processor.process(job, { number: 1, maximum: 4 })).resolves.toBe("processed");
    expect(f.complete).toHaveBeenCalledWith(job, id, f.result);
  });
  it.each(["busy", "complete", "obsolete"] as const)(
    "does not call Gemini when claim is %s",
    async (state) => {
      const f = fixture();
      f.claim.mockResolvedValue({ state } satisfies SummaryClaim);
      if (state === "busy")
        await expect(f.processor.process(job, { number: 1, maximum: 4 })).rejects.toThrow(
          "SUMMARY_LEASE_BUSY",
        );
      else await expect(f.processor.process(job, { number: 1, maximum: 4 })).resolves.toBe(state);
      expect(f.summarize).not.toHaveBeenCalled();
      expect(f.complete).not.toHaveBeenCalled();
    },
  );
  it("rejects malformed jobs before loading sources", async () => {
    const f = fixture();
    await expect(
      f.processor.process({ ...job, patientId: "malformed" }, { number: 1, maximum: 4 }),
    ).rejects.toBeInstanceOf(PermanentSummaryError);
    expect(f.claim).not.toHaveBeenCalled();
  });
  it("does not expose a raw database error from claim acquisition", async () => {
    const f = fixture();
    f.claim.mockRejectedValue(new Error("private query detail"));
    await expect(f.processor.process(job, { number: 1, maximum: 4 })).rejects.toThrow(
      "SUMMARY_DEPENDENCY_UNAVAILABLE",
    );
    expect(f.summarize).not.toHaveBeenCalled();
  });
  it("rejects fabricated values before any successful persistence", async () => {
    const f = fixture();
    f.summarize.mockResolvedValue({
      model: "fixture-model",
      provider: "google",
      result: { ...f.result, findings: [{ ...input.facts[0]!, text: "Invented 999 g/dL" }] },
    });
    await expect(f.processor.process(job, { number: 1, maximum: 4 })).rejects.toThrow(
      "AI_INVALID_OUTPUT",
    );
    expect(f.complete).not.toHaveBeenCalled();
    expect(f.failed).toHaveBeenCalledWith(job, id, "AI_INVALID_OUTPUT", false);
  });
  it("discards output when the guarded repository detects a source change during AI", async () => {
    const f = fixture();
    let resolveAI!: (value: Awaited<ReturnType<EpisodeSummaryAdapter["summarize"]>>) => void;
    f.summarize.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAI = resolve;
        }),
    );
    const running = f.processor.process(job, { number: 1, maximum: 4 });
    await vi.waitFor(() => expect(f.summarize).toHaveBeenCalledOnce());
    f.complete.mockResolvedValue(false); // Repository's version fence rejects the now-obsolete revision.
    resolveAI({ result: f.result, model: "fixture-model", provider: "google" });
    await expect(running).resolves.toBe("obsolete");
    expect(f.failed).not.toHaveBeenCalled();
  });
  it("bounds transient retries and surfaces permanent output failure", async () => {
    const f = fixture();
    f.summarize.mockRejectedValue(
      new AiExtractionError("private provider details", true, "AI_UNAVAILABLE"),
    );
    await expect(f.processor.process(job, { number: 1, maximum: 4 })).rejects.toThrow(
      "AI_UNAVAILABLE",
    );
    expect(f.failed).toHaveBeenLastCalledWith(job, id, "AI_UNAVAILABLE", true);
    await expect(f.processor.process(job, { number: 4, maximum: 4 })).rejects.toBeInstanceOf(
      PermanentSummaryError,
    );
    expect(f.failed).toHaveBeenLastCalledWith(job, id, "AI_UNAVAILABLE", false);
  });
  it("does not report a failed database write as completed", async () => {
    const f = fixture();
    f.complete.mockRejectedValue(new Error("database unavailable"));
    await expect(f.processor.process(job, { number: 1, maximum: 4 })).rejects.toThrow(
      "SUMMARY_DEPENDENCY_UNAVAILABLE",
    );
    expect(f.failed).toHaveBeenCalledWith(job, id, "SUMMARY_DEPENDENCY_UNAVAILABLE", true);
  });
});
