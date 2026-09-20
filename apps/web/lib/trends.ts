import type { TrendPointDto } from "@medvault/shared";
export function commonChartRange(points: readonly TrendPointDto[]) {
  const first = points[0];
  if (
    !first?.rangeBounds ||
    !first.unit ||
    points.some(
      (p) =>
        !p.rangeBounds ||
        p.unit !== first.unit ||
        p.rangeBounds.low !== first.rangeBounds?.low ||
        p.rangeBounds.high !== first.rangeBounds?.high,
    )
  )
    return null;
  return first.rangeBounds;
}
export function displayNumber(value: number | null): string {
  return value === null
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", { maximumSignificantDigits: 12 }).format(value);
}
