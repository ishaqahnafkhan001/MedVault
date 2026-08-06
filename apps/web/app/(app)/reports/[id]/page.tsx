import { ReportReview } from "@/components/report-review";
export const metadata = { title: "Review report" };
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReportReview id={id} />;
}
