import { EpisodeForm } from "@/components/episode-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Episode | MedVault",
};

export default function NewEpisodePage() {
  return (
    <div className="min-h-screen bg-gray-50/50 px-4 py-8 sm:px-6 lg:px-8">
      <EpisodeForm />
    </div>
  );
}
