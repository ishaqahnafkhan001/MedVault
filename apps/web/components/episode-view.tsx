"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  FileText,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Table as TableIcon,
  Trash2,
} from "lucide-react";
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
  if (episodeQuery.isLoading)
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <LoaderCircle className="animate-spin text-[#176c5b]" />
      </div>
    );
  if (episodeQuery.isError || !episodeQuery.data)
    return (
      <div className="surface mx-auto mt-16 max-w-lg rounded-2xl p-8 text-center" role="alert">
        <h1 className="text-xl font-extrabold">Episode unavailable</h1>
        <p className="muted mt-2 text-sm">Check connection or access permissions and try again.</p>
        <button
          className="button-primary mt-5 inline-flex items-center gap-2"
          onClick={() => void episodeQuery.refetch()}
        >
          <RefreshCw size={15} className="shrink-0" /> Retry
        </button>
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
      <Link
        href="/episodes"
        className="muted inline-flex items-center gap-2 text-sm font-semibold transition hover:text-[#176c5b]"
      >
        <ArrowLeft size={16} className="shrink-0" />
        Back to episodes
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Care episode</p>
          <h1 className="page-title mt-1">{episode.title}</h1>
          <p className="muted mt-2 text-sm font-medium">
            {formatClinicalDate(episode.startDate)} — {formatClinicalDate(episode.endDate)} ·{" "}
            {episode.documents.length} report{episode.documents.length === 1 ? "" : "s"}
          </p>
          <p className="muted mt-1 text-xs">
            A patient-created grouping is not a diagnosis or clinician-certified episode.
          </p>
        </div>
        <button
          className="button-secondary inline-flex items-center gap-1.5 text-sm"
          onClick={() => setEditing(true)}
        >
          <Pencil size={14} className="shrink-0" />
          Edit title / dates
        </button>
      </header>
      <section className="surface space-y-5 rounded-2xl p-6 sm:p-7 shadow-sm">
        <div>
          <h2 className="text-xl font-extrabold text-[#142621]">Report membership</h2>
          <p className="muted mt-1 text-xs">Reports included in this episode grouping</p>
        </div>
        {episode.documents.length === 0 ? (
          <p className="muted rounded-xl border border-dashed border-[#ccd9d4] bg-[#fafbf9] p-4 text-center text-sm">
            No reports attached to this episode yet.
          </p>
        ) : (
          <ul className="divide-y divide-[#e2e9e6] rounded-xl border border-[#dce5e1]">
            {episode.documents.map((d) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 p-3.5 transition hover:bg-[#fafbf9]"
                key={d.id}
              >
                <div className="flex items-center gap-3">
                  <FileText size={18} className="shrink-0 text-[#176c5b]" />
                  <div>
                    <Link
                      className="font-bold text-[#142621] hover:text-[#176c5b] hover:underline"
                      href={`/reports/${d.id}`}
                    >
                      {d.testName ?? d.originalFilename}
                    </Link>
                    <p className="muted text-xs">
                      {formatClinicalDate(d.documentDate)} · {d.processingStatus}
                    </p>
                  </div>
                </div>
                <button
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(d.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#e2e9e6] px-2.5 py-1 text-xs font-semibold text-[#a63d40] transition hover:border-red-200 hover:bg-red-50 disabled:opacity-50"
                  title="Remove from episode"
                >
                  <Trash2 size={13} className="shrink-0" />
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-[#e2e9e6] pt-5">
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-[#40514c]">
            Select reviewed reports to add
          </h3>
          {candidates.isLoading && (
            <p role="status" className="muted mt-2 text-sm">
              Loading reports…
            </p>
          )}
          {candidates.isError && (
            <p role="alert" className="mt-2 rounded-xl bg-[#f8e4e4] p-3 text-sm text-[#963e42]">
              Unable to load available reports.
            </p>
          )}
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
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
                <li key={d.id}>
                  <label
                    className={`flex items-center gap-3 rounded-xl border p-3 text-sm transition ${
                      selection.includes(d.id)
                        ? "border-[#176c5b] bg-[#eef6f3]"
                        : "border-[#e2e9e6] bg-white hover:bg-[#fafbf9]"
                    } ${reason ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                  >
                    <input
                      type="checkbox"
                      disabled={Boolean(reason)}
                      checked={selection.includes(d.id)}
                      className="rounded border-[#ccd9d4] text-[#176c5b] focus:ring-[#176c5b]"
                      onChange={(e) =>
                        setSelection((current) =>
                          e.target.checked ? [...current, d.id] : current.filter((x) => x !== d.id),
                        )
                      }
                    />
                    <span className="font-semibold text-[#142621]">
                      {d.testName ?? d.originalFilename}
                    </span>
                    <span className="muted text-xs">— {formatClinicalDate(d.documentDate)}</span>
                    {reason && (
                      <span className="ml-auto text-xs font-medium text-[#8b5a17]">({reason})</span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="button-secondary inline-flex items-center gap-1 px-3 py-1.5 text-xs"
              >
                <ChevronLeft size={14} className="shrink-0" /> Previous
              </button>
              <span className="muted px-2 text-xs font-semibold">Page {page}</span>
              <button
                disabled={!candidates.data || page >= candidates.data.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="button-secondary inline-flex items-center gap-1 px-3 py-1.5 text-xs"
              >
                Next <ChevronRight size={14} className="shrink-0" />
              </button>
            </div>
            <button
              className="button-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs"
              disabled={!selection.length || selection.length > 30 || add.isPending}
              onClick={() => add.mutate()}
            >
              {add.isPending ? (
                <LoaderCircle size={14} className="shrink-0 animate-spin" />
              ) : (
                <Plus size={14} className="shrink-0" />
              )}
              Add selected reports
            </button>
          </div>
          {membershipNotice && (
            <p
              role="status"
              className="mt-3 rounded-xl bg-[#eef6f3] p-3 text-xs font-semibold text-[#176c5b]"
            >
              {membershipNotice}
            </p>
          )}
          {(add.isError || remove.isError) && (
            <p role="alert" className="mt-3 rounded-xl bg-[#f8e4e4] p-3 text-xs text-[#963e42]">
              Membership update failed. Check ownership, review status and the 30-report limit.
            </p>
          )}
        </div>
      </section>
      <section className="surface space-y-5 rounded-2xl p-6 sm:p-7 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Trends &amp; Metrics</p>
            <h2 className="mt-1 text-xl font-extrabold text-[#142621]">Reviewed comparisons</h2>
          </div>
          <div className="inline-flex rounded-xl bg-[#eef3f0] p-1">
            <button
              aria-pressed={mode === "chart"}
              onClick={() => setMode("chart")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                mode === "chart"
                  ? "bg-white text-[#142621] shadow-sm"
                  : "text-[#53655f] hover:text-[#142621]"
              }`}
            >
              <BarChart2 size={14} className="shrink-0" />
              Charts
            </button>
            <button
              aria-pressed={mode === "table"}
              onClick={() => setMode("table")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                mode === "table"
                  ? "bg-white text-[#142621] shadow-sm"
                  : "text-[#53655f] hover:text-[#142621]"
              }`}
            >
              <TableIcon size={14} className="shrink-0" />
              Tables
            </button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Metric</label>
            <select value={metric} onChange={(e) => setMetric(e.target.value)} className="field">
              <option value="">All metrics</option>
              {[...new Set(allSeries.map((s) => s.normalizedTestName))].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">From</label>
            <input
              aria-label="From report date"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label className="label">To</label>
            <input
              aria-label="To report date"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="field"
            />
          </div>
        </div>
        {trendQuery.isLoading && (
          <p role="status" className="muted text-sm">
            Loading observations…
          </p>
        )}
        {trendQuery.isError && (
          <p role="alert" className="rounded-xl bg-[#f8e4e4] p-3 text-sm text-[#963e42]">
            Unable to load comparisons. Check the date range and retry.
          </p>
        )}
        {!trendQuery.isLoading && !trendQuery.isError && !series.length && (
          <p className="muted rounded-xl border border-dashed border-[#ccd9d4] bg-[#fafbf9] p-6 text-center text-sm">
            No eligible observations match these filters.
          </p>
        )}
        {series.map((s) => (
          <div key={s.id} className="space-y-3">
            {mode === "chart" && <TrendChart series={s} />}
            <MeasurementTable series={s} />
          </div>
        ))}
        {trendQuery.data?.trend.excludedReports.map((d) => (
          <p key={d.id} className="text-xs text-[#859490]">
            Report excluded: {d.reason}.{" "}
            <Link
              href={`/reports/${d.id}`}
              className="font-bold text-[#176c5b] underline hover:text-[#0e4f43]"
            >
              Review source
            </Link>
          </p>
        ))}
      </section>
      {episode.summaryUnavailable && (
        <p role="status" className="rounded-xl bg-[#f4f7f5] p-3.5 text-xs text-[#53655f]">
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
