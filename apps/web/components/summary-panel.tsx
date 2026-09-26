"use client";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Clock, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { SUMMARY_GUIDANCE, type EpisodeAnalysisDto } from "@medvault/shared";
import { summaryPollInterval, summaryResponseSchema, validatedRequest } from "@/lib/phase2-api";
import { ApiClientError } from "@/lib/api";

export function SummaryContent({ analysis }: { analysis: EpisodeAnalysisDto | null }) {
  if (!analysis)
    return (
      <p className="muted text-sm">
        No summary requested. Generate one from patient-reviewed observations.
      </p>
    );
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="muted font-medium">Summary status:</span>
        <span className="rounded-full bg-[#eef3f0] px-2.5 py-0.5 text-xs font-extrabold text-[#176c5b]">
          {analysis.status}
        </span>
      </div>
      {analysis.status === "QUEUED" && (
        <div className="flex items-start gap-2.5 rounded-xl bg-[#e7f0f7] p-3.5 text-sm text-[#32627f]">
          <Clock size={17} className="mt-0.5 shrink-0" />
          <p>
            Waiting for the worker. Your report is stored; keep the local worker running. A long
            wait does not mean the report is invalid.
          </p>
        </div>
      )}
      {analysis.status === "PROCESSING" && (
        <div className="flex items-start gap-2.5 rounded-xl bg-[#e7f0f7] p-3.5 text-sm text-[#32627f]">
          <LoaderCircle size={17} className="mt-0.5 shrink-0 animate-spin" />
          <p>
            Processing reviewed observations. If this takes longer than two minutes, check the
            worker and use Check status.
          </p>
        </div>
      )}
      {analysis.status === "FAILED" && (
        <div
          className="flex items-start gap-2.5 rounded-xl bg-[#f8e4e4] p-3.5 text-sm text-[#963e42]"
          role="alert"
        >
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <p>
            Summary unavailable ({analysis.failureCode ?? "SUMMARY_FAILED"}). Original reports and
            charts are unchanged. Retry when the dependency is available.
          </p>
        </div>
      )}
      {analysis.status === "STALE" && (
        <div
          className="flex items-start gap-2.5 rounded-xl bg-[#fff0d9] p-3.5 text-sm text-[#8b5a17]"
          role="alert"
        >
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <p>
            This summary is out of date because its sources or analysis configuration changed.
            Regenerate before using it.
          </p>
        </div>
      )}
      {analysis.status === "COMPLETED" && analysis.result && (
        <>
          <ul className="space-y-3">
            {analysis.result.findings.map((f) => (
              <li
                key={f.id}
                className="rounded-xl border border-[#dce5e1] bg-[#fafbf9] p-4 text-sm"
              >
                <p className="font-semibold text-[#142621]">{f.text}</p>
                <p className="muted mt-1 text-xs">
                  {f.kind === "CHANGE" ? "Application-calculated comparison" : "Source observation"}
                </p>
                <p className="muted text-xs">
                  Measurement references: {f.measurementIds.join(", ")}
                </p>
              </li>
            ))}
          </ul>
          {analysis.result.explanations.length > 0 && (
            <section aria-label="Plain-English test explanations" className="mt-4">
              <h3 className="font-extrabold text-sm uppercase tracking-wide text-[#40514c]">
                About the tests mentioned
              </h3>
              <div className="mt-2.5 grid gap-3">
                {analysis.result.explanations.map((explanation) => (
                  <div
                    className="rounded-xl border border-[#dce5e1] bg-[#fafbf9] p-4"
                    key={explanation.normalizedTestName}
                  >
                    <p className="font-bold text-[#142621]">{explanation.displayName}</p>
                    <p className="mt-1 text-sm text-[#40514c]">{explanation.explanation}</p>
                    <p className="muted mt-1 text-xs">{explanation.uncertainty}</p>
                    {explanation.source && (
                      <a
                        className="group mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#176c5b] hover:underline"
                        href={explanation.source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span>
                          Source: {explanation.source.publisher}, {explanation.source.title}
                        </span>
                        <ArrowRight
                          size={11}
                          className="shrink-0 transition-transform group-hover:translate-x-0.5"
                        />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
          <ul className="list-disc space-y-1 pl-5 text-xs text-[#64736f]">
            {analysis.result.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p className="text-xs text-[#859490]">
            Provider: {analysis.provider} · Model: {analysis.model} · Prompt:{" "}
            {analysis.promptVersion} · Generated: {analysis.analyzedAt}
          </p>
        </>
      )}
    </div>
  );
}

export function SummaryPanel({
  scope,
  id,
  eligible,
  analysisId,
  sourceLinks = [],
}: {
  scope: "REPORT" | "EPISODE";
  id: string;
  eligible: boolean;
  analysisId?: string;
  sourceLinks?: Array<{ id: string; label: string }>;
}) {
  const client = useQueryClient();
  const path =
    scope === "REPORT" ? `/v1/reports/${id}/summary` : `/v1/episodes/${id}/analyses/${analysisId}`;
  const key = ["summary", scope, id, analysisId];
  const query = useQuery({
    queryKey: key,
    enabled: scope === "REPORT" ? eligible : Boolean(analysisId),
    queryFn: () => validatedRequest(summaryResponseSchema, path),
    refetchInterval: (q) =>
      q.state.error
        ? false
        : summaryPollInterval(q.state.data?.analysis?.status, q.state.data?.analysis?.updatedAt),
  });
  const generate = useMutation({
    mutationFn: () =>
      validatedRequest(
        summaryResponseSchema,
        scope === "REPORT" ? `/v1/reports/${id}/summary` : `/v1/episodes/${id}/summary`,
        { method: "POST", body: JSON.stringify({ forceRegenerate: true }) },
      ),
    onSuccess: (result) => {
      client.setQueryData(key, result);
      void client.invalidateQueries({ queryKey: ["episode", id] });
      void client.invalidateQueries({ queryKey: ["summary", scope, id] });
    },
  });
  const analysis = query.data?.analysis ?? null;
  const pending = analysis && ["QUEUED", "PROCESSING"].includes(analysis.status);
  const delayed = pending && summaryPollInterval(analysis.status, analysis.updatedAt) === false;

  const isSchemaPending =
    (query.error instanceof ApiClientError && query.error.code === "SUMMARY_SCHEMA_PENDING") ||
    (generate.error instanceof ApiClientError && generate.error.code === "SUMMARY_SCHEMA_PENDING") ||
    (query.error instanceof ApiClientError &&
      query.error.status === 503 &&
      query.error.message.includes("migration")) ||
    (generate.error instanceof ApiClientError &&
      generate.error.status === 503 &&
      generate.error.message.includes("migration"));

  return (
    <section
      className="surface space-y-5 rounded-2xl p-6 sm:p-7 shadow-sm"
      aria-label={`${scope === "REPORT" ? "Report" : "Episode"} summary`}
    >
      <div>
        <p className="eyebrow">{scope === "REPORT" ? "AI Extraction" : "Clinical synthesis"}</p>
        <h2 className="mt-1 text-xl font-extrabold text-[#142621]">
          {scope === "REPORT" ? "Individual report summary" : "Episode summary"}
        </h2>
      </div>
      {query.isLoading && (
        <p role="status" className="muted text-sm">
          Loading saved summary…
        </p>
      )}
      {isSchemaPending ? (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-xl bg-[#fff0d9] p-3.5 text-sm text-[#8b5a17]"
        >
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <p>
            Summary storage is awaiting the approved database migration. Reports and verified
            measurements remain fully available.
          </p>
        </div>
      ) : query.isError ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl bg-[#f8e4e4] p-3.5 text-sm text-[#963e42]"
        >
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <p>
            {query.error instanceof Error
              ? query.error.message
              : "Unable to load the summary. Check the API and try again."}
          </p>
        </div>
      ) : (
        <SummaryContent analysis={analysis} />
      )}
      {delayed && (
        <p role="status" className="rounded-xl bg-[#fff0d9] p-3 text-sm text-[#8b5a17]">
          Still waiting. Automatic polling has paused. Check status or retry queueing after starting
          the worker.
        </p>
      )}
      <div className="flex flex-wrap gap-3 pt-1">
        <button
          className="button-primary inline-flex items-center gap-2 text-sm"
          disabled={
            !eligible ||
            isSchemaPending ||
            generate.isPending ||
            Boolean(pending && !delayed) ||
            analysis?.status === "COMPLETED"
          }
          onClick={() => generate.mutate()}
        >
          {generate.isPending ? (
            <LoaderCircle size={15} className="shrink-0 animate-spin" />
          ) : (
            <Sparkles size={15} className="shrink-0" />
          )}
          {generate.isPending
            ? "Requesting…"
            : analysis
              ? "Retry / regenerate summary"
              : "Generate summary"}
        </button>
        <button
          className="button-secondary inline-flex items-center gap-2 text-sm"
          onClick={() => void query.refetch()}
          disabled={(scope === "EPISODE" && !analysisId) || (scope === "REPORT" && !eligible)}
        >
          <RefreshCw size={14} className={`shrink-0 ${query.isFetching ? "animate-spin" : ""}`} />
          Check status
        </button>
      </div>
      {!eligible && (
        <p className="text-xs text-[#64736f]">
          Patient-reviewed eligible reports are required. Complete review before requesting a
          summary.
        </p>
      )}
      {generate.isError && !isSchemaPending && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl bg-[#f8e4e4] p-3.5 text-sm text-[#963e42]"
        >
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <p>
            {generate.error instanceof Error
              ? generate.error.message
              : "Summary request failed. Check report eligibility and service availability; wait at least 30 seconds before retrying."}
          </p>
        </div>
      )}
      <div className="rounded-xl bg-[#f4f7f5] p-3.5 text-xs text-[#53655f]">
        <strong className="text-[#142621]">Medical-attention guidance: cannot assess.</strong>{" "}
        {SUMMARY_GUIDANCE.message}
      </div>
      {sourceLinks.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 pt-1">
          {sourceLinks.map((link) => (
            <Link
              className="group inline-flex items-center gap-1 text-sm font-bold text-[#176c5b] hover:text-[#0e4f43]"
              key={link.id}
              href={`/reports/${link.id}`}
            >
              <span>{link.label}</span>
              <ArrowRight
                size={13}
                className="shrink-0 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
