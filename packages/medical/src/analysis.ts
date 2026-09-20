import {
  ANALYSIS_CONFIG_VERSION,
  SUMMARY_PROMPT_VERSION,
  analysisSourceSchema,
  summaryInputSchema,
  type AnalysisSource,
  type MeasurementSeriesDto,
  type TrendPointDto,
  type SummaryFact,
  type SummaryInput,
  type AnalysisFilter,
} from "@medvault/shared";
import {
  normalizeTestName,
  convertUnit,
  computeChange,
  seriesCompatible,
  isQualitativeValue,
} from "./index.js";
import { explainNormalizedMetric } from "./intelligence.js";

export function sourceExclusion(source: AnalysisSource, patientId: string): string | null {
  if (source.patientId !== patientId) return "NOT_FOUND";
  if (source.documentType !== "REPORT") return "NOT_REPORT";
  if (
    source.verificationStatus !== "VERIFIED" ||
    source.processingStatus !== "VERIFIED" ||
    source.extraction?.status !== "VERIFIED"
  )
    return "NOT_REVIEWED";
  if (source.extraction.documentVersion !== source.documentVersion)
    return "SOURCE_VERSION_MISMATCH";
  return null;
}

export function parseReferenceBounds(text: string | null): { low: number; high: number } | null {
  if (!text) return null;
  // Only a complete, unambiguous two-bound interval. Age/sex/method-specific prose is not guessed.
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(-?\d+(?:\.\d+)?)\s*$/i.exec(text);
  if (!match) return null;
  const low = Number(match[1]);
  const high = Number(match[2]);
  return Number.isFinite(low) && Number.isFinite(high) && low <= high ? { low, high } : null;
}

export function sourceFlagKind(flag: string | null): TrendPointDto["flag"] {
  const key = flag?.trim().toUpperCase() ?? "";
  if (["CRITICAL", "HH", "LL", "PANIC"].includes(key)) return "CRITICAL";
  if (["H", "HIGH"].includes(key)) return "HIGH";
  if (["L", "LOW"].includes(key)) return "LOW";
  if (["A", "ABNORMAL"].includes(key)) return "ABNORMAL";
  if (["N", "NORMAL"].includes(key)) return "NORMAL";
  return "UNKNOWN";
}

export function commonReferenceBounds(points: readonly TrendPointDto[]) {
  const first = points[0];
  if (
    !first?.rangeBounds ||
    first.unit === null ||
    points.some(
      (p) =>
        !p.rangeBounds ||
        p.unit !== first.unit ||
        p.rangeBounds.low !== first.rangeBounds?.low ||
        p.rangeBounds.high !== first.rangeBounds?.high,
    )
  )
    return null;
  return first.rangeBounds;
}

export function buildMeasurementSeries(
  rawSources: readonly AnalysisSource[],
  patientId: string,
  filter: AnalysisFilter = {},
) {
  const sources = rawSources
    .map((s) => analysisSourceSchema.parse(s))
    .sort(
      (a, b) =>
        (a.documentDate ?? "9999").localeCompare(b.documentDate ?? "9999") ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
  const groups: MeasurementSeriesDto[] = [];
  const excludedReports: { id: string; reason: string }[] = [];
  const seen = new Set<string>();
  const sourceByPoint = new Map<string, AnalysisSource>();
  for (const source of sources) {
    const excluded = sourceExclusion(source, patientId);
    if (excluded) {
      excludedReports.push({ id: source.id, reason: excluded });
      continue;
    }
    if (
      (filter.dateFrom || filter.dateTo) &&
      (!source.documentDate ||
        (filter.dateFrom && source.documentDate < filter.dateFrom) ||
        (filter.dateTo && source.documentDate > filter.dateTo))
    )
      continue;
    if (!source.extraction) continue;
    for (const m of [...source.extraction.measurements].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
    )) {
      const name = normalizeTestName(m.name);
      if (!name || (filter.metric && normalizeTestName(filter.metric) !== name)) continue;
      // Identical bytes + same reviewed observation/slot/date identify repeat imports, not same-day repeat tests.
      const duplicate = JSON.stringify([
        source.checksum,
        source.documentDate,
        source.laboratory,
        source.method,
        source.specimen,
        m.sortOrder,
        name,
        m.numericValue,
        m.textValue,
        m.unit,
        m.referenceRange,
        m.sourceFlag,
      ]);
      if (seen.has(duplicate)) continue;
      seen.add(duplicate);
      const context = {
        normalizedName: name,
        unit: m.unit,
        laboratory: source.laboratory,
        method: source.method,
        specimen: source.specimen,
      };
      const kind: TrendPointDto["valueKind"] = /^[<>≤≥]/.test(m.textValue?.trim() ?? "")
        ? "BOUNDED"
        : isQualitativeValue(m.textValue) ||
            (m.textValue !== null &&
              (m.numericValue === null ||
                !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(m.textValue.trim()) ||
                Number(m.textValue) !== m.numericValue))
          ? "QUALITATIVE"
          : m.numericValue !== null
            ? "EXACT"
            : "MISSING";
      let group = groups.find((g) => {
        const firstPoint = g.points[0];
        const firstSource = firstPoint ? sourceByPoint.get(firstPoint.measurementId) : undefined;
        if (!firstPoint || !firstSource) return false;
        if (kind !== "EXACT" && g.canonicalUnit !== m.unit) return false;
        return seriesCompatible(context, {
          normalizedName: g.normalizedTestName,
          unit: g.canonicalUnit,
          laboratory: firstSource.laboratory,
          method: firstSource.method,
          specimen: firstSource.specimen,
        }).compatible;
      });
      if (!group) {
        group = {
          id: `${name}-${groups.length}`,
          normalizedTestName: name,
          canonicalUnit: m.unit,
          comparability:
            source.laboratory && source.method && source.specimen && m.unit
              ? "ESTABLISHED"
              : "UNCERTAIN",
          limitations: [
            "Patient review is not clinician certification.",
            ...(!source.method || !source.specimen || !source.laboratory || !m.unit
              ? [
                  "Laboratory, method, specimen or unit context is incomplete; numerical changes do not establish clinical comparability.",
                ]
              : []),
          ],
          points: [],
          excluded: [],
        };
        groups.push(group);
      }
      let numericValue = kind === "EXACT" ? m.numericValue : null;
      let rangeBounds = parseReferenceBounds(m.referenceRange);
      const converted =
        numericValue !== null &&
        m.unit !== null &&
        group.canonicalUnit !== null &&
        m.unit.toLowerCase().trim() !== group.canonicalUnit.toLowerCase().trim();
      if (converted && m.unit && group.canonicalUnit && numericValue !== null) {
        numericValue = convertUnit(numericValue, m.unit, group.canonicalUnit, { analyte: name });
        if (rangeBounds)
          rangeBounds = {
            low: convertUnit(rangeBounds.low, m.unit, group.canonicalUnit, { analyte: name }),
            high: convertUnit(rangeBounds.high, m.unit, group.canonicalUnit, { analyte: name }),
          };
      }
      const previous = group.points.at(-1);
      let change: TrendPointDto["change"] = null;
      // Same-day date-only observations have no known within-day clinical sequence.
      if (
        previous?.reportDate &&
        source.documentDate &&
        previous.reportDate < source.documentDate &&
        previous.numericValue !== null &&
        numericValue !== null &&
        group.canonicalUnit
      ) {
        try {
          change = {
            previousMeasurementId: previous.measurementId,
            ...computeChange(previous.numericValue, numericValue),
          };
        } catch {
          /* Explicitly unavailable on non-finite arithmetic. */
        }
      }
      group.points.push({
        reportId: source.id,
        extractionId: source.extraction.id,
        measurementId: m.id,
        reportDate: source.documentDate,
        numericValue,
        textValue: m.textValue,
        unit: group.canonicalUnit,
        referenceRange: converted
          ? rangeBounds
            ? `${rangeBounds.low}–${rangeBounds.high}`
            : null
          : m.referenceRange,
        rangeBounds,
        sourceFlag: m.sourceFlag,
        flag: sourceFlagKind(m.sourceFlag),
        verified: true,
        converted,
        originalUnit: m.unit,
        originalNumericValue: m.numericValue,
        originalTextValue: m.textValue,
        originalReferenceRange: m.referenceRange,
        laboratory: source.laboratory,
        method: source.method,
        specimen: source.specimen,
        valueKind: kind,
        change,
      });
      sourceByPoint.set(m.id, source);
    }
  }
  return { series: groups, excludedReports };
}

export function buildSummaryInput(
  scope: SummaryInput["scope"],
  series: readonly MeasurementSeriesDto[],
): SummaryInput {
  const facts: SummaryFact[] = [];
  for (const s of series)
    for (const p of s.points) {
      const value =
        p.valueKind === "EXACT" ? String(p.numericValue) : (p.textValue ?? "unavailable");
      const units = p.unit ?? "unit unknown";
      const date = p.reportDate ?? "date unknown";
      facts.push({
        id: `observation-${p.measurementId}`,
        kind: "OBSERVATION",
        measurementIds: [p.measurementId],
        text: `${s.normalizedTestName}: ${value} ${units}; report date ${date}. Source range: ${p.referenceRange ?? "unknown"}.`,
      });
      if (p.flag !== "UNKNOWN")
        facts.push({
          id: `flag-${p.measurementId}`,
          kind: "SOURCE_FLAG",
          measurementIds: [p.measurementId],
          text: `${s.normalizedTestName}: the source report flag is ${p.sourceFlag}. This is a report annotation, not an independent urgency assessment.`,
        });
      if (scope === "EPISODE" && p.change)
        facts.push({
          id: `change-${p.measurementId}`,
          kind: "CHANGE",
          measurementIds: [p.change.previousMeasurementId, p.measurementId],
          text: `${s.normalizedTestName}: numerical change ${p.change.absolute} ${units}; percentage change ${p.change.percentChange === null ? "unavailable (zero baseline)" : `${p.change.percentChange}%`}. Clinical significance ${s.comparability === "UNCERTAIN" ? "and comparability are" : "is"} not established.`,
        });
    }
  return summaryInputSchema.parse({
    scope,
    configVersion: ANALYSIS_CONFIG_VERSION,
    promptVersion: SUMMARY_PROMPT_VERSION,
    facts,
    explanations: [...new Set(series.map((item) => item.normalizedTestName))]
      .sort((left, right) => left.localeCompare(right, "en"))
      .map(explainNormalizedMetric),
  });
}
