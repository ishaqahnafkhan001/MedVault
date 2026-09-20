import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { formatClinicalDate, type LatestMetricCardDto } from "@medvault/shared";

export function LatestMetricCard({ card }: { card: LatestMetricCardDto }) {
  const point = card.latest;
  const value =
    point.valueKind === "EXACT" && point.numericValue !== null
      ? `${point.numericValue}${point.unit ? ` ${point.unit}` : ""}`
      : (point.textValue ?? "Value unavailable");
  return (
    <article className="surface rounded-2xl p-5" data-testid="latest-metric-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Latest patient-reviewed value</p>
          <h3 className="mt-1 text-lg font-extrabold">{card.explanation.displayName}</h3>
        </div>
        <span className="rounded-full bg-[#e7f0ed] px-2.5 py-1 text-xs font-bold text-[#176c5b]">
          {card.observationCount} observation{card.observationCount === 1 ? "" : "s"}
        </span>
      </div>
      <p className="mt-4 text-3xl font-extrabold text-[#163b34]">{value}</p>
      <dl className="mt-3 grid gap-1 text-sm">
        <div className="flex gap-2">
          <dt className="font-bold">Clinical date:</dt>
          <dd>{formatClinicalDate(point.reportDate)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-bold">Source range:</dt>
          <dd>{point.referenceRange ?? "Not supplied"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-bold">Comparison:</dt>
          <dd>{card.comparability === "ESTABLISHED" ? "Context matched" : "Context uncertain"}</dd>
        </div>
      </dl>
      <p className="muted mt-3 text-xs">{card.explanation.uncertainty}</p>
      <div className="mt-4 flex flex-wrap gap-4 text-sm font-bold text-[#176c5b]">
        <Link href={`/history?metric=${encodeURIComponent(card.normalizedTestName)}`}>
          View test history <ArrowRight className="inline" size={15} />
        </Link>
        <Link href={`/reports/${point.reportId}`}>
          Original report <ExternalLink className="inline" size={14} />
        </Link>
      </div>
    </article>
  );
}
