"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FileScan, FileText, LoaderCircle, LockKeyhole, Pill } from "lucide-react";
import type { DocumentDto, DocumentType, ReportCategory } from "@medvault/shared";
import { apiRequest } from "@/lib/api";

export function UploadForm() {
  const router = useRouter();
  const [type, setType] = useState<DocumentType>("REPORT");
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState("");
  const [test, setTest] = useState("");
  const [hospital, setHospital] = useState("");
  const [category, setCategory] = useState<ReportCategory | "">("");
  const mutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a file to upload.");
      const form = new FormData();
      form.set("file", file);
      form.set(
        "metadata",
        JSON.stringify({
          documentType: type,
          documentDate: date || null,
          testName: test || null,
          hospitalName: hospital || null,
          category: category || null,
        }),
      );
      return apiRequest<{ document: DocumentDto }>("/v1/documents", { method: "POST", body: form });
    },
    onSuccess: ({ document }) =>
      router.push(document.documentType === "REPORT" ? `/reports/${document.id}` : "/documents"),
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }
  return (
    <form onSubmit={submit} className="surface rounded-3xl p-6 sm:p-8">
      <fieldset>
        <legend className="label mb-3">What are you uploading?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["REPORT", "PRESCRIPTION"] as const).map((value) => (
            <label
              key={value}
              className={`cursor-pointer rounded-2xl border p-4 transition ${type === value ? "border-[#176c5b] bg-[#e9f3ef] ring-2 ring-[#176c5b]/10" : "border-[#dce5e1] bg-white"}`}
            >
              <input
                className="sr-only"
                type="radio"
                name="type"
                checked={type === value}
                onChange={() => setType(value)}
              />
              <span className="flex items-center gap-3 font-extrabold">
                {value === "REPORT" ? (
                  <FileText className="text-[#176c5b]" />
                ) : (
                  <Pill className="text-[#9b641e]" />
                )}
                {value === "REPORT" ? "Medical report" : "Prescription"}
              </span>
              <span className="muted mt-2 block text-sm">
                {value === "REPORT"
                  ? "AI extracts facts for you to review."
                  : "Stored privately. Never sent to AI."}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-6 grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-[#b9cbc5] bg-[#fafbf8] p-8 text-center hover:border-[#6f9f91]">
        <FileScan className="mb-3 text-[#176c5b]" size={30} />
        <span className="font-extrabold">{file ? file.name : "Choose PDF or image"}</span>
        <span className="muted mt-1 text-xs">PDF, JPG, PNG, or WebP · up to 15 MB</span>
        <input
          className="sr-only"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          required
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <label>
          <span className="label">Document date</span>
          <input
            className="field"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          <span className="label">Hospital or lab</span>
          <input
            className="field"
            maxLength={180}
            value={hospital}
            onChange={(e) => setHospital(e.target.value)}
          />
        </label>
        {type === "REPORT" && (
          <>
            <label>
              <span className="label">Test name (if known)</span>
              <input
                className="field"
                maxLength={180}
                placeholder="e.g. CBC"
                value={test}
                onChange={(e) => setTest(e.target.value)}
              />
            </label>
            <label>
              <span className="label">Category</span>
              <select
                className="field"
                value={category}
                onChange={(e) => setCategory(e.target.value as ReportCategory | "")}
              >
                <option value="">Let extraction suggest it</option>
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
            </label>
          </>
        )}
      </div>
      <div className="mt-6 flex items-start gap-3 rounded-xl bg-[#edf4f1] p-4 text-sm text-[#36564e]">
        <LockKeyhole className="mt-0.5 shrink-0" size={17} />
        <p>Your file is stored in a private bucket. Access links expire after a few minutes.</p>
      </div>
      {mutation.isError && (
        <p role="alert" className="mt-5 rounded-xl bg-[#f8e4e4] p-3 text-sm text-[#963e42]">
          {mutation.error.message}
        </p>
      )}
      <button className="button-primary mt-6 w-full sm:w-auto" disabled={mutation.isPending}>
        {mutation.isPending && <LoaderCircle className="animate-spin" size={17} />}{" "}
        {mutation.isPending ? "Uploading…" : "Upload securely"}
      </button>
    </form>
  );
}
function title(v: string) {
  return v
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
}
