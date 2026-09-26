"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  formatClinicalDate,
  measurementSeriesSchema,
  type MeasurementSeriesDto,
} from "@medvault/shared";
import { displayNumber } from "@/lib/trends";

export function MeasurementTable({ series }: { series: MeasurementSeriesDto }) {
  const parsed = measurementSeriesSchema.safeParse(series);
  if (!parsed.success)
    return (
      <p role="alert" className="text-sm text-[#a63d40]">
        Invalid measurement data.
      </p>
    );
  const points = parsed.data.points;
  if (!points.length) return <p className="muted text-sm">No observations available.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-[#dce5e1] bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <caption className="border-b border-[#e2e9e6] bg-[#fafbf9] p-3.5 text-left text-xs text-[#5c6965]">
          {series.normalizedTestName}: patient-reviewed observations, not clinician certification.
          Each range and flag belongs to its source.
        </caption>
        <thead className="bg-[#f4f7f5] text-xs font-bold uppercase tracking-wider text-[#40514c]">
          <tr>
            {[
              "Report date",
              "Value",
              "Unit",
              "Source range",
              "Source flag",
              "Change",
              "Source",
            ].map((h) => (
              <th key={h} scope="col" className="p-3.5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e2e9e6]">
          {points.map((p) => (
            <tr key={p.measurementId} className="transition hover:bg-[#fafbf9]">
              <td className="p-3.5 font-medium">{formatClinicalDate(p.reportDate)}</td>
              <td className="p-3.5 font-bold">
                {p.valueKind === "EXACT"
                  ? displayNumber(p.numericValue)
                  : (p.textValue ?? "Unavailable")}
                {p.converted && (
                  <p className="muted text-xs font-normal">
                    Original: {p.originalTextValue ?? p.originalNumericValue} {p.originalUnit}
                  </p>
                )}
              </td>
              <td className="p-3.5">{p.unit ?? "Unknown"}</td>
              <td className="p-3.5">
                {p.referenceRange ?? "Unknown"}
                {p.converted && (
                  <p className="muted text-xs">Original: {p.originalReferenceRange ?? "Unknown"}</p>
                )}
              </td>
              <td className="p-3.5">
                {p.sourceFlag ?? "Unknown"} (
                {p.flag === "UNKNOWN" ? "not assessed" : p.flag.toLowerCase()})
              </td>
              <td className="p-3.5">
                {p.change ? (
                  <>
                    <span className="font-semibold">{displayNumber(p.change.absolute)}</span>{" "}
                    {p.unit}
                    <br />
                    <span className="text-xs text-[#53655f]">
                      {p.change.percentChange === null
                        ? "Percentage unavailable (zero baseline)"
                        : `${displayNumber(p.change.percentChange)}%`}
                    </span>
                    <p className="muted text-[11px]">
                      Numerical change; clinical significance not assessed
                    </p>
                  </>
                ) : (
                  <span className="muted">Unavailable</span>
                )}
              </td>
              <td className="p-3.5">
                <Link
                  className="group inline-flex items-center gap-1 font-bold text-[#176c5b] hover:text-[#0e4f43]"
                  href={`/reports/${p.reportId}`}
                >
                  <span>View source report</span>
                  <ArrowRight
                    size={13}
                    className="shrink-0 transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
                <p className="muted mt-1 text-xs">
                  {p.laboratory ?? "Laboratory unknown"}; method {p.method ?? "unknown"}; specimen{" "}
                  {p.specimen ?? "unknown"}
                </p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
