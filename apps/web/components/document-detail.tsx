"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Download,
  FileText,
  LoaderCircle,
  LockKeyhole,
  Pencil,
  Pill,
  Trash2,
  X,
} from "lucide-react";
import {
  documentResponseSchema,
  signedFileResponseSchema,
  type UpdateDocumentInput,
} from "@medvault/shared";
import { apiRequest } from "@/lib/api";
import { signedFileRefreshInterval, validatedRequest } from "@/lib/phase2-api";
import { formatDate } from "./document-card";
import { StatusBadge } from "./status-badge";

export function DocumentDetail({ id }: { id: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editHospital, setEditHospital] = useState("");
  const [editDate, setEditDate] = useState("");

  const documentQuery = useQuery({
    queryKey: ["document", id],
    queryFn: () => validatedRequest(documentResponseSchema, `/v1/documents/${id}`),
  });
  const fileQuery = useQuery({
    queryKey: ["file", id],
    queryFn: () => validatedRequest(signedFileResponseSchema, `/v1/documents/${id}/file`),
    refetchInterval: (query) => signedFileRefreshInterval(query.state.data?.expiresInSeconds),
  });
  const queryClient = useQueryClient();
  const router = useRouter();
  const deleteMutation = useMutation({
    mutationFn: () => apiRequest(`/v1/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      router.push("/documents");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: UpdateDocumentInput) =>
      validatedRequest(documentResponseSchema, `/v1/documents/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(["document", id], result);
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setIsEditing(false);
    },
  });

  const startEditing = () => {
    if (!documentQuery.data) return;
    const doc = documentQuery.data.document;
    setEditTitle(doc.testName || "");
    setEditHospital(doc.hospitalName || "");
    setEditDate(doc.documentDate ? doc.documentDate.slice(0, 10) : "");
    setIsEditing(true);
  };

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
        className="muted inline-flex items-center gap-2 text-sm font-semibold transition hover:text-[#176c5b]"
      >
        <ArrowLeft size={16} className="shrink-0" /> Back to documents
      </Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-[#f3eadc] p-3 text-[#95621f] shrink-0">
            <Icon size={24} className="shrink-0" />
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
        <div className="flex items-center gap-2">
          <StatusBadge status={document.processingStatus} />
          <button
            onClick={startEditing}
            className="button-secondary inline-flex items-center gap-1.5 px-3 py-2 text-sm"
            title={`Edit ${document.documentType === "PRESCRIPTION" ? "prescription" : "document"} details`}
          >
            <Pencil size={14} className="shrink-0 text-[#176c5b]" />
            <span>Edit details</span>
          </button>
          <button
            onClick={() => {
              if (confirm("Are you sure you want to delete this document?")) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
            className="button-secondary inline-flex items-center justify-center p-2.5 text-[#a63d40] transition hover:bg-red-50 hover:border-red-200"
            title="Delete document"
          >
            {deleteMutation.isPending ? (
              <LoaderCircle className="shrink-0 animate-spin" size={16} />
            ) : (
              <Trash2 size={16} className="shrink-0" />
            )}
          </button>
        </div>
      </div>

      {isEditing && (
        <section
          aria-label="Edit document details"
          className="surface mt-5 rounded-2xl border border-[#b9cbc5] p-5 sm:p-6 shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-[#e0e8e4] pb-3 mb-4">
            <div className="flex items-center gap-2 font-bold text-[#142621]">
              <Pencil size={17} className="text-[#176c5b]" />
              <span>
                Edit {document.documentType === "PRESCRIPTION" ? "Prescription" : "Document"} Details
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="text-[#64736f] hover:text-[#142621] transition"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateMutation.mutate({
                testName: editTitle || null,
                hospitalName: editHospital || null,
                documentDate: editDate || null,
              });
            }}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label">
                  {document.documentType === "PRESCRIPTION"
                    ? "Prescription Name / Title"
                    : "Document Name"}
                </label>
                <input
                  className="field mt-1.5"
                  maxLength={180}
                  placeholder={
                    document.documentType === "PRESCRIPTION"
                      ? "e.g. Dr. Rahman - Cardiology"
                      : "e.g. CBC Blood Test"
                  }
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Doctor / Hospital / Clinic</label>
                <input
                  className="field mt-1.5"
                  maxLength={180}
                  placeholder="e.g. Apollo Hospital"
                  value={editHospital}
                  onChange={(e) => setEditHospital(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Date</label>
                <input
                  type="date"
                  className="field mt-1.5"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>
            </div>
            {updateMutation.isError && (
              <p role="alert" className="rounded-xl bg-[#f8e4e4] p-3 text-sm text-[#963e42]">
                {updateMutation.error instanceof Error
                  ? updateMutation.error.message
                  : "Failed to update document."}
              </p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                className="button-secondary text-sm"
                onClick={() => setIsEditing(false)}
                disabled={updateMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button-primary inline-flex items-center gap-1.5 text-sm"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <LoaderCircle size={15} className="shrink-0 animate-spin" />
                ) : (
                  <Check size={15} className="shrink-0" />
                )}
                <span>Save changes</span>
              </button>
            </div>
          </form>
        </section>
      )}

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
              className="button-secondary inline-flex items-center gap-1.5 text-sm"
            >
              <Download size={15} className="shrink-0" /> Open file
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
