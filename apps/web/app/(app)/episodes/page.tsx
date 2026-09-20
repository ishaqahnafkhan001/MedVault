import { EpisodesList } from "@/components/episodes-list";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Episodes of Care | MedVault",
};

export default function EpisodesPage() {
  return (
    <div className="min-h-screen bg-gray-50/50 px-4 py-8 sm:px-6 lg:px-8">
      <EpisodesList />
    </div>
  );
}
