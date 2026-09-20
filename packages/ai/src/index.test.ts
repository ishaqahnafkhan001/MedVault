import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GEMINI_MODEL, reportExtractionSchema } from "@medvault/shared";

const mocked = vi.hoisted(() => ({ generate: vi.fn(), clientOptions: [] as unknown[] }));
vi.mock("@google/genai", () => ({
  ThinkingLevel: { MINIMAL: "MINIMAL" },
  GoogleGenAI: class {
    models = { generateContent: mocked.generate };
    constructor(options: unknown) {
      mocked.clientOptions.push(options);
    }
  },
}));

import { GeminiReportExtractionAdapter, MockReportExtractionAdapter } from "./index.js";

const validExtraction = {
  documentReportType: "Laboratory report",
  testName: "Complete Blood Count",
  normalizedTestName: "CBC",
  reportDate: "2026-08-05",
  hospitalName: "Popular Diagnostic Centre",
  category: "HEMATOLOGY" as const,
  patientNameOnReport: null,
  measurements: [
    {
      name: "Platelet Count",
      normalizedName: "platelet count",
      textValue: null,
      numericValue: 95000,
      unit: "/µL",
      referenceRange: "150000-450000",
      sourceFlag: "LOW",
    },
  ],
};

describe("AI extraction contract", () => {
  beforeEach(() => {
    mocked.generate.mockReset();
    mocked.clientOptions.length = 0;
  });

  it("accepts a valid structured response", async () => {
    const adapter = new MockReportExtractionAdapter(validExtraction);
    await expect(adapter.extract()).resolves.toMatchObject({ extraction: validExtraction });
  });

  it("rejects malformed structured output", () => {
    expect(() =>
      reportExtractionSchema.parse({
        ...validExtraction,
        measurements: [{ name: "Missing value" }],
      }),
    ).toThrow();
  });
});

describe("Gemini report adapter with mocked SDK transport", () => {
  const file = { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" as const };

  beforeEach(() => {
    mocked.generate.mockReset();
    mocked.clientOptions.length = 0;
  });

  it("pins the Developer API and bounds classification requests", async () => {
    mocked.generate.mockResolvedValue({
      text: '{"type":"REPORT","readable":true,"supported":true,"reasonCode":"OK"}',
    });

    await new GeminiReportExtractionAdapter("fixture-key").classify(file, "REPORT");

    expect(mocked.clientOptions).toEqual([
      {
        apiKey: "fixture-key",
        enterprise: false,
        vertexai: false,
        apiVersion: "v1beta",
        httpOptions: { baseUrl: "https://generativelanguage.googleapis.com" },
      },
    ]);
    expect(mocked.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: DEFAULT_GEMINI_MODEL,
        config: expect.objectContaining({
          thinkingConfig: { thinkingLevel: "MINIMAL" },
          abortSignal: expect.any(AbortSignal),
          httpOptions: { timeout: 45000, retryOptions: { attempts: 1 } },
          responseJsonSchema: expect.objectContaining({
            additionalProperties: false,
            properties: expect.objectContaining({
              reasonCode: expect.objectContaining({
                enum: expect.arrayContaining(["OK", "CATEGORY_MISMATCH"]),
              }),
            }),
          }),
        }),
      }),
    );
  });

  it("does not apply verified-model thinking settings to an arbitrary override", async () => {
    mocked.generate.mockResolvedValue({
      text: '{"type":"REPORT","readable":true,"supported":true,"reasonCode":"OK"}',
    });

    await new GeminiReportExtractionAdapter("fixture-key", "gemini-3-unverified").classify(
      file,
      "REPORT",
    );

    expect(mocked.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-3-unverified",
        config: expect.objectContaining({ temperature: 0 }),
      }),
    );
    expect(mocked.generate.mock.calls[0]?.[0]?.config).not.toHaveProperty("thinkingConfig");
  });

  it.each([
    { status: 400, transient: false },
    { status: 401, transient: false },
    { status: 403, transient: false },
    { status: 404, transient: false },
    { status: 408, transient: true },
    { status: 429, transient: true },
    { status: 500, transient: true },
    { status: 503, transient: true },
    { status: 599, transient: true },
    { status: undefined, transient: true },
  ])(
    "classifies classification HTTP $status without logging provider details",
    async ({ status, transient }) => {
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const warningLog = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const upstreamError = {
        ...(status === undefined ? {} : { status }),
        message: "private upstream details: key=fixture-secret",
      };
      mocked.generate.mockRejectedValue(upstreamError);

      try {
        await expect(
          new GeminiReportExtractionAdapter("fixture-key").classify(file, "REPORT"),
        ).rejects.toMatchObject({
          safeCode: "AI_UNAVAILABLE",
          transient,
          message: "Document classification failed due to a technical error",
        });
        expect(errorLog).not.toHaveBeenCalled();
        expect(warningLog).not.toHaveBeenCalled();
      } finally {
        errorLog.mockRestore();
        warningLog.mockRestore();
      }
    },
  );

  it.each([
    undefined,
    "",
    "not JSON",
    '{"type":"REPORT","readable":true,"supported":true}',
    '{"type":"REPORT","readable":true,"supported":true,"reasonCode":"UNKNOWN"}',
    '{"type":"REPORT","readable":true,"supported":true,"reasonCode":"OK","extra":true}',
  ])("rejects empty, malformed, or schema-invalid classification output", async (text) => {
    mocked.generate.mockResolvedValue({ text });
    await expect(
      new GeminiReportExtractionAdapter("fixture-key").classify(file, "REPORT"),
    ).rejects.toMatchObject({ safeCode: "AI_INVALID_OUTPUT", transient: false });
  });

  it("validates extraction output and bounds the provider request", async () => {
    mocked.generate.mockResolvedValue({ text: JSON.stringify(validExtraction) });
    const result = await new GeminiReportExtractionAdapter("fixture-key").extract(file);
    expect(result).toMatchObject({ extraction: validExtraction, model: DEFAULT_GEMINI_MODEL });
    expect(mocked.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          abortSignal: expect.any(AbortSignal),
          httpOptions: { timeout: 45000, retryOptions: { attempts: 1 } },
          responseJsonSchema: expect.objectContaining({
            additionalProperties: false,
            properties: expect.objectContaining({
              measurements: expect.objectContaining({
                items: expect.objectContaining({ additionalProperties: false }),
              }),
            }),
          }),
        }),
      }),
    );
  });

  it.each([
    undefined,
    "",
    "not JSON",
    '{"measurements":[]}',
    JSON.stringify({ ...validExtraction, extra: true }),
  ])("rejects empty, malformed, or schema-invalid extraction output", async (text) => {
    mocked.generate.mockResolvedValue({ text });
    await expect(
      new GeminiReportExtractionAdapter("fixture-key").extract(file),
    ).rejects.toMatchObject({ safeCode: "AI_INVALID_OUTPUT", transient: false });
  });

  it.each([
    { status: 400, transient: false },
    { status: 404, transient: false },
    { status: 408, transient: true },
    { status: 429, transient: true },
    { status: 500, transient: true },
    { status: undefined, transient: true },
  ])("classifies extraction HTTP $status safely", async ({ status, transient }) => {
    mocked.generate.mockRejectedValue(
      status === undefined
        ? new Error("private network details")
        : { status, message: "private upstream details" },
    );
    await expect(
      new GeminiReportExtractionAdapter("fixture-key").extract(file),
    ).rejects.toMatchObject({
      safeCode: "AI_UNAVAILABLE",
      transient,
      message: "Gemini report extraction failed",
    });
  });

  it("treats an aborted provider request as transient without exposing its details", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warningLog = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const abortError = new Error("private timeout details");
    abortError.name = "AbortError";
    mocked.generate.mockRejectedValue(abortError);

    try {
      await expect(
        new GeminiReportExtractionAdapter("fixture-key").extract(file),
      ).rejects.toMatchObject({
        safeCode: "AI_UNAVAILABLE",
        transient: true,
        message: "Gemini report extraction failed",
      });
      expect(errorLog).not.toHaveBeenCalled();
      expect(warningLog).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
      warningLog.mockRestore();
    }
  });
});
