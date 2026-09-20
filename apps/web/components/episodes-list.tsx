"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Plus, LoaderCircle, FolderOpen, Calendar, Clock, ArrowRight } from "lucide-react";
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
        <LoaderCircle className="animate-spin text-emerald-600" />
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
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Episodes of Care</h1>
          <p className="mt-2 text-gray-500">
            Group related reports to track medical trends over time.
          </p>
        </div>
        <Link
          href="/episodes/new"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500"
        >
          <Plus size={18} />
          New Episode
        </Link>
      </div>

      {episodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <FolderOpen size={32} />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No episodes yet</h3>
          <p className="mt-1 max-w-sm text-center text-gray-500">
            Create an episode to group your medical reports and generate AI summaries of your health
            trends.
          </p>
          <Link
            href="/episodes/new"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            Create your first episode
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {episodes.map((episode) => (
            <Link
              key={episode.id}
              href={`/episodes/${episode.id}`}
              className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md"
            >
              <div>
                <h3 className="font-semibold text-gray-900 group-hover:text-emerald-700 transition-colors line-clamp-2">
                  {episode.title}
                </h3>
                <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
                  <Calendar size={14} className="text-gray-400" />
                  <span>{formatClinicalDate(episode.startDate)}</span>
                </div>
                {episode.endDate && (
                  <div className="mt-1.5 flex items-center gap-2 text-sm text-gray-500">
                    <Clock size={14} className="text-gray-400" />
                    <span>Ends {formatClinicalDate(episode.endDate)}</span>
                  </div>
                )}
              </div>
              <div className="mt-6 flex items-center text-sm font-medium text-emerald-600">
                View episode details
                <ArrowRight
                  size={16}
                  className="ml-1 opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100"
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
