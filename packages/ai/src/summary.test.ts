import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANALYSIS_CONFIG_VERSION,
  DEFAULT_GEMINI_MODEL,
  SUMMARY_PROMPT_VERSION,
  type SummaryInput,
} from "@medvault/shared";
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
import { GeminiEpisodeSummaryAdapter } from "./index.js";
const input: SummaryInput = {
  scope: "REPORT",
  configVersion: ANALYSIS_CONFIG_VERSION,
  promptVersion: SUMMARY_PROMPT_VERSION,
  facts: [
    {
      id: "fact-1",
      kind: "OBSERVATION",
      measurementIds: ["00000000-0000-4000-8000-000000000001"],
      text: "Synthetic observation only.",
    },
  ],
  explanations: [],
};
describe("Gemini summary adapter with mocked SDK transport", () => {
  beforeEach(() => {
    mocked.generate.mockReset();
    mocked.clientOptions.length = 0;
  });
  it("bounds requests and grounds references instead of trusting generated prose", async () => {
    mocked.generate.mockResolvedValue({ text: '{"findings":[{"factId":"fact-1"}]}' });
    const result = await new GeminiEpisodeSummaryAdapter("fixture-key", "fixture-model").summarize(
      input,
    );
    expect(result.result.findings).toEqual(input.facts);
    expect(mocked.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "fixture-model",
        config: expect.objectContaining({
          maxOutputTokens: 4096,
          httpOptions: { timeout: 45000, retryOptions: { attempts: 1 } },
          abortSignal: expect.any(AbortSignal),
        }),
      }),
    );
    const sent = JSON.parse(
      (mocked.generate.mock.calls[0]![0] as { contents: Array<{ text: string }> }).contents[0]!
        .text,
    ) as Record<string, unknown>;
    expect(sent).not.toHaveProperty("explanations");
    expect(mocked.clientOptions).toEqual([
      {
        apiKey: "fixture-key",
        enterprise: false,
        vertexai: false,
        apiVersion: "v1beta",
        httpOptions: { baseUrl: "https://generativelanguage.googleapis.com" },
      },
    ]);
  });
  it("uses the supported stable model and minimal Gemini 3 thinking by default", async () => {
    mocked.generate.mockResolvedValue({ text: '{"findings":[{"factId":"fact-1"}]}' });
    await new GeminiEpisodeSummaryAdapter("fixture-key").summarize(input);
    expect(mocked.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: DEFAULT_GEMINI_MODEL,
        config: expect.objectContaining({
          thinkingConfig: { thinkingLevel: "MINIMAL" },
        }),
      }),
    );
  });
  it.each([
    "not JSON",
    '{"findings":[{"factId":"invented"}]}',
    '{"findings":[{"factId":"fact-1","diagnosis":"invented"}]}',
    '{"findings":[]}',
  ])("rejects malformed or invented provider output", async (text) => {
    mocked.generate.mockResolvedValue({ text });
    await expect(
      new GeminiEpisodeSummaryAdapter("fixture-key").summarize(input),
    ).rejects.toMatchObject({ safeCode: "AI_INVALID_OUTPUT", transient: false });
  });
  it.each([
    { status: 400, transient: false },
    { status: 401, transient: false },
    { status: 429, transient: true },
    { status: 503, transient: true },
    { status: 404, transient: false },
    { status: 403, transient: false },
  ])("classifies HTTP $status without persisting raw errors", async ({ status, transient }) => {
    mocked.generate.mockRejectedValue({ status, message: "private upstream details" });
    await expect(
      new GeminiEpisodeSummaryAdapter("fixture-key").summarize(input),
    ).rejects.toMatchObject({
      safeCode: "AI_UNAVAILABLE",
      transient,
      message: "Summary provider unavailable",
    });
  });
});
