"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileX2,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  formatClinicalDate,
  documentResponseSchema,
  reportDetailResponseSchema,
  signedFileResponseSchema,
  verifyReportSchema,
  type ReportCategory,
  type ReportDetailDto,
  type VerifyReportInput,
} from "@medvault/shared";
import { apiRequest } from "@/lib/api";
import { signedFileRefreshInterval, validatedRequest } from "@/lib/phase2-api";
import { StatusBadge } from "./status-badge";
import { SummaryPanel } from "./summary-panel";

export function ReportReview({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const reportQuery = useQuery({
    queryKey: ["report", id],
    queryFn: () => validatedRequest(reportDetailResponseSchema, `/v1/reports/${id}`),
    refetchInterval: (q) =>
      q.state.data &&
      ["UPLOADED", "QUEUED", "PROCESSING"].includes(q.state.data.report.processingStatus)
        ? 4000
        : false,
  });
  const fileQuery = useQuery({
    queryKey: ["file", id],
    queryFn: () => validatedRequest(signedFileResponseSchema, `/v1/documents/${id}/file`),
    refetchInterval: (query) => signedFileRefreshInterval(query.state.data?.expiresInSeconds),
  });
  const replacementDocumentQuery = useQuery({
    queryKey: ["document", id, "report-replacement"],
    queryFn: () => validatedRequest(documentResponseSchema, `/v1/documents/${id}`),
    enabled: reportQuery.isError,
    retry: false,
  });
  const router = useRouter();
  const deleteMutation = useMutation({
    mutationFn: () => apiRequest(`/v1/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["episode"] });
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
      router.push("/documents");
    },
  });
  const [form, setForm] = useState<VerifyReportInput | null>(null);
  useEffect(() => {
    const r = reportQuery.data?.report;
    if (r && ["NEEDS_REVIEW", "VERIFIED"].includes(r.processingStatus) && !form) {
      setForm({
        testName: r.testName ?? "",
        reportDate: r.documentDate ?? "",
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
      validatedRequest(reportDetailResponseSchema, `/v1/reports/${id}/verify`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["report", id], data);
      void queryClient.invalidateQueries({ queryKey: ["report", id] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["episode"] });
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
      setForm(null);
    },
  });
  const retry = useMutation({
    mutationFn: () => apiRequest(`/v1/reports/${id}/retry`, { method: "POST" }),
    onSuccess: () => void reportQuery.refetch(),
  });
  const cancel = useMutation({
    mutationFn: () => apiRequest(`/v1/reports/${id}/cancel`, { method: "POST" }),
    onSuccess: () => void reportQuery.refetch(),
  });
  if (reportQuery.isLoading)
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <LoaderCircle className="animate-spin text-[#176c5b]" />
      </div>
    );
  if (reportQuery.isError) {
    if (replacementDocumentQuery.isLoading) {
      return (
        <div className="grid min-h-[60vh] place-items-center">
          <LoaderCircle className="animate-spin text-[#176c5b]" />
        </div>
      );
    }
    if (replacementDocumentQuery.data?.document.documentType === "PRESCRIPTION") {
      return <PrescriptionStoredMessage documentId={id} />;
    }
    return (
      <Message
        title="Report unavailable"
        text="This report may not exist or you may not have access."
      />
    );
  }
  if (!reportQuery.data)
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
        className="muted inline-flex items-center gap-2 text-sm font-semibold transition hover:text-[#176c5b]"
      >
        <ArrowLeft size={16} className="shrink-0" />
        Back to reports
      </Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Medical report</p>
          <h1 className="page-title mt-2">{report.testName || report.originalFilename}</h1>
          <p className="muted mt-2">
            {report.documentDate
              ? formatClinicalDate(report.documentDate)
              : "Report date not extracted"}
            {report.hospitalName ? ` · ${report.hospitalName}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={report.processingStatus} />
          <button
            onClick={() => {
              if (confirm("Are you sure you want to delete this report?")) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
            className="button-secondary inline-flex items-center justify-center p-2.5 text-[#a63d40] transition hover:bg-red-50 hover:border-red-200"
            title="Delete report"
          >
            {deleteMutation.isPending ? (
              <LoaderCircle className="shrink-0 animate-spin" size={16} />
            ) : (
              <Trash2 size={16} className="shrink-0" />
            )}
          </button>
        </div>
      </div>
      {["UPLOADED", "QUEUED", "PROCESSING"].includes(report.processingStatus) && (
        <ProcessingCard
          status={report.processingStatus as ProcessingStatus}
          uploadedAt={report.uploadedAt}
          onStop={() => cancel.mutate()}
          stopping={cancel.isPending}
          onRequeue={() => retry.mutate()}
          requeueing={retry.isPending}
        />
      )}
      {report.processingStatus === "FAILED" && (
        <FailureMessage
          failureCode={report.failureCode}
          onRetry={() => retry.mutate()}
          retrying={retry.isPending}
        />
      )}

      {(report.processingStatus === "NEEDS_REVIEW" || report.processingStatus === "VERIFIED") && (
        <>
          <div
            className={`mt-7 flex items-start gap-3 rounded-2xl p-4 text-sm ${report.processingStatus === "VERIFIED" ? "bg-[#e4f2ec] text-[#176c5b]" : "bg-[#fff3dc] text-[#75501f]"}`}
          >
            {report.processingStatus === "VERIFIED" ? (
              <CheckCircle2 className="shrink-0 text-[#176c5b]" size={18} />
            ) : (
              <ShieldAlert className="shrink-0 text-[#aa6912]" size={18} />
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
                    className="group inline-flex items-center gap-1 text-sm font-bold text-[#176c5b] hover:text-[#0e4f43]"
                  >
                    <span>Open</span>
                    <ExternalLink
                      size={13}
                      className="shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    />
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
              {form ? (
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
          <SummaryPanel
            scope="REPORT"
            id={id}
            eligible={report.processingStatus === "VERIFIED"}
            sourceLinks={[{ id, label: "View source report" }]}
          />
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
            required
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
      {!form.reportDate && (
        <p className="mt-4 text-sm">
          Enter the report date from your document before verification.
        </p>
      )}
      <button
        onClick={save}
        disabled={saving || !verifyReportSchema.safeParse(form).success}
        className="button-primary mt-6 inline-flex w-full items-center justify-center gap-2"
      >
        {saving ? (
          <LoaderCircle className="shrink-0 animate-spin" size={17} />
        ) : (
          <CheckCircle2 size={17} className="shrink-0" />
        )}
        <span>Verify &amp; Save</span>
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
          value={report.documentDate ? formatClinicalDate(report.documentDate) : null}
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

type ProcessingStatus = "UPLOADED" | "QUEUED" | "PROCESSING";

const PROCESSING_STAGES: { status: ProcessingStatus[]; label: string; sub: string }[] = [
  { status: ["UPLOADED", "QUEUED"], label: "Queued", sub: "Waiting for an available worker…" },
  { status: ["PROCESSING"], label: "Preparing", sub: "Downloading your report securely…" },
  { status: ["PROCESSING"], label: "Extracting", sub: "AI is reading your medical data…" },
  { status: ["PROCESSING"], label: "Finalizing", sub: "Structuring results for review…" },
];

function ProcessingCard({
  status,
  uploadedAt,
  onStop,
  stopping,
  onRequeue,
  requeueing,
}: {
  status: ProcessingStatus;
  uploadedAt: string;
  onStop: () => void;
  stopping: boolean;
  onRequeue: () => void;
  requeueing: boolean;
}) {
  const [tick, setTick] = useState(0);
  const [elapsed, setElapsed] = useState(() => Date.now() - new Date(uploadedAt).getTime());
  useEffect(() => {
    if (status !== "PROCESSING") return;
    const id = setInterval(() => setTick((t) => (t + 1) % 3), 2200);
    return () => clearInterval(id);
  }, [status]);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - new Date(uploadedAt).getTime()), 5000);
    return () => clearInterval(id);
  }, [uploadedAt]);

  const looksStuck = elapsed > 90_000; // 90 seconds

  const activeStageIndex = status === "PROCESSING" ? 1 + tick : 0;
  const activeStage = PROCESSING_STAGES[activeStageIndex];
  const progressPct = status === "QUEUED" || status === "UPLOADED" ? 5 : 20 + tick * 28;

  return (
    <div className="surface mt-8 overflow-hidden rounded-2xl">
      {/* Indeterminate shimmer bar across the top */}
      <div className="relative h-1 w-full overflow-hidden bg-[#dde9e4]">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#176c5b] via-[#29a587] to-[#176c5b] transition-all duration-700 ease-in-out"
          style={{ width: `${progressPct}%` }}
        />
        {status === "PROCESSING" && (
          <div
            className="absolute inset-y-0 w-1/3 animate-[shimmer_1.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent"
            style={{ animationDelay: "0.4s" }}
          />
        )}
      </div>

      <div className="px-8 py-7">
        <div className="mb-5 flex items-center gap-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#e4f2ec]">
            <LoaderCircle className="animate-spin text-[#176c5b]" size={18} />
          </span>
          <div className="text-left">
            <p className="text-sm font-extrabold text-[#176c5b]">{activeStage?.label}</p>
            <p className="muted text-xs">{activeStage?.sub}</p>
          </div>
        </div>

        {/* Stage dots */}
        <div className="mb-5 flex items-center gap-2">
          {PROCESSING_STAGES.map((stage, i) => {
            const done = i < activeStageIndex;
            const active = i === activeStageIndex;
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={`h-1.5 w-full rounded-full transition-all duration-700 ${
                    done ? "bg-[#176c5b]" : active ? "bg-[#29a587]" : "bg-[#dde9e4]"
                  }`}
                />
                <p
                  className={`text-[10px] font-bold transition-colors duration-300 ${
                    done || active ? "text-[#176c5b]" : "text-[#b0bdb9]"
                  }`}
                >
                  {stage.label}
                </p>
              </div>
            );
          })}
        </div>

        {looksStuck && (
          <div className="mb-4 rounded-xl bg-[#fff8ec] p-3 text-center text-xs text-[#75501f]">
            This is taking longer than expected. The job may have been dropped — try re-queuing it.
          </div>
        )}

        <p className="muted text-center text-xs">
          You can safely leave this page — extraction continues in the background.
        </p>

        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {looksStuck && (
            <button className="button-primary" disabled={requeueing} onClick={onRequeue}>
              {requeueing ? (
                <>
                  <LoaderCircle size={15} className="animate-spin" /> Re-queuing…
                </>
              ) : (
                "Re-queue"
              )}
            </button>
          )}
          <button className="button-secondary" disabled={stopping} onClick={onStop}>
            {stopping ? (
              <>
                <LoaderCircle size={15} className="animate-spin" /> Stopping…
              </>
            ) : (
              "Stop extraction"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Message({
  title,
  text,
  loading,
  children,
}: {
  title: string;
  text: string;
  loading?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="surface mt-8 rounded-2xl p-8 text-center">
      {loading && <LoaderCircle className="mx-auto animate-spin text-[#176c5b]" />}
      <h2 className="mt-3 text-xl font-extrabold">{title}</h2>
      <p className="muted mx-auto mt-2 max-w-lg text-sm">{text}</p>
      {children}
    </div>
  );
}

export function PrescriptionStoredMessage({ documentId }: { documentId: string }) {
  return (
    <div className="mt-8 rounded-2xl bg-[#e4f2ec] p-7 text-center text-[#176c5b]">
      <h2 className="text-xl font-extrabold">Prescription saved</h2>
      <p className="mx-auto mt-2 max-w-md text-sm">
        This upload was identified as a prescription and stored privately. It was not sent through
        report extraction.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Link href={`/documents/${documentId}`} className="button-primary">
          View stored document
        </Link>
      </div>
    </div>
  );
}

function FailureMessage({
  failureCode,
  onRetry,
  retrying,
}: {
  failureCode: string | null;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (failureCode === "UNRELATED_IMAGE" || failureCode === "NOT_A_MEDICAL_DOCUMENT") {
    return (
      <div className="surface mt-8 rounded-2xl p-7 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#fdf0dc]">
          <FileX2 className="text-[#aa6912]" size={28} />
        </div>
        <h2 className="text-xl font-extrabold">Unrelated image</h2>
        <p className="muted mx-auto mt-2 max-w-md text-sm">
          We could not identify a medical test report or prescription in this upload. Analysis was
          not started. Please upload a clear photo or PDF of your medical document.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/documents/upload" className="button-primary">
            Upload another document
          </Link>
        </div>
      </div>
    );
  }

  if (failureCode === "UNREADABLE_DOCUMENT") {
    return (
      <div className="surface mt-8 rounded-2xl p-7 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#fdf0dc]">
          <FileX2 className="text-[#aa6912]" size={28} />
        </div>
        <h2 className="text-xl font-extrabold">Unreadable document</h2>
        <p className="muted mx-auto mt-2 max-w-md text-sm">
          We could not read this document clearly enough to process it. Please upload a sharper,
          complete image with all text visible.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/documents/upload" className="button-primary">
            Upload another document
          </Link>
        </div>
      </div>
    );
  }

  if (failureCode === "UNSUPPORTED_MEDICAL") {
    return (
      <div className="surface mt-8 rounded-2xl p-7 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#fdf0dc]">
          <FileX2 className="text-[#aa6912]" size={28} />
        </div>
        <h2 className="text-xl font-extrabold">Unsupported medical content</h2>
        <p className="muted mx-auto mt-2 max-w-md text-sm">
          This appears to be a medical document, but this type is not supported for analysis yet.
          Please upload a supported test report.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/documents/upload" className="button-primary">
            Upload another document
          </Link>
        </div>
      </div>
    );
  }

  if (failureCode === "PRESCRIPTION_STORED") {
    return (
      <div className="mt-8 rounded-2xl bg-[#e4f2ec] p-7 text-center text-[#176c5b]">
        <h2 className="text-xl font-extrabold">Prescription Saved</h2>
        <p className="mx-auto mt-2 max-w-md text-sm">
          Your prescription has been saved securely. AI report analysis is available for test
          reports only; prescriptions are not analyzed.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/reports" className="button-primary">
            Back to reports
          </Link>
        </div>
      </div>
    );
  }

  if (failureCode === "CATEGORY_MISMATCH") {
    return (
      <div className="surface mt-8 rounded-2xl p-7 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#fdf0dc]">
          <FileX2 className="text-[#aa6912]" size={28} />
        </div>
        <h2 className="text-xl font-extrabold">Category mismatch</h2>
        <p className="muted mx-auto mt-2 max-w-md text-sm">
          This appears to be a prescription, but you selected Test Report. Please correct the
          document type to continue.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/documents/upload" className="button-primary">
            Upload another document
          </Link>
        </div>
      </div>
    );
  }

  if (failureCode === "AI_UNAVAILABLE" || failureCode === "QUEUE_UNAVAILABLE") {
    return (
      <div className="surface mt-8 rounded-2xl p-7 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#fdf0dc]">
          <RefreshCw className="shrink-0 text-[#aa6912]" size={26} />
        </div>
        <h2 className="text-xl font-extrabold">Checker unavailable</h2>
        <p className="muted mx-auto mt-2 max-w-md text-sm">
          We could not check your document because the checking service is temporarily unavailable.
          Your file has not been rejected. Please try again later.
        </p>
        <button
          className="button-primary mt-5 inline-flex items-center gap-2"
          disabled={retrying}
          onClick={onRetry}
        >
          {retrying ? (
            <LoaderCircle size={16} className="shrink-0 animate-spin" />
          ) : (
            <RefreshCw size={15} className="shrink-0" />
          )}
          <span>Retry</span>
        </button>
      </div>
    );
  }

  return (
    <div className="surface mt-8 rounded-2xl p-7 text-center">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#fae8e8]">
        <RefreshCw className="shrink-0 text-[#a63d40]" size={26} />
      </div>
      <h2 className="text-xl font-extrabold">Analysis failure</h2>
      <p className="muted mx-auto mt-2 max-w-md text-sm">
        Your document passed the initial check, but analysis could not be completed. Please retry.
        Your uploaded file is still available.
      </p>
      <button
        className="button-primary mt-5 inline-flex items-center gap-2"
        disabled={retrying}
        onClick={onRetry}
      >
        {retrying ? (
          <LoaderCircle size={16} className="shrink-0 animate-spin" />
        ) : (
          <RefreshCw size={15} className="shrink-0" />
        )}
        <span>Retry processing</span>
      </button>
    </div>
  );
}
