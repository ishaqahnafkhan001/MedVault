import { EpisodeView } from "@/components/episode-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Episode Details | MedVault",
};

export default async function EpisodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EpisodeView id={id} />;
}
