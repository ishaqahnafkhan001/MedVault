"use client";
import Link from "next/link";
import {
  formatClinicalDate,
  measurementSeriesSchema,
  type MeasurementSeriesDto,
} from "@medvault/shared";
import { displayNumber } from "@/lib/trends";
export function MeasurementTable({ series }: { series: MeasurementSeriesDto }) {
  const parsed = measurementSeriesSchema.safeParse(series);
  if (!parsed.success) return <p role="alert">Invalid measurement data.</p>;
  const points = parsed.data.points;
  if (!points.length) return <p>No observations available.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="min-w-full text-left text-sm">
        <caption className="p-3 text-left">
          {series.normalizedTestName}: patient-reviewed observations, not clinician certification.
          Each range and flag belongs to its source.
        </caption>
        <thead>
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
              <th key={h} scope="col" className="p-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.measurementId} className="border-t">
              <td className="p-3">{formatClinicalDate(p.reportDate)}</td>
              <td className="p-3">
                {p.valueKind === "EXACT"
                  ? displayNumber(p.numericValue)
                  : (p.textValue ?? "Unavailable")}
                {p.converted && (
                  <p className="text-xs">
                    Original: {p.originalTextValue ?? p.originalNumericValue} {p.originalUnit}
                  </p>
                )}
              </td>
              <td className="p-3">{p.unit ?? "Unknown"}</td>
              <td className="p-3">
                {p.referenceRange ?? "Unknown"}
                {p.converted && (
                  <p className="text-xs">Original: {p.originalReferenceRange ?? "Unknown"}</p>
                )}
              </td>
              <td className="p-3">
                {p.sourceFlag ?? "Unknown"} (
                {p.flag === "UNKNOWN" ? "not assessed" : p.flag.toLowerCase()})
              </td>
              <td className="p-3">
                {p.change ? (
                  <>
                    {displayNumber(p.change.absolute)} {p.unit}
                    <br />
                    {p.change.percentChange === null
                      ? "Percentage unavailable (zero baseline)"
                      : `${displayNumber(p.change.percentChange)}%`}
                    <p className="text-xs">Numerical change; clinical significance not assessed</p>
                  </>
                ) : (
                  "Unavailable"
                )}
              </td>
              <td className="p-3">
                <Link className="text-emerald-700 underline" href={`/reports/${p.reportId}`}>
                  View source report
                </Link>
                <p className="text-xs">
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
