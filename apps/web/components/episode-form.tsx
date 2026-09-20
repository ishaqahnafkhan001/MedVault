"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { validatedRequest } from "@/lib/phase2-api";
import { episodeCreateResponseSchema, type EpisodeDto } from "@medvault/shared";

export function EpisodeForm({
  existing,
  onSaved,
}: {
  existing?: EpisodeDto;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [startDate, setStartDate] = useState(existing?.startDate ?? "");
  const [endDate, setEndDate] = useState(existing?.endDate ?? "");

  const createMutation = useMutation({
    mutationFn: async () => {
      return validatedRequest(
        episodeCreateResponseSchema,
        existing ? `/v1/episodes/${existing.id}` : "/v1/episodes",
        {
          method: existing ? "PUT" : "POST",
          body: JSON.stringify({
            title,
            startDate: startDate || null,
            endDate: endDate || null,
          }),
        },
      );
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["episodes"] });
      if (onSaved) {
        onSaved();
        return;
      }
      router.push(`/episodes/${data.episode.id}`);
    },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/episodes"
        className="muted inline-flex items-center gap-2 text-sm font-bold hover:text-emerald-600 mb-6"
      >
        <ArrowLeft size={16} />
        Back to episodes
      </Link>

      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {existing ? "Edit episode" : "Create new episode"}
        </h1>
        <p>Choose your own grouping. A shared date range does not establish a diagnosis.</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="space-y-6"
        >
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">
              Episode Title
            </label>
            <input
              type="text"
              id="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Annual Checkup 2026, Post-Surgery Recovery"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">
                Start Date
              </label>
              <input
                type="date"
                id="startDate"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">
                End Date (Optional)
              </label>
              <input
                type="date"
                id="endDate"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
            <Link
              href="/episodes"
              className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={
                createMutation.isPending ||
                !title ||
                Boolean(startDate && endDate && startDate > endDate)
              }
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
            >
              {createMutation.isPending && <LoaderCircle size={16} className="animate-spin" />}
              {existing ? "Save changes" : "Create episode"}
            </button>
          </div>

          {createMutation.isError && (
            <p className="text-sm text-red-600 mt-2">Failed to create episode. Please try again.</p>
          )}
        </form>
      </div>
    </div>
  );
}
