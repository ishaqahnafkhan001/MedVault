import { EpisodesList } from "@/components/episodes-list";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Episodes of Care | MedVault",
};

export default function EpisodesPage() {
  return <EpisodesList />;
}
