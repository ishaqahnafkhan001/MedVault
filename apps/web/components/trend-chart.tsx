"use client";
import { useId, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  measurementSeriesSchema,
  formatClinicalDate,
  type MeasurementSeriesDto,
  type TrendPointDto,
} from "@medvault/shared";
import { commonChartRange, displayNumber } from "@/lib/trends";
export function TrendChart({ series }: { series: MeasurementSeriesDto }) {
  const [selected, setSelected] = useState<string | null>(null);
  const titleId = useId();
  const parsed = measurementSeriesSchema.safeParse(series);
  if (!parsed.success) return <p role="alert">Invalid trend data. Refresh the report list.</p>;
  const data = parsed.data;
  const points = data.points.filter(
    (p): p is TrendPointDto & { numericValue: number; reportDate: string } =>
      p.numericValue !== null && p.reportDate !== null && p.valueKind === "EXACT",
  );
  if (!points.length)
    return (
      <div className="rounded-2xl border border-dashed border-[#ccd9d4] bg-[#fafbf9] p-8 text-center">
        <p className="font-bold text-[#142621]">No plottable observations.</p>
        <p className="muted mt-1 text-xs">
          Unknown dates, bounded and qualitative results remain available in the table.
        </p>
      </div>
    );
  const width = 800,
    height = 320,
    left = 70,
    right = 30,
    top = 25,
    bottom = 60;
  const band = commonChartRange(points);
  const vals = points.map((p) => p.numericValue);
  if (band) vals.push(band.low, band.high);
  const min = Math.min(...vals),
    max = Math.max(...vals),
    margin = (max - min || Math.abs(max) * 0.1 || 1) * 0.15;
  const yMin = min - margin,
    yMax = max + margin;
  if (![yMin, yMax, yMax - yMin].every(Number.isFinite))
    return (
      <p role="alert">Values exceed the chart scale. Review the original values in the table.</p>
    );
  const dates = points.map((p) => Date.parse(`${p.reportDate}T00:00:00Z`));
  const first = Math.min(...dates),
    last = Math.max(...dates);
  const x = (date: number) =>
    first === last ? width / 2 : left + ((date - first) / (last - first)) * (width - left - right);
  const y = (value: number) => top + ((yMax - value) / (yMax - yMin)) * (height - top - bottom);
  const line = points
    .map(
      (p, i) =>
        `${i ? "L" : "M"} ${x(Date.parse(`${p.reportDate}T00:00:00Z`))} ${y(p.numericValue)}`,
    )
    .join(" ");
  const active = points.find((p) => p.measurementId === selected);
  return (
    <div className="space-y-4 rounded-2xl border border-[#dce5e1] bg-white p-5 sm:p-6 shadow-sm">
      <h3 id={titleId} className="font-extrabold text-base text-[#142621]">
        {data.normalizedTestName} — {data.canonicalUnit ?? "unit unknown"}
      </h3>
      <p className="muted text-sm">
        Comparability:{" "}
        {data.comparability === "UNCERTAIN"
          ? "uncertain; context is incomplete"
          : "matching documented context"}
        . Changes do not establish clinical significance.
      </p>
      {!band && (
        <p data-testid="range-unavailable" className="text-xs text-[#859490]">
          No common reference band: ranges differ, are missing, or cannot be safely interpreted. See
          each source range in the table.
        </p>
      )}
      {points.length === 1 && (
        <p className="muted text-sm">One observation; no trend can be established.</p>
      )}
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="min-w-[600px] w-full"
          role="img"
          aria-labelledby={titleId}
        >
          <desc>
            Dates are spaced by elapsed time. Focus or tap a point for details; all observations
            also have a table alternative.
          </desc>
          {band && (
            <rect
              data-testid="common-reference-band"
              x={left}
              y={y(band.high)}
              width={width - left - right}
              height={y(band.low) - y(band.high)}
              fill="#dcfce7"
            />
          )}
          {[0, 0.25, 0.5, 0.75, 1].map((r) => (
            <g key={r}>
              <line
                x1={left}
                x2={width - right}
                y1={y(yMin + (yMax - yMin) * r)}
                y2={y(yMin + (yMax - yMin) * r)}
                stroke="#e5e7eb"
              />
              <text x={left - 8} y={y(yMin + (yMax - yMin) * r) + 4} textAnchor="end" fontSize="10">
                {displayNumber(yMin + (yMax - yMin) * r)}
              </text>
            </g>
          ))}
          {points.length > 1 && <path d={line} fill="none" stroke="#176c5b" strokeWidth="2" />}
          {points.map((p) => (
            <g
              key={p.measurementId}
              role="button"
              tabIndex={0}
              aria-label={`${formatClinicalDate(p.reportDate)}: ${p.numericValue} ${p.unit ?? "unit unknown"}; source flag ${p.sourceFlag ?? "unknown"}`}
              onFocus={() => setSelected(p.measurementId)}
              onClick={() => setSelected(p.measurementId)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(p.measurementId);
                }
              }}
            >
              <circle
                cx={x(Date.parse(`${p.reportDate}T00:00:00Z`))}
                cy={y(p.numericValue)}
                r={selected === p.measurementId ? 7 : 5}
                stroke="#176c5b"
                fill={
                  ["HIGH", "LOW", "ABNORMAL", "CRITICAL"].includes(p.flag) ? "#b91c1c" : "white"
                }
              />
              <title>{`${formatClinicalDate(p.reportDate)}: ${p.numericValue} ${p.unit ?? "unit unknown"}; range ${p.referenceRange ?? "unknown"}; flag ${p.sourceFlag ?? "unknown"}`}</title>
            </g>
          ))}
          {[...new Set([first, last])].map((d) => (
            <text key={d} x={x(d)} y={height - 30} textAnchor="middle" fontSize="11">
              {formatClinicalDate(new Date(d).toISOString().slice(0, 10))}
            </text>
          ))}
          <text x={width / 2} y={height - 8} textAnchor="middle" fontSize="12">
            Clinical report date (elapsed time)
          </text>
          <text x="15" y="15" fontSize="10">
            {data.canonicalUnit ?? "Unit unknown"}
          </text>
        </svg>
      </div>
      {active && (
        <div role="status" className="rounded-xl border border-[#dce5e1] bg-[#f4f8f6] p-4 text-sm">
          <p className="font-bold text-[#142621]">
            {formatClinicalDate(active.reportDate)}: {displayNumber(active.numericValue)}{" "}
            {active.unit}
          </p>
          <p className="muted mt-0.5 text-xs">
            Source range: {active.referenceRange ?? "Unknown"} · Source flag:{" "}
            {active.sourceFlag ?? "Unknown"}
          </p>
          <Link
            className="group mt-2 inline-flex items-center gap-1 font-bold text-[#176c5b] hover:text-[#0e4f43]"
            href={`/reports/${active.reportId}`}
          >
            <span>View source report</span>
            <ArrowRight
              size={13}
              className="shrink-0 transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      )}
      {points.length < data.points.length && (
        <p className="muted text-xs">
          Some results are not plotted. Bounded/qualitative results and unknown dates are preserved
          in the table.
        </p>
      )}
    </div>
  );
}
