"use client";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SUMMARY_GUIDANCE, type EpisodeAnalysisDto } from "@medvault/shared";
import { summaryPollInterval, summaryResponseSchema, validatedRequest } from "@/lib/phase2-api";

export function SummaryContent({ analysis }: { analysis: EpisodeAnalysisDto | null }) {
  if (!analysis)
    return <p>No summary requested. Generate one from patient-reviewed observations.</p>;
  return (
    <div className="space-y-3">
      <p role="status">
        Summary status: <strong>{analysis.status}</strong>
      </p>
      {analysis.status === "QUEUED" && (
        <p>
          Waiting for the worker. Your report is stored; keep the local worker running. A long wait
          does not mean the report is invalid.
        </p>
      )}
      {analysis.status === "PROCESSING" && (
        <p>
          Processing reviewed observations. If this takes longer than two minutes, check the worker
          and use Check status.
        </p>
      )}
      {analysis.status === "FAILED" && (
        <p role="alert">
          Summary unavailable ({analysis.failureCode ?? "SUMMARY_FAILED"}). Original reports and
          charts are unchanged. Retry when the dependency is available.
        </p>
      )}
      {analysis.status === "STALE" && (
        <p role="alert">
          This summary is out of date because its sources or analysis configuration changed.
          Regenerate before using it.
        </p>
      )}
      {analysis.status === "COMPLETED" && analysis.result && (
        <>
          <ul className="space-y-3">
            {analysis.result.findings.map((f) => (
              <li key={f.id}>
                <p>{f.text}</p>
                <p className="text-xs text-gray-500">
                  {f.kind === "CHANGE" ? "Application-calculated comparison" : "Source observation"}
                </p>
                <p className="text-xs">Measurement references: {f.measurementIds.join(", ")}</p>
              </li>
            ))}
          </ul>
          {analysis.result.explanations.length > 0 && (
            <section aria-label="Plain-English test explanations">
              <h3 className="font-semibold">About the tests mentioned</h3>
              <div className="mt-2 grid gap-3">
                {analysis.result.explanations.map((explanation) => (
                  <div className="rounded-xl bg-[#f4f7f5] p-3" key={explanation.normalizedTestName}>
                    <p className="font-semibold">{explanation.displayName}</p>
                    <p className="mt-1 text-sm">{explanation.explanation}</p>
                    <p className="mt-1 text-xs text-gray-600">{explanation.uncertainty}</p>
                    {explanation.source && (
                      <a
                        className="mt-1 inline-block text-xs font-semibold text-emerald-700 underline"
                        href={explanation.source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Source: {explanation.source.publisher}, {explanation.source.title}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
            {analysis.result.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p className="text-xs text-gray-500">
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
    enabled: scope === "REPORT" || Boolean(analysisId),
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
  return (
    <section
      className="space-y-4 rounded-2xl border border-purple-100 bg-white p-6 shadow-sm"
      aria-label={`${scope === "REPORT" ? "Report" : "Episode"} summary`}
    >
      <h2 className="text-xl font-semibold">
        {scope === "REPORT" ? "Individual report summary" : "Episode summary"}
      </h2>
      {query.isLoading && <p role="status">Loading saved summary…</p>}
      {query.isError ? (
        <p role="alert">Unable to load the summary. Check the API and try again.</p>
      ) : (
        <SummaryContent analysis={analysis} />
      )}
      {delayed && (
        <p role="status">
          Still waiting. Automatic polling has paused. Check status or retry queueing after starting
          the worker.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-lg bg-purple-700 px-4 py-2 text-white disabled:opacity-50"
          disabled={
            !eligible ||
            generate.isPending ||
            Boolean(pending && !delayed) ||
            analysis?.status === "COMPLETED"
          }
          onClick={() => generate.mutate()}
        >
          {generate.isPending
            ? "Requesting…"
            : analysis
              ? "Retry / regenerate summary"
              : "Generate summary"}
        </button>
        <button
          className="rounded-lg border px-4 py-2"
          onClick={() => void query.refetch()}
          disabled={scope === "EPISODE" && !analysisId}
        >
          Check status
        </button>
      </div>
      {!eligible && (
        <p>
          Patient-reviewed eligible reports are required. Complete review before requesting a
          summary.
        </p>
      )}
      {generate.isError && (
        <p role="alert">
          Summary request failed. Check report eligibility and service availability; wait at least
          30 seconds before retrying.
        </p>
      )}
      <p className="text-sm text-gray-600">
        <strong>Medical-attention guidance: cannot assess.</strong> {SUMMARY_GUIDANCE.message}
      </p>
      <div className="flex flex-wrap gap-3">
        {sourceLinks.map((link) => (
          <Link className="text-emerald-700 underline" key={link.id} href={`/reports/${link.id}`}>
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
