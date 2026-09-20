"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  episodeResponseSchema,
  episodeAddResponseSchema,
  episodeTrendResponseSchema,
  documentListResponseSchema,
  formatClinicalDate,
} from "@medvault/shared";
import { validatedRequest } from "@/lib/phase2-api";
import { apiRequest } from "@/lib/api";
import { TrendChart } from "./trend-chart";
import { MeasurementTable } from "./measurement-table";
import { SummaryPanel } from "./summary-panel";
import { EpisodeForm } from "./episode-form";

export function EpisodeView({ id }: { id: string }) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false),
    [mode, setMode] = useState<"chart" | "table">("chart");
  const [metric, setMetric] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [selection, setSelection] = useState<string[]>([]),
    [page, setPage] = useState(1);
  const [membershipNotice, setMembershipNotice] = useState("");
  const episodeQuery = useQuery({
    queryKey: ["episode", id],
    queryFn: () => validatedRequest(episodeResponseSchema, `/v1/episodes/${id}`),
  });
  const params = new URLSearchParams();
  if (from) params.set("dateFrom", from);
  if (to) params.set("dateTo", to);
  const trendQuery = useQuery({
    queryKey: ["episode", id, "trend", from, to],
    queryFn: () =>
      validatedRequest(episodeTrendResponseSchema, `/v1/episodes/${id}/trend?${params}`),
  });
  const candidates = useQuery({
    queryKey: ["episode-candidates", page],
    queryFn: () =>
      validatedRequest(documentListResponseSchema, `/v1/reports?page=${page}&pageSize=50`),
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["episode", id] });
    void client.invalidateQueries({ queryKey: ["summary", "EPISODE", id] });
    void client.invalidateQueries({ queryKey: ["episodes"] });
  };
  const add = useMutation({
    mutationFn: () =>
      validatedRequest(episodeAddResponseSchema, `/v1/episodes/${id}/documents`, {
        method: "POST",
        body: JSON.stringify({ documentIds: selection }),
      }),
    onSuccess: (result) => {
      setSelection([]);
      setMembershipNotice(
        `${result.added.length} reports added. ${result.skipped.map((s) => s.reason).join(", ")}`,
      );
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (reportId: string) =>
      apiRequest(`/v1/episodes/${id}/documents/${reportId}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  if (episodeQuery.isLoading) return <p role="status">Loading episode…</p>;
  if (episodeQuery.isError || !episodeQuery.data)
    return (
      <div role="alert">
        Episode unavailable. <button onClick={() => void episodeQuery.refetch()}>Retry</button>
      </div>
    );
  const episode = episodeQuery.data.episode;
  if (editing)
    return (
      <EpisodeForm
        existing={episode}
        onSaved={() => {
          setEditing(false);
          refresh();
        }}
      />
    );
  const allSeries = trendQuery.data?.trend.series ?? [];
  const series = metric ? allSeries.filter((s) => s.normalizedTestName === metric) : allSeries;
  const analysis = episode.analyses[0];
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <Link href="/episodes" className="text-emerald-700 underline">
        Back to episodes
      </Link>
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{episode.title}</h1>
          <p>
            {formatClinicalDate(episode.startDate)} — {formatClinicalDate(episode.endDate)} ·{" "}
            {episode.documents.length} reports
          </p>
          <p className="text-sm text-gray-600">
            A patient-created grouping is not a diagnosis or clinician-certified episode.
          </p>
        </div>
        <button className="rounded border px-4 py-2" onClick={() => setEditing(true)}>
          Edit title / dates
        </button>
      </header>
      <section className="space-y-3 rounded-xl border bg-white p-4">
        <h2 className="text-xl font-semibold">Report membership</h2>
        <ul>
          {episode.documents.map((d) => (
            <li className="flex flex-wrap items-center gap-3 border-b py-2" key={d.id}>
              <Link className="text-emerald-700 underline" href={`/reports/${d.id}`}>
                {d.testName ?? d.originalFilename}
              </Link>
              <span>
                {formatClinicalDate(d.documentDate)} · {d.processingStatus}
              </span>
              <button
                disabled={remove.isPending}
                onClick={() => remove.mutate(d.id)}
                className="rounded border px-2 py-1"
              >
                Remove from episode
              </button>
            </li>
          ))}
        </ul>
        <h3 className="font-semibold">Select reviewed reports to add</h3>
        {candidates.isLoading && <p role="status">Loading reports…</p>}
        {candidates.isError && <p role="alert">Unable to load available reports.</p>}
        <ul className="max-h-72 overflow-y-auto">
          {candidates.data?.items.map((d) => {
            const member = episode.documents.some((m) => m.id === d.id);
            const reason = member
              ? "Already in episode"
              : d.documentType !== "REPORT"
                ? "Prescriptions are stored only"
                : d.processingStatus !== "VERIFIED" || d.verificationStatus !== "VERIFIED"
                  ? "Patient review required"
                  : null;
            return (
              <li className="py-1" key={d.id}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={Boolean(reason)}
                    checked={selection.includes(d.id)}
                    onChange={(e) =>
                      setSelection((current) =>
                        e.target.checked ? [...current, d.id] : current.filter((x) => x !== d.id),
                      )
                    }
                  />
                  {d.testName ?? d.originalFilename} — {formatClinicalDate(d.documentDate)}{" "}
                  {reason && <span>({reason})</span>}
                </label>
              </li>
            );
          })}
        </ul>
        <div className="flex gap-3">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Previous reports
          </button>
          <span>Page {page}</span>
          <button
            disabled={!candidates.data || page >= candidates.data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next reports
          </button>
        </div>
        <button
          className="rounded bg-emerald-700 px-4 py-2 text-white disabled:opacity-50"
          disabled={!selection.length || selection.length > 30 || add.isPending}
          onClick={() => add.mutate()}
        >
          Add selected reports
        </button>
        {membershipNotice && <p role="status">{membershipNotice}</p>}
        {(add.isError || remove.isError) && (
          <p role="alert">
            Membership update failed. Check ownership, review status and the 30-report limit.
          </p>
        )}
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Reviewed comparisons</h2>
        <div className="flex flex-wrap gap-3">
          <label>
            Metric{" "}
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className="rounded border p-2"
            >
              <option value="">All metrics</option>
              {[...new Set(allSeries.map((s) => s.normalizedTestName))].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            From{" "}
            <input
              aria-label="From report date"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded border p-2"
            />
          </label>
          <label>
            To{" "}
            <input
              aria-label="To report date"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded border p-2"
            />
          </label>
          <button aria-pressed={mode === "chart"} onClick={() => setMode("chart")}>
            Charts
          </button>
          <button aria-pressed={mode === "table"} onClick={() => setMode("table")}>
            Tables
          </button>
        </div>
        {trendQuery.isLoading && <p role="status">Loading observations…</p>}
        {trendQuery.isError && (
          <p role="alert">Unable to load comparisons. Check the date range and retry.</p>
        )}
        {!trendQuery.isLoading && !trendQuery.isError && !series.length && (
          <p>No eligible observations match these filters.</p>
        )}
        {series.map((s) => (
          <div key={s.id} className="space-y-3">
            {mode === "chart" && <TrendChart series={s} />}
            <MeasurementTable series={s} />
          </div>
        ))}
        {trendQuery.data?.trend.excludedReports.map((d) => (
          <p key={d.id}>
            Report excluded: {d.reason}. <Link href={`/reports/${d.id}`}>Review source</Link>
          </p>
        ))}
      </section>
      {episode.summaryUnavailable && (
        <p role="status">
          Summary storage awaits the approved database migration. Reports and comparisons remain
          available.
        </p>
      )}
      <SummaryPanel
        key={analysis?.id ?? id}
        scope="EPISODE"
        id={id}
        eligible={
          !episode.summaryUnavailable &&
          episode.documents.length > 0 &&
          episode.documents.every(
            (d) => d.processingStatus === "VERIFIED" && d.verificationStatus === "VERIFIED",
          )
        }
        {...(analysis ? { analysisId: analysis.id } : {})}
        sourceLinks={episode.documents.map((d) => ({
          id: d.id,
          label: d.testName ?? "Source report",
        }))}
      />
    </div>
  );
}
