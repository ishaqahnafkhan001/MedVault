import { EpisodeForm } from "@/components/episode-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Episode | MedVault",
};

export default function NewEpisodePage() {
  return <EpisodeForm />;
}
