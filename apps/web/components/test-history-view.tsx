"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, FileSearch, LoaderCircle, Search } from "lucide-react";
import { measurementHistoryResponseSchema, type MetricExplanationDto } from "@medvault/shared";
import { apiRequest } from "@/lib/api";
import { LatestMetricCard } from "./latest-metric-card";
import { MeasurementTable } from "./measurement-table";
import { TrendChart } from "./trend-chart";

export function TestHistoryView({ initialMetric = "" }: { initialMetric?: string }) {
  const [metric, setMetric] = useState(initialMetric);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const params = useMemo(() => {
    const value = new URLSearchParams();
    if (metric.trim()) value.set("metric", metric.trim());
    if (dateFrom) value.set("dateFrom", dateFrom);
    if (dateTo) value.set("dateTo", dateTo);
    return value.toString();
  }, [metric, dateFrom, dateTo]);
  const query = useQuery({
    queryKey: ["measurement-history", params],
    queryFn: async () =>
      measurementHistoryResponseSchema.parse(
        await apiRequest<unknown>(`/v1/measurements/history${params ? `?${params}` : ""}`),
      ).history,
  });

  const explanations = new Map(
    query.data?.explanations.map((item) => [item.normalizedTestName, item]) ?? [],
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <p className="eyebrow">Patient-reviewed measurements</p>
        <h1 className="page-title mt-2">Test history</h1>
        <p className="muted mt-2">
          Compare verified observations by clinical date and return to each original report.
        </p>
      </div>

      <section className="surface mt-7 rounded-2xl p-4" aria-label="Test history filters">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="relative">
            <span className="sr-only">Test or measurement</span>
            <Search
              className="pointer-events-none absolute left-3 top-3 text-[#77857f]"
              size={18}
            />
            <input
              className="field pl-10"
              value={metric}
              onChange={(event) => setMetric(event.target.value)}
              placeholder="Test or measurement"
            />
          </label>
          <label>
            <span className="sr-only">Clinical date from</span>
            <input
              className="field"
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => setDateFrom(event.target.value)}
              aria-label="Clinical date from"
            />
          </label>
          <label>
            <span className="sr-only">Clinical date to</span>
            <input
              className="field"
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => setDateTo(event.target.value)}
              aria-label="Clinical date to"
            />
          </label>
        </div>
        <p className="muted mt-3 text-xs">
          Date filters use the date printed on the report. Reports with an unknown clinical date
          remain visible only when no date filter is applied.
        </p>
      </section>

      {query.isLoading ? (
        <div className="grid min-h-[35vh] place-items-center" role="status">
          <LoaderCircle className="animate-spin text-[#176c5b]" aria-hidden="true" />
          <span className="sr-only">Loading test history</span>
        </div>
      ) : query.isError || !query.data ? (
        <section className="surface mt-7 rounded-2xl p-8 text-center" role="alert">
          <h2 className="text-lg font-extrabold">We couldn’t load test history</h2>
          <p className="muted mt-2 text-sm">Check the filters and connection, then try again.</p>
          <button className="button-primary mt-4" onClick={() => void query.refetch()}>
            Try again
          </button>
        </section>
      ) : (
        <>
          {query.data.limited && (
            <div className="mt-6 rounded-2xl border border-[#ebc988] bg-[#fff8e9] p-4 text-sm">
              This view is limited to the {query.data.sourceReportCount} newest eligible reports.
              Narrow the clinical-date range to inspect older history.
            </div>
          )}

          {query.data.latestMetrics.length > 0 && (
            <section className="mt-8" aria-labelledby="latest-values-heading">
              <h2 id="latest-values-heading" className="text-xl font-extrabold">
                Latest values by metric
              </h2>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {query.data.latestMetrics.map((card) => (
                  <LatestMetricCard key={card.normalizedTestName} card={card} />
                ))}
              </div>
            </section>
          )}

          <section className="mt-9" aria-labelledby="history-series-heading">
            <h2 id="history-series-heading" className="text-xl font-extrabold">
              Measurement series
            </h2>
            {query.data.series.length ? (
              <div className="mt-4 grid gap-6">
                {query.data.series.map((series) => (
                  <article className="surface rounded-2xl p-5" key={series.id}>
                    <Terminology explanation={explanations.get(series.normalizedTestName)} />
                    <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
                      <TrendChart series={series} />
                      <MeasurementTable series={series} />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-[#cbd8d3] p-8 text-center">
                <FileSearch className="mx-auto text-[#75a496]" aria-hidden="true" />
                <p className="muted mt-3 text-sm">
                  No patient-reviewed measurements match these filters.
                </p>
              </div>
            )}
          </section>

          <section
            className="mt-8 rounded-2xl border border-[#d9dedb] bg-white p-5"
            aria-labelledby="attention-heading"
          >
            <div className="flex gap-3">
              <CircleAlert className="shrink-0 text-[#8b5a17]" aria-hidden="true" />
              <div>
                <h2 id="attention-heading" className="font-extrabold">
                  Clinical attention: cannot assess
                </h2>
                <p className="muted mt-1 text-sm">{query.data.attention.message}</p>
                <p className="muted mt-2 text-xs">
                  Automated urgency enabled: no · Validated metric coverage: none
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Terminology({ explanation }: { explanation: MetricExplanationDto | undefined }) {
  if (!explanation) return null;
  return (
    <div>
      <p className="eyebrow">
        {explanation.certainty === "UNMAPPED" ? "Unmapped term" : "About this test"}
      </p>
      <h3 className="mt-1 text-lg font-extrabold">{explanation.displayName}</h3>
      <p className="mt-2 text-sm">{explanation.explanation}</p>
      <p className="muted mt-1 text-xs">{explanation.uncertainty}</p>
      {explanation.source && (
        <a
          className="mt-2 inline-block text-xs font-bold text-[#176c5b] underline"
          href={explanation.source.url}
          target="_blank"
          rel="noreferrer"
        >
          Source: {explanation.source.publisher}, {explanation.source.title}
        </a>
      )}
    </div>
  );
}
