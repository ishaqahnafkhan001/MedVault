import type { ReportCategory } from "@medvault/shared";

const aliases: Readonly<Record<string, string>> = {
  cbc: "cbc",
  "complete blood count": "cbc",
  "complete blood count cbc": "cbc",
  "full blood count": "cbc",
  fbc: "cbc",
  hba1c: "hba1c",
  "hemoglobin a1c": "hba1c",
  "glycated hemoglobin": "hba1c",
  "dengue ns1": "dengue ns1",
  "dengue ns1 antigen": "dengue ns1",
  tsh: "tsh",
  "thyroid stimulating hormone": "tsh",
  ecg: "ecg",
  electrocardiogram: "ecg",
};

export function normalizeTestName(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  return aliases[normalized] ?? normalized;
}

const categoryRules: ReadonlyArray<{ category: ReportCategory; terms: readonly string[] }> = [
  { category: "HEMATOLOGY", terms: ["cbc", "blood count", "hemoglobin", "platelet"] },
  { category: "ENDOCRINOLOGY", terms: ["thyroid", "tsh", "t3", "t4", "hba1c"] },
  { category: "BIOCHEMISTRY", terms: ["glucose", "creatinine", "kidney", "liver", "lipid"] },
  { category: "IMMUNOLOGY", terms: ["dengue", "antibody", "antigen", "immunology"] },
  { category: "MICROBIOLOGY", terms: ["culture", "microbiology", "sensitivity"] },
  { category: "CARDIOLOGY", terms: ["ecg", "electrocardiogram", "echocardiogram"] },
  { category: "RADIOLOGY", terms: ["x ray", "ultrasound", "ct scan", "mri", "radiology"] },
  { category: "PATHOLOGY", terms: ["biopsy", "histopathology", "cytology"] },
  { category: "URINALYSIS", terms: ["urine", "urinalysis"] },
];

export function categorizeTestName(testName: string): ReportCategory {
  const normalized = normalizeTestName(testName);
  return (
    categoryRules.find(({ terms }) => terms.some((term) => normalized.includes(term)))?.category ??
    "OTHER"
  );
}

export interface LatestReportCandidate {
  id: string;
  normalizedTestName: string | null;
  reportDate: Date | null;
  createdAt: Date;
  verified: boolean;
}

export function selectLatestVerifiedReports<T extends LatestReportCandidate>(
  reports: readonly T[],
): T[] {
  const latest = new Map<string, T>();
  const eligible = reports.filter(
    (report): report is T & { normalizedTestName: string; reportDate: Date } =>
      report.verified && report.normalizedTestName !== null && report.reportDate !== null,
  );

  for (const report of eligible) {
    const current = latest.get(report.normalizedTestName);
    if (
      !current ||
      report.reportDate.getTime() > (current.reportDate?.getTime() ?? 0) ||
      (report.reportDate.getTime() === current.reportDate?.getTime() &&
        report.createdAt.getTime() > current.createdAt.getTime())
    ) {
      latest.set(report.normalizedTestName, report);
    }
  }

  return [...latest.values()].sort((left, right) => {
    const byReportDate = (right.reportDate?.getTime() ?? 0) - (left.reportDate?.getTime() ?? 0);
    return byReportDate || right.createdAt.getTime() - left.createdAt.getTime();
  });
}
