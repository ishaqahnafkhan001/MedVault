"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileSearch, LoaderCircle, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  DocumentDto,
  DocumentType,
  PaginatedDto,
  ProcessingStatus,
  ReportCategory,
} from "@medvault/shared";
import { apiRequest } from "@/lib/api";
import { DocumentCard } from "./document-card";

export function HistoryView({ reportsOnly = false }: { reportsOnly?: boolean }) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<DocumentType | "">("");
  const [status, setStatus] = useState<ProcessingStatus | "">("");
  const [category, setCategory] = useState<ReportCategory | "">("");
  const [hospital, setHospital] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: "12", sort: "date_desc" });
    if (search) p.set("search", search);
    if (type && !reportsOnly) p.set("documentType", type);
    if (status) p.set("status", status);
    if (category) p.set("category", category);
    if (hospital) p.set("hospital", hospital);
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    return p.toString();
  }, [page, search, type, status, category, hospital, dateFrom, dateTo, reportsOnly]);
  const query = useQuery({
    queryKey: [reportsOnly ? "reports" : "documents", params],
    queryFn: () =>
      apiRequest<PaginatedDto<DocumentDto>>(
        `/v1/${reportsOnly ? "reports" : "documents"}?${params}`,
      ),
    refetchInterval: (q) =>
      q.state.data?.items.some((d) =>
        ["UPLOADED", "QUEUED", "PROCESSING"].includes(d.processingStatus),
      )
        ? 5000
        : false,
  });
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{reportsOnly ? "Verified and in review" : "Your private files"}</p>
          <h1 className="page-title mt-2">{reportsOnly ? "Report history" : "All documents"}</h1>
          <p className="muted mt-2">
            {reportsOnly
              ? "Report date—not upload date—determines the latest result."
              : "Medical reports and prescriptions in one secure place."}
          </p>
        </div>
        <Link href="/documents/upload" className="button-primary">
          <Plus size={18} />
          Upload
        </Link>
      </div>
      <section className="surface mt-7 rounded-2xl p-4" aria-label="History filters">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="relative xl:col-span-2">
            <span className="sr-only">Search</span>
            <Search
              className="pointer-events-none absolute left-3 top-3 text-[#77857f]"
              size={18}
            />
            <input
              className="field pl-10"
              placeholder="Search tests, hospitals, filenames"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          {!reportsOnly && (
            <select
              aria-label="Document type"
              className="field"
              value={type}
              onChange={(e) => {
                setType(e.target.value as DocumentType | "");
                setPage(1);
              }}
            >
              <option value="">All document types</option>
              <option value="REPORT">Reports</option>
              <option value="PRESCRIPTION">Prescriptions</option>
            </select>
          )}
          <select
            aria-label="Status"
            className="field"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ProcessingStatus | "");
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {["QUEUED", "PROCESSING", "NEEDS_REVIEW", "VERIFIED", "FAILED", "NOT_APPLICABLE"].map(
              (v) => (
                <option key={v} value={v}>
                  {title(v)}
                </option>
              ),
            )}
          </select>
          <input
            aria-label="Hospital filter"
            className="field"
            placeholder="Hospital or lab"
            value={hospital}
            onChange={(e) => {
              setHospital(e.target.value);
              setPage(1);
            }}
          />
          <select
            aria-label="Category"
            className="field"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as ReportCategory | "");
              setPage(1);
            }}
          >
            <option value="">All categories</option>
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
              <option key={v} value={v}>
                {title(v)}
              </option>
            ))}
          </select>
          <label>
            <span className="label">From report date</span>
            <input
              className="field"
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            <span className="label">To report date</span>
            <input
              className="field"
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
      </section>
      {query.isLoading ? (
        <div className="grid min-h-64 place-items-center">
          <LoaderCircle className="animate-spin text-[#176c5b]" />
        </div>
      ) : query.isError ? (
        <div className="mt-8 rounded-2xl bg-[#f8e4e4] p-6 text-center text-[#963e42]">
          We couldn’t load your history.{" "}
          <button className="font-bold underline" onClick={() => void query.refetch()}>
            Try again
          </button>
        </div>
      ) : query.data?.items.length ? (
        <>
          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            {query.data.items.map((d) => (
              <DocumentCard key={d.id} document={d} />
            ))}
          </div>
          <div className="mt-6 flex items-center justify-between">
            <p className="muted text-sm">
              Page {query.data.page} of {Math.max(query.data.totalPages, 1)} · {query.data.total}{" "}
              document{query.data.total === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              <button
                className="button-secondary p-2.5"
                aria-label="Previous page"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className="button-secondary p-2.5"
                aria-label="Next page"
                disabled={page >= query.data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-8 rounded-2xl border border-dashed border-[#cbd8d3] bg-white/60 p-10 text-center">
          <FileSearch className="mx-auto text-[#75a496]" />
          <h2 className="mt-3 font-extrabold">No documents found</h2>
          <p className="muted mt-1 text-sm">Try different filters or upload a document.</p>
        </div>
      )}
    </div>
  );
}
function title(v: string) {
  return v
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
}
