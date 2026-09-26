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
        className="muted mb-6 inline-flex items-center gap-2 text-sm font-semibold transition hover:text-[#176c5b]"
      >
        <ArrowLeft size={16} className="shrink-0" />
        Back to episodes
      </Link>

      <div className="surface rounded-2xl p-7 sm:p-8">
        <div className="mb-6 space-y-1">
          <p className="eyebrow">Care episode</p>
          <h1 className="page-title mt-1 text-2xl font-extrabold sm:text-3xl">
            {existing ? "Edit episode" : "Create new episode"}
          </h1>
          <p className="muted mt-2 text-sm leading-relaxed">
            Episodes group related reports (such as an annual checkup or treatment period) so you
            can track lab trends and generate an AI summary across all tests in that timeframe.
            Choose your own grouping. A shared date range does not establish a diagnosis.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="space-y-5"
        >
          <div>
            <label htmlFor="title" className="label">
              Episode Title
            </label>
            <input
              type="text"
              id="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Annual Checkup 2026, Post-Surgery Recovery"
              className="field"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="startDate" className="label">
                Start Date
              </label>
              <input
                type="date"
                id="startDate"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="field"
              />
            </div>
            <div>
              <label htmlFor="endDate" className="label">
                End Date (Optional)
              </label>
              <input
                type="date"
                id="endDate"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="field"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-[#e2e9e6] pt-5">
            <Link href="/episodes" className="button-secondary">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={
                createMutation.isPending ||
                !title ||
                Boolean(startDate && endDate && startDate > endDate)
              }
              className="button-primary inline-flex items-center gap-2"
            >
              {createMutation.isPending && (
                <LoaderCircle size={16} className="shrink-0 animate-spin" />
              )}
              {existing ? "Save changes" : "Create episode"}
            </button>
          </div>

          {createMutation.isError && (
            <p className="rounded-xl bg-[#f8e4e4] p-3 text-sm text-[#963e42]">
              Failed to create episode. Please try again.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
