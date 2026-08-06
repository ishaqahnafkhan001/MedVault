import { GoogleGenAI } from "@google/genai";
import { reportExtractionSchema, type ReportExtraction } from "@medvault/shared";

export const EXTRACTION_SCHEMA_VERSION = "phase1-v1";

export interface ReportFile {
  bytes: Uint8Array;
  mimeType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
}

export interface ExtractionResult {
  extraction: ReportExtraction;
  provider: "google";
  model: string;
  schemaVersion: typeof EXTRACTION_SCHEMA_VERSION;
  analyzedAt: Date;
}

export interface ReportExtractionAdapter {
  extract(file: ReportFile): Promise<ExtractionResult>;
}

export class AiExtractionError extends Error {
  constructor(
    message: string,
    readonly transient: boolean,
    readonly safeCode: "AI_UNAVAILABLE" | "AI_INVALID_OUTPUT" | "UNSUPPORTED_REPORT",
  ) {
    super(message);
    this.name = "AiExtractionError";
  }
}

const responseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "documentReportType",
    "testName",
    "normalizedTestName",
    "reportDate",
    "hospitalName",
    "category",
    "patientNameOnReport",
    "measurements",
  ],
  properties: {
    documentReportType: { type: "string" },
    testName: { type: "string" },
    normalizedTestName: { type: ["string", "null"] },
    reportDate: { type: ["string", "null"], format: "date" },
    hospitalName: { type: ["string", "null"] },
    category: {
      type: "string",
      enum: [
        "HEMATOLOGY",
        "BIOCHEMISTRY",
        "IMMUNOLOGY",
        "MICROBIOLOGY",
        "ENDOCRINOLOGY",
        "CARDIOLOGY",
        "RADIOLOGY",
        "PATHOLOGY",
        "URINALYSIS",
        "OTHER",
      ],
    },
    patientNameOnReport: { type: ["string", "null"] },
    measurements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name",
          "normalizedName",
          "textValue",
          "numericValue",
          "unit",
          "referenceRange",
          "sourceFlag",
        ],
        properties: {
          name: { type: "string" },
          normalizedName: { type: ["string", "null"] },
          textValue: { type: ["string", "null"] },
          numericValue: { type: ["number", "null"] },
          unit: { type: ["string", "null"] },
          referenceRange: { type: ["string", "null"] },
          sourceFlag: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

export class GeminiReportExtractionAdapter implements ReportExtractionAdapter {
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model = "gemini-2.5-flash",
  ) {
    if (!apiKey) throw new Error("GEMINI_API_KEY is required for live report extraction");
    this.client = new GoogleGenAI({ apiKey });
  }

  async extract(file: ReportFile): Promise<ExtractionResult> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: [
          {
            inlineData: {
              data: Buffer.from(file.bytes).toString("base64"),
              mimeType: file.mimeType,
            },
          },
          {
            text: [
              "Extract only facts explicitly printed in this medical report.",
              "Do not diagnose, interpret, infer health status, or recommend treatment.",
              "Use null when a field is absent. Preserve source high/low/abnormal flags only when printed.",
              "Return one structured JSON object matching the response schema.",
            ].join(" "),
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema,
          temperature: 0,
        },
      });

      if (!response.text) {
        throw new AiExtractionError(
          "Gemini returned an empty response",
          false,
          "AI_INVALID_OUTPUT",
        );
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(response.text);
      } catch {
        throw new AiExtractionError("Gemini returned invalid JSON", false, "AI_INVALID_OUTPUT");
      }
      const extraction = reportExtractionSchema.safeParse(parsed);
      if (!extraction.success) {
        throw new AiExtractionError("Gemini output failed validation", false, "AI_INVALID_OUTPUT");
      }
      return {
        extraction: extraction.data,
        provider: "google",
        model: this.model,
        schemaVersion: EXTRACTION_SCHEMA_VERSION,
        analyzedAt: new Date(),
      };
    } catch (error) {
      if (error instanceof AiExtractionError) throw error;
      const status = getStatus(error);
      const transient = status === undefined || status === 408 || status === 429 || status >= 500;
      throw new AiExtractionError("Gemini report extraction failed", transient, "AI_UNAVAILABLE");
    }
  }
}

function getStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  return typeof error.status === "number" ? error.status : undefined;
}

export class MockReportExtractionAdapter implements ReportExtractionAdapter {
  constructor(private readonly result: ReportExtraction) {}

  extract(): Promise<ExtractionResult> {
    return Promise.resolve({
      extraction: reportExtractionSchema.parse(this.result),
      provider: "google",
      model: "mock-gemini",
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
      analyzedAt: new Date("2026-08-07T00:00:00.000Z"),
    });
  }
}
