import { describe, expect, it } from "vitest";
import { categorizeTestName, normalizeTestName, selectLatestVerifiedReports } from "./index.js";

describe("medical organization", () => {
  it.each(["CBC", "Complete Blood Count", "Complete Blood Count (CBC)"])(
    "normalizes %s to the same test identity",
    (name) => expect(normalizeTestName(name)).toBe("cbc"),
  );

  it("categorizes deterministically", () => {
    expect(categorizeTestName("Complete Blood Count")).toBe("HEMATOLOGY");
    expect(categorizeTestName("ECG")).toBe("CARDIOLOGY");
  });

  it("chooses March regardless of upload order", () => {
    const reports = [
      candidate("january", "2026-01-10", "2026-05-01"),
      candidate("march", "2026-03-10", "2026-03-11"),
      candidate("february", "2026-02-10", "2026-06-01"),
    ];
    expect(selectLatestVerifiedReports(reports)[0]?.id).toBe("march");
  });

  it("uses createdAt only to break a same-report-date tie", () => {
    const reports = [
      candidate("first", "2026-03-10", "2026-03-11"),
      candidate("second", "2026-03-10", "2026-03-12"),
    ];
    expect(selectLatestVerifiedReports(reports)[0]?.id).toBe("second");
  });

  it("excludes unverified and undated reports", () => {
    const unverified = { ...candidate("draft", "2026-05-10", "2026-05-10"), verified: false };
    const verified = candidate("verified", "2026-03-10", "2026-03-10");
    const undated = { ...candidate("undated", "2026-01-01", "2026-06-10"), reportDate: null };
    expect(
      selectLatestVerifiedReports([unverified, verified, undated]).map(({ id }) => id),
    ).toEqual(["verified"]);
  });
});

function candidate(id: string, reportDate: string, createdAt: string) {
  return {
    id,
    normalizedTestName: "cbc",
    reportDate: new Date(reportDate),
    createdAt: new Date(createdAt),
    verified: true,
  };
}
