"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileSearch, LoaderCircle, Plus, Search, X } from "lucide-react";
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
          <Plus size={16} className="shrink-0" />
          <span>Upload</span>
        </Link>
      </div>
      <section className="surface mt-7 rounded-2xl p-4" aria-label="History filters">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative xl:col-span-2">
            <span className="sr-only">Search</span>
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 shrink-0 text-[#77857f]"
              size={17}
            />
            <input
              type="text"
              className="field field-search !pl-10.5 pr-9"
              placeholder={
                reportsOnly
                  ? "Search reports by test name, hospital, or lab..."
                  : "Search documents by test, hospital, or filename..."
              }
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#77857f] transition hover:bg-[#eef3f0] hover:text-[#162522]"
                aria-label="Clear search"
                title="Clear search"
              >
                <X size={15} className="shrink-0" />
              </button>
            )}
          </div>
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
      {search && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#eef6f3] px-4 py-2.5 text-xs text-[#176c5b]">
          <span className="font-medium">
            Showing results for:{" "}
            <strong className="font-extrabold text-[#142621]">"{search}"</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setPage(1);
            }}
            className="inline-flex items-center gap-1 font-bold text-[#176c5b] hover:text-[#0e4f43]"
          >
            <X size={13} className="shrink-0" />
            <span>Clear search</span>
          </button>
        </div>
      )}
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
              {reportsOnly ? "report" : "document"}
              {query.data.total === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-2">
              <button
                className="button-secondary p-2.5"
                aria-label="Previous page"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={16} className="shrink-0" />
              </button>
              <button
                className="button-secondary p-2.5"
                aria-label="Next page"
                disabled={page >= query.data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={16} className="shrink-0" />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-8 rounded-2xl border border-dashed border-[#cbd8d3] bg-white/60 p-10 text-center">
          <FileSearch className="mx-auto shrink-0 text-[#75a496]" size={32} />
          <h2 className="mt-3 text-base font-extrabold text-[#162522]">
            {search
              ? `No ${reportsOnly ? "reports" : "documents"} matching "${search}"`
              : `No ${reportsOnly ? "reports" : "documents"} found`}
          </h2>
          <p className="muted mt-1 text-sm">
            {search
              ? "Check your spelling, try different keywords, or clear the search query."
              : `Try different filters or upload a ${reportsOnly ? "report" : "document"}.`}
          </p>
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setPage(1);
              }}
              className="button-secondary mt-5 inline-flex items-center gap-1.5 text-xs font-bold"
            >
              <X size={14} className="shrink-0" />
              <span>Clear search</span>
            </button>
          )}
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
