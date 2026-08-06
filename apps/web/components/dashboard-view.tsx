"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CircleAlert, FileCheck2, LoaderCircle, Plus, ShieldCheck } from "lucide-react";
import type { DocumentDto } from "@medvault/shared";
import { apiRequest } from "@/lib/api";
import { DocumentCard } from "./document-card";

interface DashboardData {
  recentDocuments: DocumentDto[];
  latestReports: DocumentDto[];
  counts: { processing: number; needsReview: number; verified: number };
}

export function DashboardView() {
  const query = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiRequest<DashboardData>("/v1/dashboard"),
    refetchInterval: (q) => (q.state.data?.counts.processing ? 5000 : false),
  });
  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorState retry={() => void query.refetch()} />;
  const { counts, recentDocuments, latestReports } = query.data;
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow">Patient dashboard</p>
          <h1 className="page-title mt-2">Your health record</h1>
          <p className="muted mt-2">Everything important, verified and easy to find.</p>
        </div>
        <Link href="/documents/upload" className="button-primary">
          <Plus size={18} /> Upload document
        </Link>
      </div>
      <section className="mt-8 grid gap-4 sm:grid-cols-3" aria-label="Report status summary">
        <Stat label="Processing" value={counts.processing} icon={<LoaderCircle />} tone="blue" />
        <Stat
          label="Needs your review"
          value={counts.needsReview}
          icon={<CircleAlert />}
          tone="amber"
        />
        <Stat
          label="Verified reports"
          value={counts.verified}
          icon={<ShieldCheck />}
          tone="green"
        />
      </section>
      {counts.needsReview > 0 && (
        <Link
          href="/reports?status=NEEDS_REVIEW"
          className="mt-6 flex items-center gap-4 rounded-2xl border border-[#ebc988] bg-[#fff8e9] p-4 text-[#704918]"
        >
          <CircleAlert className="shrink-0" />
          <div className="flex-1">
            <p className="font-extrabold">
              {counts.needsReview} report{counts.needsReview === 1 ? "" : "s"} ready to verify
            </p>
            <p className="mt-0.5 text-sm">
              Compare the extracted information with the original report.
            </p>
          </div>
          <ArrowRight />
        </Link>
      )}
      <section className="mt-9">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="eyebrow">Verified history</p>
            <h2 className="mt-1 text-xl font-extrabold">Latest by test</h2>
          </div>
          <Link href="/reports" className="text-sm font-bold text-[#176c5b]">
            View all
          </Link>
        </div>
        {latestReports.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {latestReports.slice(0, 4).map((doc) => (
              <DocumentCard key={doc.id} document={doc} />
            ))}
          </div>
        ) : (
          <Empty
            icon={<FileCheck2 />}
            text="Verified reports will appear here after you review extracted information."
          />
        )}
      </section>
      <section className="mt-9">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-extrabold">Recent documents</h2>
          <Link href="/documents" className="text-sm font-bold text-[#176c5b]">
            Browse documents
          </Link>
        </div>
        {recentDocuments.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {recentDocuments.map((doc) => (
              <DocumentCard key={doc.id} document={doc} />
            ))}
          </div>
        ) : (
          <Empty icon={<Plus />} text="Upload your first medical report or prescription." />
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "blue" | "amber" | "green";
}) {
  const c = {
    blue: "bg-[#e7f0f7] text-[#32627f]",
    amber: "bg-[#fff0d9] text-[#8b5a17]",
    green: "bg-[#e4f2ec] text-[#176c5b]",
  }[tone];
  return (
    <div className="surface rounded-2xl p-5">
      <div className={`mb-4 inline-flex rounded-xl p-2.5 ${c}`}>{icon}</div>
      <p className="text-3xl font-extrabold">{value}</p>
      <p className="muted mt-1 text-sm font-semibold">{label}</p>
    </div>
  );
}
function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#cbd8d3] bg-white/50 p-8 text-center">
      <div className="mx-auto mb-3 w-fit text-[#75a496]">{icon}</div>
      <p className="muted text-sm">{text}</p>
    </div>
  );
}
function Loading() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="text-center">
        <LoaderCircle className="mx-auto animate-spin text-[#176c5b]" />
        <p className="muted mt-3 text-sm">Loading your vault…</p>
      </div>
    </div>
  );
}
function ErrorState({ retry }: { retry: () => void }) {
  return (
    <div className="surface mx-auto mt-16 max-w-lg rounded-2xl p-8 text-center">
      <h1 className="text-xl font-extrabold">We couldn’t load your vault</h1>
      <p className="muted mt-2 text-sm">Check your connection and try again.</p>
      <button onClick={retry} className="button-primary mt-5">
        Try again
      </button>
    </div>
  );
}
