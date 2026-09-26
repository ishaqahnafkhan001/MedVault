"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Plus, LoaderCircle, FolderOpen, Calendar, Clock, ArrowRight, Layers } from "lucide-react";
import { episodeListResponseSchema, formatClinicalDate } from "@medvault/shared";
import { validatedRequest } from "@/lib/phase2-api";

export function EpisodesList() {
  const episodesQuery = useQuery({
    queryKey: ["episodes"],
    queryFn: () => validatedRequest(episodeListResponseSchema, "/v1/episodes"),
  });

  if (episodesQuery.isLoading) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <LoaderCircle className="animate-spin text-[#176c5b]" />
      </div>
    );
  }

  if (episodesQuery.isError || !episodesQuery.data) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-6 text-center text-red-600">
        Failed to load episodes.
      </div>
    );
  }

  const episodes = episodesQuery.data.episodes;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Health timeline</p>
          <h1 className="page-title mt-2">Episodes of care</h1>
          <p className="muted mt-2">Group related reports to track medical trends over time.</p>
        </div>
        <Link href="/episodes/new" className="button-primary">
          <Plus size={16} className="shrink-0" />
          <span>New episode</span>
        </Link>
      </div>

      {/* Explanatory introduction card */}
      <div className="surface mt-6 flex items-start gap-3.5 rounded-2xl p-4 sm:p-5">
        <div className="rounded-xl bg-[#e5f2ed] p-2.5 text-[#176c5b] shrink-0">
          <Layers size={20} className="shrink-0" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-[#142621]">What is an Episode of Care?</h2>
          <p className="muted mt-1 text-xs leading-relaxed sm:text-sm">
            An episode lets you group related medical reports around a specific health event—such as
            an annual health checkup, a surgery recovery period, or treatment for a specific
            condition. Once grouped, MedVault automatically plots your test results across time on
            comparative trend charts and can generate an AI summary of your health progress
            throughout the episode.
          </p>
        </div>
      </div>

      {episodes.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#cbd8d3] bg-white/60 p-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e5f2ed] text-[#176c5b]">
            <FolderOpen size={26} className="shrink-0" />
          </div>
          <h3 className="mt-4 text-lg font-bold text-[#162522]">No episodes yet</h3>
          <p className="muted mt-1 max-w-sm text-sm">
            Create an episode to group your medical reports and generate AI summaries of your health
            trends.
          </p>
          <Link href="/episodes/new" className="button-primary mt-6">
            <Plus size={16} className="shrink-0" />
            <span>Create your first episode</span>
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {episodes.map((episode) => (
            <Link
              key={episode.id}
              href={`/episodes/${episode.id}`}
              className="group flex flex-col justify-between rounded-2xl border border-[#e0e8e4] bg-white p-5 shadow-2xs transition hover:-translate-y-0.5 hover:border-[#a8c7bd] hover:shadow-md"
            >
              <div>
                <h3 className="line-clamp-2 font-bold text-[#162522] transition group-hover:text-[#176c5b]">
                  {episode.title}
                </h3>
                <div className="muted mt-3 flex items-center gap-1.5 text-xs">
                  <Calendar size={13} className="shrink-0 text-[#7a8a85]" />
                  <span>Started {formatClinicalDate(episode.startDate)}</span>
                </div>
                {episode.endDate && (
                  <div className="muted mt-1.5 flex items-center gap-1.5 text-xs">
                    <Clock size={13} className="shrink-0 text-[#7a8a85]" />
                    <span>Ended {formatClinicalDate(episode.endDate)}</span>
                  </div>
                )}
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-[#edf3f0] pt-3 text-xs font-bold text-[#176c5b]">
                <span>View episode details</span>
                <ArrowRight
                  size={14}
                  className="shrink-0 transition-transform group-hover:translate-x-1"
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
