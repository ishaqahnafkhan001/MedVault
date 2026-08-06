import { DocumentDetail } from "@/components/document-detail";

export const metadata = { title: "Medical document" };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocumentDetail id={id} />;
}
