import {
  AiExtractionError,
  MockReportExtractionAdapter,
  type ExtractionResult,
  type ReportExtractionAdapter,
} from "@medvault/ai";
import { describe, expect, it } from "vitest";
import {
  PermanentProcessingError,
  ReportProcessor,
  type ClaimedReport,
  type ReportProcessorRepository,
} from "../processor.js";
import { isExpectedReportStoragePath } from "../prisma-repository.js";

const extraction = {
  documentReportType: "Laboratory report",
  testName: "Complete Blood Count (CBC)",
  normalizedTestName: null,
  reportDate: "2026-08-05",
  hospitalName: "Popular Diagnostic Centre",
  category: "HEMATOLOGY" as const,
  patientNameOnReport: null,
  measurements: [
    {
      name: "Platelet Count",
      normalizedName: null,
      textValue: null,
      numericValue: 95000,
      unit: "/µL",
      referenceRange: "150000-450000",
      sourceFlag: "LOW",
    },
  ],
};

describe("report processor", () => {
  it("persists valid extraction as one idempotent result", async () => {
    const repository = new FakeRepository(report());
    const processor = processorWith(repository, new MockReportExtractionAdapter(extraction));
    await expect(processor.process(job(), { number: 1, maximum: 4 })).resolves.toBe("processed");
    expect(repository.persisted).toHaveLength(1);
    expect(repository.persisted[0]?.extraction.normalizedTestName).toBe("cbc");
    repository.claimed = "complete";
    await expect(processor.process(job(), { number: 1, maximum: 4 })).resolves.toBe(
      "already-complete",
    );
    expect(repository.persisted).toHaveLength(1);
  });

  it("requeues a transient failure before the final attempt", async () => {
    const repository = new FakeRepository(report());
    const ai: ReportExtractionAdapter = {
      extract: () => Promise.reject(new AiExtractionError("temporary", true, "AI_UNAVAILABLE")),
    };
    await expect(
      processorWith(repository, ai).process(job(), { number: 1, maximum: 4 }),
    ).rejects.toThrow();
    expect(repository.retryCodes).toEqual(["AI_UNAVAILABLE"]);
    expect(repository.failureCodes).toEqual([]);
  });

  it("marks a final failure with a safe code", async () => {
    const repository = new FakeRepository(report());
    const ai: ReportExtractionAdapter = {
      extract: () => Promise.reject(new AiExtractionError("temporary", true, "AI_UNAVAILABLE")),
    };
    await expect(
      processorWith(repository, ai).process(job(), { number: 4, maximum: 4 }),
    ).rejects.toBeInstanceOf(PermanentProcessingError);
    expect(repository.failureCodes).toEqual(["AI_UNAVAILABLE"]);
  });

  it("never sends a prescription to AI", async () => {
    const repository = new FakeRepository({ ...report(), documentType: "PRESCRIPTION" });
    let calls = 0;
    const ai: ReportExtractionAdapter = {
      extract: () => {
        calls += 1;
        return Promise.reject(new Error("must not run"));
      },
    };
    await expect(
      processorWith(repository, ai).process(job(), { number: 1, maximum: 4 }),
    ).rejects.toBeInstanceOf(PermanentProcessingError);
    expect(calls).toBe(0);
    expect(repository.failureCodes).toEqual(["PRESCRIPTION_AI_FORBIDDEN"]);
  });

  it("rejects malformed AI output at the persistence boundary", async () => {
    const repository = new FakeRepository(report());
    const ai = {
      extract: () => Promise.resolve({ extraction: { bad: true } } as unknown as ExtractionResult),
    };
    await expect(
      processorWith(repository, ai).process(job(), { number: 4, maximum: 4 }),
    ).rejects.toBeInstanceOf(PermanentProcessingError);
    expect(repository.persisted).toEqual([]);
    expect(repository.failureCodes).toEqual(["ANALYSIS_FAILED"]);
  });

  it("does not report success when the document version changed before persistence", async () => {
    const repository = new FakeRepository(report());
    repository.persistSucceeds = false;
    await expect(
      processorWith(repository, new MockReportExtractionAdapter(extraction)).process(job(), {
        number: 1,
        maximum: 4,
      }),
    ).resolves.toBe("stale");
  });

  it("allows only one concurrent worker claim for a document version", async () => {
    const repository = new SingleClaimRepository(report());
    const processor = new ReportProcessor(
      repository,
      { download: () => Promise.resolve(new Uint8Array([1])) },
      new MockReportExtractionAdapter(extraction),
    );
    const results = await Promise.all([
      processor.process(job(), { number: 1, maximum: 4 }),
      processor.process(job(), { number: 1, maximum: 4 }),
    ]);
    expect(results.sort()).toEqual(["not-found", "processed"]);
    expect(repository.persisted).toBe(1);
  });

  it("accepts only the authenticated-user/document storage namespace", () => {
    expect(isExpectedReportStoragePath("user-a", "doc-a", "user-a/doc-a/report.pdf")).toBe(true);
    expect(isExpectedReportStoragePath("user-a", "doc-a", "user-b/doc-a/report.pdf")).toBe(false);
    expect(isExpectedReportStoragePath("user-a", "doc-a", "user-a/doc-b/report.pdf")).toBe(false);
    expect(isExpectedReportStoragePath("user-a", "doc-a", "user-a\\doc-a\\report.pdf")).toBe(false);
  });
});

class FakeRepository implements ReportProcessorRepository {
  persisted: ExtractionResult[] = [];
  retryCodes: string[] = [];
  failureCodes: string[] = [];
  persistSucceeds = true;

  constructor(public claimed: ClaimedReport | "complete" | null) {}
  claim() {
    return Promise.resolve(this.claimed);
  }
  persist(_document: ClaimedReport, result: ExtractionResult) {
    this.persisted.push(result);
    return Promise.resolve(this.persistSucceeds);
  }
  markRetry(_document: ClaimedReport, safeCode: string) {
    this.retryCodes.push(safeCode);
    return Promise.resolve();
  }
  markFailed(_document: ClaimedReport, safeCode: string) {
    this.failureCodes.push(safeCode);
    return Promise.resolve();
  }
}

class SingleClaimRepository implements ReportProcessorRepository {
  persisted = 0;
  private available = true;

  constructor(private readonly report: ClaimedReport) {}

  async claim(): Promise<ClaimedReport | null> {
    await Promise.resolve();
    if (!this.available) return null;
    this.available = false;
    return this.report;
  }

  persist(): Promise<boolean> {
    this.persisted += 1;
    return Promise.resolve(true);
  }

  markRetry(): Promise<void> {
    return Promise.resolve();
  }

  markFailed(): Promise<void> {
    return Promise.resolve();
  }
}

function processorWith(repository: FakeRepository, ai: ReportExtractionAdapter) {
  return new ReportProcessor(
    repository,
    { download: () => Promise.resolve(new Uint8Array([1])) },
    ai,
  );
}
function job() {
  return { documentId: "10000000-0000-4000-8000-000000000001", documentVersion: 1 };
}
function report(): ClaimedReport {
  return {
    ...job(),
    id: job().documentId,
    documentType: "REPORT",
    storagePath: "user/document/report.pdf",
    mimeType: "application/pdf",
  };
}
