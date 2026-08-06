"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import type { ReportCategory, ReportDetailDto, VerifyReportInput } from "@medvault/shared";
import { apiRequest } from "@/lib/api";
import { formatDate } from "./document-card";
import { StatusBadge } from "./status-badge";

export function ReportReview({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const reportQuery = useQuery({
    queryKey: ["report", id],
    queryFn: () => apiRequest<{ report: ReportDetailDto }>(`/v1/reports/${id}`),
    refetchInterval: (q) =>
      q.state.data &&
      ["UPLOADED", "QUEUED", "PROCESSING"].includes(q.state.data.report.processingStatus)
        ? 4000
        : false,
  });
  const fileQuery = useQuery({
    queryKey: ["file", id],
    queryFn: () => apiRequest<{ url: string }>(`/v1/documents/${id}/file`),
    refetchOnWindowFocus: false,
  });
  const [form, setForm] = useState<VerifyReportInput | null>(null);
  useEffect(() => {
    const r = reportQuery.data?.report;
    if (r && r.processingStatus === "NEEDS_REVIEW" && !form && r.documentDate) {
      setForm({
        testName: r.testName ?? "",
        reportDate: r.documentDate,
        hospitalName: r.hospitalName,
        category: r.category ?? "OTHER",
        measurements: r.measurements.map((m) => ({
          id: m.id,
          name: m.name,
          normalizedName: m.normalizedName,
          textValue: m.textValue,
          numericValue: m.numericValue,
          unit: m.unit,
          referenceRange: m.referenceRange,
          sourceFlag: m.sourceFlag,
        })),
      });
    }
  }, [reportQuery.data, form]);
  const verify = useMutation({
    mutationFn: (body: VerifyReportInput) =>
      apiRequest<{ report: ReportDetailDto }>(`/v1/reports/${id}/verify`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["report", id] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const retry = useMutation({
    mutationFn: () => apiRequest(`/v1/reports/${id}/retry`, { method: "POST" }),
    onSuccess: () => void reportQuery.refetch(),
  });
  if (reportQuery.isLoading)
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <LoaderCircle className="animate-spin text-[#176c5b]" />
      </div>
    );
  if (reportQuery.isError || !reportQuery.data)
    return (
      <Message
        title="Report unavailable"
        text="This report may not exist or you may not have access."
      />
    );
  const report = reportQuery.data.report;
  return (
    <div className="mx-auto max-w-[1500px]">
      <Link
        href="/reports"
        className="muted inline-flex items-center gap-2 text-sm font-bold hover:text-[#176c5b]"
      >
        <ArrowLeft size={16} />
        Back to reports
      </Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Medical report</p>
          <h1 className="page-title mt-2">{report.testName || report.originalFilename}</h1>
          <p className="muted mt-2">
            {report.documentDate ? formatDate(report.documentDate) : "Report date not extracted"}
            {report.hospitalName ? ` · ${report.hospitalName}` : ""}
          </p>
        </div>
        <StatusBadge status={report.processingStatus} />
      </div>
      {["UPLOADED", "QUEUED", "PROCESSING"].includes(report.processingStatus) && (
        <Message
          title="Processing with AI…"
          text="Your report is stored safely. You can leave this page; extraction continues in the background."
          loading
        />
      )}
      {report.processingStatus === "FAILED" && (
        <div className="surface mt-8 rounded-2xl p-7 text-center">
          <RefreshCw className="mx-auto text-[#a63d40]" />
          <h2 className="mt-3 text-xl font-extrabold">We couldn’t process this report</h2>
          <p className="muted mt-2 text-sm">The original file is safe. Try the extraction again.</p>
          <button
            className="button-primary mt-5"
            disabled={retry.isPending}
            onClick={() => retry.mutate()}
          >
            {retry.isPending && <LoaderCircle size={16} className="animate-spin" />}Retry processing
          </button>
        </div>
      )}
      {(report.processingStatus === "NEEDS_REVIEW" || report.processingStatus === "VERIFIED") && (
        <>
          <div
            className={`mt-7 flex items-start gap-3 rounded-2xl p-4 text-sm ${report.processingStatus === "VERIFIED" ? "bg-[#e4f2ec] text-[#176c5b]" : "bg-[#fff3dc] text-[#75501f]"}`}
          >
            {report.processingStatus === "VERIFIED" ? (
              <CheckCircle2 className="shrink-0" />
            ) : (
              <ShieldAlert className="shrink-0" />
            )}
            <p className="font-semibold">
              {report.processingStatus === "VERIFIED"
                ? "You verified this structured report."
                : "AI-extracted information may contain errors. Verify it against the original medical report."}
            </p>
          </div>
          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(460px,.9fr)]">
            <section className="surface min-h-[620px] overflow-hidden rounded-2xl">
              <div className="flex items-center justify-between border-b border-[#e0e8e4] px-5 py-4">
                <h2 className="font-extrabold">Original document</h2>
                {fileQuery.data && (
                  <a
                    href={fileQuery.data.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-sm font-bold text-[#176c5b]"
                  >
                    Open <ExternalLink size={14} />
                  </a>
                )}
              </div>
              {fileQuery.isLoading ? (
                <div className="grid min-h-[550px] place-items-center">
                  <LoaderCircle className="animate-spin text-[#176c5b]" />
                </div>
              ) : fileQuery.data ? (
                <iframe
                  title="Original medical report"
                  src={fileQuery.data.url}
                  className="h-[650px] w-full border-0"
                />
              ) : (
                <div className="grid min-h-[550px] place-items-center p-8 text-center muted">
                  The file preview is temporarily unavailable.
                </div>
              )}
            </section>
            <section className="surface rounded-2xl p-5 sm:p-6">
              <h2 className="text-xl font-extrabold">
                {report.processingStatus === "VERIFIED"
                  ? "Verified information"
                  : "Review extracted information"}
              </h2>
              {report.processingStatus === "NEEDS_REVIEW" && form ? (
                <ReviewForm
                  form={form}
                  setForm={setForm}
                  save={() => verify.mutate(form)}
                  saving={verify.isPending}
                  error={verify.error?.message}
                />
              ) : (
                <VerifiedData report={report} />
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function ReviewForm({
  form,
  setForm,
  save,
  saving,
  error,
}: {
  form: VerifyReportInput;
  setForm: (v: VerifyReportInput) => void;
  save: () => void;
  saving: boolean;
  error?: string | undefined;
}) {
  return (
    <div className="mt-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Test name">
          <input
            className="field"
            value={form.testName}
            onChange={(e) => setForm({ ...form, testName: e.target.value })}
          />
        </Field>
        <Field label="Report date">
          <input
            className="field"
            type="date"
            value={form.reportDate}
            onChange={(e) => setForm({ ...form, reportDate: e.target.value })}
          />
        </Field>
        <Field label="Hospital or lab">
          <input
            className="field"
            value={form.hospitalName ?? ""}
            onChange={(e) => setForm({ ...form, hospitalName: e.target.value || null })}
          />
        </Field>
        <Field label="Category">
          <select
            className="field"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as ReportCategory })}
          >
            {[
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
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
      </div>
      <h3 className="mt-7 font-extrabold">Measurements</h3>
      <div className="mt-3 space-y-4">
        {form.measurements.map((m, i) => (
          <div key={m.id} className="rounded-xl border border-[#dde6e2] bg-[#fafbf9] p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Measurement">
                <input
                  className="field"
                  value={m.name}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      measurements: form.measurements.map((x, j) =>
                        j === i ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
              </Field>
              <Field label="Value">
                <input
                  className="field"
                  value={m.numericValue ?? m.textValue ?? ""}
                  onChange={(e) => {
                    const numeric =
                      e.target.value !== "" && Number.isFinite(Number(e.target.value))
                        ? Number(e.target.value)
                        : null;
                    setForm({
                      ...form,
                      measurements: form.measurements.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              numericValue: numeric,
                              textValue: numeric === null ? e.target.value || null : null,
                            }
                          : x,
                      ),
                    });
                  }}
                />
              </Field>
              <Field label="Unit">
                <input
                  className="field"
                  value={m.unit ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      measurements: form.measurements.map((x, j) =>
                        j === i ? { ...x, unit: e.target.value || null } : x,
                      ),
                    })
                  }
                />
              </Field>
              <Field label="Reference range">
                <input
                  className="field"
                  value={m.referenceRange ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      measurements: form.measurements.map((x, j) =>
                        j === i ? { ...x, referenceRange: e.target.value || null } : x,
                      ),
                    })
                  }
                />
              </Field>
            </div>
          </div>
        ))}
      </div>
      {error && <p className="mt-4 rounded-xl bg-[#f8e4e4] p-3 text-sm text-[#963e42]">{error}</p>}
      <button onClick={save} disabled={saving} className="button-primary mt-6 w-full">
        {saving && <LoaderCircle className="animate-spin" size={17} />}Verify &amp; Save
      </button>
    </div>
  );
}
function VerifiedData({ report }: { report: ReportDetailDto }) {
  return (
    <div className="mt-5">
      <dl className="grid gap-4 sm:grid-cols-2">
        <Info label="Test" value={report.testName} />
        <Info
          label="Report date"
          value={report.documentDate ? formatDate(report.documentDate) : null}
        />
        <Info label="Hospital" value={report.hospitalName} />
        <Info label="Category" value={report.category?.replaceAll("_", " ")} />
      </dl>
      <h3 className="mt-7 font-extrabold">Measurements</h3>
      <div className="mt-3 divide-y divide-[#e2e9e6] rounded-xl border border-[#e2e9e6]">
        {report.measurements.map((m) => (
          <div key={m.id} className="grid grid-cols-[1fr_auto] gap-4 p-4">
            <div>
              <p className="font-bold">{m.name}</p>
              <p className="muted mt-1 text-xs">Reference: {m.referenceRange || "Not listed"}</p>
            </div>
            <div className="text-right">
              <p className="font-extrabold">
                {m.numericValue ?? m.textValue ?? "—"} {m.unit}
              </p>
              {m.sourceFlag && (
                <p className="mt-1 text-xs font-bold text-[#a06313]">Source flag: {m.sourceFlag}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="muted text-xs font-bold uppercase tracking-wide">{label}</dt>
      <dd className="mt-1 font-bold">{value || "Not listed"}</dd>
    </div>
  );
}
function Message({ title, text, loading }: { title: string; text: string; loading?: boolean }) {
  return (
    <div className="surface mt-8 rounded-2xl p-8 text-center">
      {loading && <LoaderCircle className="mx-auto animate-spin text-[#176c5b]" />}
      <h2 className="mt-3 text-xl font-extrabold">{title}</h2>
      <p className="muted mx-auto mt-2 max-w-lg text-sm">{text}</p>
    </div>
  );
}
