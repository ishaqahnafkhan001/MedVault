import Link from "next/link";
import { Building2, CalendarDays, ChevronRight, FileText, Pill } from "lucide-react";
import type { DocumentDto } from "@medvault/shared";
import { StatusBadge } from "./status-badge";

export function DocumentCard({ document }: { document: DocumentDto }) {
  const href =
    document.documentType === "REPORT" ? `/reports/${document.id}` : `/documents/${document.id}`;
  return (
    <Link
      href={href}
      className="group flex min-w-0 items-center gap-4 rounded-2xl border border-[#e0e8e4] bg-white p-4 transition hover:-translate-y-0.5 hover:border-[#a8c7bd] hover:shadow-md"
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${document.documentType === "REPORT" ? "bg-[#e5f2ed] text-[#176c5b]" : "bg-[#f5eadb] text-[#9b641e]"}`}
      >
        {document.documentType === "REPORT" ? (
          <FileText size={20} className="shrink-0" />
        ) : (
          <Pill size={20} className="shrink-0" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate font-bold text-[#162522] transition group-hover:text-[#176c5b]">
            {document.testName || document.originalFilename}
          </h3>
          <div className="flex shrink-0 items-center gap-2">
            <StatusBadge status={document.processingStatus} />
            <ChevronRight
              size={16}
              className="text-[#9bb0a8] transition-transform group-hover:translate-x-0.5 group-hover:text-[#176c5b]"
            />
          </div>
        </div>
        <div className="muted mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className="flex items-center gap-1.5">
            <CalendarDays size={13} className="shrink-0 text-[#7a8a85]" />
            <span>
              {document.documentDate ? formatDate(document.documentDate) : "Date not set"}
            </span>
          </span>
          {document.hospitalName && (
            <span className="flex min-w-0 items-center gap-1.5">
              <Building2 size={13} className="shrink-0 text-[#7a8a85]" />
              <span className="truncate">{document.hospitalName}</span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-BD", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
