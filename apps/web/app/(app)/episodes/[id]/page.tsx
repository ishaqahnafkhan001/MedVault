import { EpisodeView } from "@/components/episode-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Episode Details | MedVault",
};

export default async function EpisodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="min-h-screen bg-gray-50/50 px-4 py-8 sm:px-6 lg:px-8">
      <EpisodeView id={id} />
    </div>
  );
}
