import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  measurementSeriesSchema,
  episodeAnalysisSchema,
  latestMetricCardSchema,
  TERMINOLOGY_MAPPING_VERSION,
  SUMMARY_LIMITATIONS,
  SUMMARY_GUIDANCE,
} from "@medvault/shared";
import { TrendChart } from "./trend-chart";
import { MeasurementTable } from "./measurement-table";
import { SummaryContent } from "./summary-panel";
import { signedFileRefreshInterval, summaryPollInterval } from "../lib/phase2-api";
import { PrescriptionStoredMessage } from "./report-review";
import { LatestMetricCard } from "./latest-metric-card";
vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function series() {
  return measurementSeriesSchema.parse({
    id: "hemoglobin-0",
    normalizedTestName: "hemoglobin",
    canonicalUnit: "g/dL",
    comparability: "UNCERTAIN",
    limitations: [],
    excluded: [],
    points: [1, 2].map((n) => ({
      reportId: id(n),
      extractionId: id(n + 10),
      measurementId: id(n + 20),
      reportDate: `2026-09-0${n}`,
      numericValue: 14,
      textValue: null,
      unit: "g/dL",
      referenceRange: "12-16",
      rangeBounds: { low: 12, high: 16 },
      sourceFlag: null,
      flag: "UNKNOWN",
      verified: true,
      converted: false,
      originalUnit: "g/dL",
      originalNumericValue: 14,
      originalTextValue: null,
      originalReferenceRange: "12-16",
      laboratory: null,
      method: null,
      specimen: null,
      valueKind: "EXACT",
      change: null,
    })),
  });
}
describe("rendered comparison and summary states", () => {
  it("rejects overflowing chart scales without inventing replacement values", () => {
    const s = series();
    s.points[0]!.numericValue = -Number.MAX_VALUE;
    s.points[1]!.numericValue = Number.MAX_VALUE;
    const chart = renderToStaticMarkup(createElement(TrendChart, { series: s }));
    expect(chart).toContain("Values exceed the chart scale");
    expect(chart).not.toContain("<circle");
    expect(chart).not.toMatch(/NaN|Infinity/);
  });
  it("renders a shared band only for equivalent known ranges", () => {
    const s = series();
    expect(renderToStaticMarkup(createElement(TrendChart, { series: s }))).toContain(
      'data-testid="common-reference-band"',
    );
    for (const bounds of [null, { low: 10, high: 15 }]) {
      s.points[1]!.rangeBounds = bounds;
      const html = renderToStaticMarkup(createElement(TrendChart, { series: s }));
      expect(html).not.toContain('data-testid="common-reference-band"');
      expect(html).toContain('data-testid="range-unavailable"');
    }
  });
  it("renders source-specific flags, UTC dates and authorized source routes in table and keyboard chart", () => {
    const s = series();
    s.points[0]!.sourceFlag = "HIGH";
    s.points[0]!.flag = "HIGH";
    const chart = renderToStaticMarkup(createElement(TrendChart, { series: s }));
    const table = renderToStaticMarkup(createElement(MeasurementTable, { series: s }));
    expect(chart).toContain('tabindex="0"');
    expect(chart).toContain("source flag HIGH");
    expect(table).toContain("HIGH (high)");
    expect(table).toContain(`/reports/${id(1)}`);
    expect(table).toContain("Sep 1, 2026");
    expect(table).toContain("patient-reviewed");
    expect(chart).not.toMatch(/NaN|Infinity/);
  });
  it("renders one-point and empty states without fabricated measurements", () => {
    const s = series();
    s.points = s.points.slice(0, 1);
    expect(renderToStaticMarkup(createElement(TrendChart, { series: s }))).toContain(
      "One observation",
    );
    s.points[0]!.numericValue = null;
    s.points[0]!.textValue = "<5";
    s.points[0]!.valueKind = "BOUNDED";
    s.points[0]!.reportDate = null;
    const chart = renderToStaticMarkup(createElement(TrendChart, { series: s }));
    const table = renderToStaticMarkup(createElement(MeasurementTable, { series: s }));
    expect(chart).toContain("No plottable observations");
    expect(chart).not.toContain("<circle");
    expect(table).toContain("&lt;5");
    expect(table).toContain("Date unknown");
  });
  it.each(["QUEUED", "PROCESSING", "FAILED", "STALE"])(
    "shows actual %s state without presenting old text as current",
    (status) => {
      const analysis = episodeAnalysisSchema.parse({
        id: id(50),
        status,
        summaryText: "OLD CONTENT",
        result: null,
        provider: "google",
        model: "fixture",
        promptVersion: "fixture",
        inputFingerprint: "a".repeat(64),
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
        analyzedAt: null,
        failureCode: null,
      });
      const html = renderToStaticMarkup(createElement(SummaryContent, { analysis }));
      expect(html).toContain(status);
      expect(html).not.toContain("OLD CONTENT");
    },
  );
  it("stops polling on terminal states and after the delay budget", () => {
    const now = Date.parse("2026-09-01T00:00:00Z"),
      recent = new Date(now - 1000).toISOString();
    expect(summaryPollInterval("QUEUED", recent, now)).toBe(3000);
    for (const status of ["COMPLETED", "FAILED", "STALE"])
      expect(summaryPollInterval(status, recent, now)).toBe(false);
    expect(summaryPollInterval("PROCESSING", new Date(now - 120_000).toISOString(), now)).toBe(
      false,
    );
  });
  it("refreshes private file links before expiry", () => {
    expect(signedFileRefreshInterval(300)).toBe(270_000);
    expect(signedFileRefreshInterval(30)).toBe(5_000);
    expect(signedFileRefreshInterval(undefined)).toBe(false);
  });
  it("explains that a reclassified prescription was stored without extraction", () => {
    const html = renderToStaticMarkup(
      createElement(PrescriptionStoredMessage, { documentId: id(70) }),
    );
    expect(html).toContain("Prescription saved");
    expect(html).toContain("not sent through report extraction");
    expect(html).toContain(`/documents/${id(70)}`);
  });

  it("renders a latest-value card with clinical date, source range and original-report navigation", () => {
    const s = series();
    const card = latestMetricCardSchema.parse({
      normalizedTestName: s.normalizedTestName,
      canonicalUnit: s.canonicalUnit,
      comparability: s.comparability,
      observationCount: s.points.length,
      latest: s.points[1],
      explanation: {
        normalizedTestName: "hemoglobin",
        displayName: "Hemoglobin",
        explanation: "General sourced test information.",
        uncertainty: "This does not interpret the patient result.",
        mappingVersion: TERMINOLOGY_MAPPING_VERSION,
        certainty: "MAPPED_GENERAL_INFORMATION",
        source: {
          title: "Complete Blood Count (CBC)",
          publisher: "MedlinePlus",
          url: "https://medlineplus.gov/lab-tests/complete-blood-count-cbc/",
        },
      },
    });
    const html = renderToStaticMarkup(createElement(LatestMetricCard, { card }));
    expect(html).toContain("Latest patient-reviewed value");
    expect(html).toContain("14 g/dL");
    expect(html).toContain("Sep 2, 2026");
    expect(html).toContain("12-16");
    expect(html).toContain(`/reports/${id(2)}`);
    expect(html).toContain("/history?metric=hemoglobin");
    expect(html).toContain("does not interpret");
  });
  it("renders deterministic sourced explanations beside completed grounded findings", () => {
    const analysis = episodeAnalysisSchema.parse({
      id: id(80),
      status: "COMPLETED",
      summaryText: "Synthetic reviewed observation.",
      result: {
        findings: [
          {
            id: "observation-fixture",
            kind: "OBSERVATION",
            measurementIds: [id(81)],
            text: "Synthetic reviewed observation.",
          },
        ],
        explanations: [
          {
            normalizedTestName: "hemoglobin",
            displayName: "Hemoglobin",
            explanation: "Hemoglobin is an oxygen-carrying protein in red blood cells.",
            uncertainty: "General information only; this does not interpret the patient result.",
            mappingVersion: TERMINOLOGY_MAPPING_VERSION,
            certainty: "MAPPED_GENERAL_INFORMATION",
            source: {
              title: "Complete Blood Count (CBC)",
              publisher: "MedlinePlus",
              url: "https://medlineplus.gov/lab-tests/complete-blood-count-cbc/",
            },
          },
        ],
        limitations: SUMMARY_LIMITATIONS,
        guidance: SUMMARY_GUIDANCE,
      },
      provider: "google",
      model: "fixture",
      promptVersion: "phase2-grounded-v3",
      inputFingerprint: "a".repeat(64),
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      analyzedAt: "2026-09-01T00:00:00.000Z",
      failureCode: null,
    });
    const html = renderToStaticMarkup(createElement(SummaryContent, { analysis }));
    expect(html).toContain("About the tests mentioned");
    expect(html).toContain("oxygen-carrying protein");
    expect(html).toContain("Source: MedlinePlus");
    expect(html).toContain("does not interpret");
  });
});
