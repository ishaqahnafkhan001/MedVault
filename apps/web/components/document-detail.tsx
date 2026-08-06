"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Download, FileText, LoaderCircle, LockKeyhole, Pill } from "lucide-react";
import type { DocumentDto } from "@medvault/shared";
import { apiRequest } from "@/lib/api";
import { formatDate } from "./document-card";
import { StatusBadge } from "./status-badge";

export function DocumentDetail({ id }: { id: string }) {
  const documentQuery = useQuery({
    queryKey: ["document", id],
    queryFn: () => apiRequest<{ document: DocumentDto }>(`/v1/documents/${id}`),
  });
  const fileQuery = useQuery({
    queryKey: ["file", id],
    queryFn: () => apiRequest<{ url: string }>(`/v1/documents/${id}/file`),
    refetchOnWindowFocus: false,
  });

  if (documentQuery.isLoading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <LoaderCircle className="animate-spin text-[#176c5b]" />
      </div>
    );
  }
  if (documentQuery.isError || !documentQuery.data) {
    return (
      <div className="surface mx-auto mt-16 max-w-lg rounded-2xl p-8 text-center">
        <h1 className="text-xl font-extrabold">Document unavailable</h1>
        <p className="muted mt-2 text-sm">
          This document may not exist or you may not have access.
        </p>
      </div>
    );
  }

  const document = documentQuery.data.document;
  const Icon = document.documentType === "PRESCRIPTION" ? Pill : FileText;
  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/documents"
        className="muted inline-flex items-center gap-2 text-sm font-bold hover:text-[#176c5b]"
      >
        <ArrowLeft size={16} /> Back to documents
      </Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-[#f3eadc] p-3 text-[#95621f]">
            <Icon />
          </div>
          <div>
            <p className="eyebrow">{document.documentType.toLowerCase()}</p>
            <h1 className="page-title mt-2">{document.testName || document.originalFilename}</h1>
            <p className="muted mt-2">
              {document.documentDate ? formatDate(document.documentDate) : "Date not set"}
              {document.hospitalName ? ` · ${document.hospitalName}` : ""}
            </p>
          </div>
        </div>
        <StatusBadge status={document.processingStatus} />
      </div>
      {document.documentType === "PRESCRIPTION" && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl bg-[#edf4f1] p-4 text-sm text-[#36564e]">
          <LockKeyhole className="mt-0.5 shrink-0" size={17} />
          <p>This prescription is stored privately and has not been sent to AI.</p>
        </div>
      )}
      <section className="surface mt-6 overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-[#e0e8e4] px-5 py-4">
          <div>
            <h2 className="font-extrabold">Original document</h2>
            <p className="muted mt-1 text-xs">
              {document.originalFilename} · {(document.fileSize / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
          {fileQuery.data && (
            <a
              href={fileQuery.data.url}
              target="_blank"
              rel="noreferrer"
              className="button-secondary"
            >
              <Download size={15} /> Open file
            </a>
          )}
        </div>
        {fileQuery.isLoading ? (
          <div className="grid min-h-[620px] place-items-center">
            <LoaderCircle className="animate-spin text-[#176c5b]" />
          </div>
        ) : fileQuery.data ? (
          <iframe
            title="Original medical document"
            src={fileQuery.data.url}
            className="h-[720px] w-full border-0"
          />
        ) : (
          <div className="muted grid min-h-[620px] place-items-center p-8 text-center">
            The private file preview is temporarily unavailable.
          </div>
        )}
      </section>
    </div>
  );
}
