import { TestHistoryView } from "@/components/test-history-view";

export const metadata = { title: "Test history" };

export default async function TestHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ metric?: string | string[] }>;
}) {
  const params = await searchParams;
  const metric = typeof params.metric === "string" ? params.metric.slice(0, 180) : "";
  return <TestHistoryView initialMetric={metric} />;
}
