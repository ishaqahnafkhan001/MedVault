import request from "supertest";
import { describe, expect, it } from "vitest";
import type {
  DocumentDto,
  DocumentListQuery,
  DocumentMetadataInput,
  PatientProfileDto,
  PatientProfileInput,
  ReportDetailDto,
  VerifyReportInput,
} from "@medvault/shared";
import { createApp } from "../app.js";
import { notFound } from "../errors.js";
import type { AppService, AuthVerifier, UploadedDocumentFile } from "../types.js";

const patientA = "10000000-0000-4000-8000-000000000001";
const patientB = "20000000-0000-4000-8000-000000000002";
const documentA = "30000000-0000-4000-8000-000000000003";

describe("authenticated API", () => {
  it("serves a browser-friendly backend confirmation page", async () => {
    const response = await request(testApp()).get("/");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.text).toContain("MedVault API is running");
  });

  it("rejects unauthenticated private requests", async () => {
    const response = await request(testApp()).get("/v1/documents");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("resolves profiles only from the bearer identity", async () => {
    const app = testApp();
    const a = await request(app).get("/v1/profile").set("Authorization", "Bearer token-a");
    const b = await request(app).get("/v1/profile").set("Authorization", "Bearer token-b");
    expect(a.body.profile.fullName).toBe("Patient A");
    expect(b.body.profile.fullName).toBe("Patient B");
    const injected = await request(app)
      .put("/v1/profile")
      .set("Authorization", "Bearer token-a")
      .send({ ...profileInput("Patient A"), patientId: patientB });
    expect(injected.status).toBe(400);
  });

  it.each(["documents", "reports"])("prevents cross-patient access to %s", async (resource) => {
    const response = await request(testApp())
      .get(`/v1/${resource}/${documentA}`)
      .set("Authorization", "Bearer token-b");
    expect(response.status).toBe(404);
  });

  it("prevents cross-patient signed URLs, deletion, retry, and verification", async () => {
    const app = testApp();
    const authorization = { Authorization: "Bearer token-b" };
    const [file, deletion, retry, verificationResponse] = await Promise.all([
      request(app).get(`/v1/documents/${documentA}/file`).set(authorization),
      request(app).delete(`/v1/documents/${documentA}`).set(authorization),
      request(app).post(`/v1/reports/${documentA}/retry`).set(authorization),
      request(app).put(`/v1/reports/${documentA}/verify`).set(authorization).send(verification()),
    ]);
    expect([file.status, deletion.status, retry.status, verificationResponse.status]).toEqual([
      404, 404, 404, 404,
    ]);
  });

  it("does not apply the private API rate limit to health checks", async () => {
    const app = testApp(10_000, new FakeService(), 1);
    const first = await request(app).get("/health");
    const second = await request(app).get("/health");
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it("rejects an invalid MIME even when its filename says PDF", async () => {
    const response = await request(testApp())
      .post("/v1/documents")
      .set("Authorization", "Bearer token-a")
      .field("metadata", JSON.stringify({ documentType: "REPORT" }))
      .attach("file", Buffer.from("plain text"), {
        filename: "report.pdf",
        contentType: "application/pdf",
      });
    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe("UNSUPPORTED_FILE");
  });

  it("rejects oversized files", async () => {
    const response = await request(testApp(16))
      .post("/v1/documents")
      .set("Authorization", "Bearer token-a")
      .field("metadata", JSON.stringify({ documentType: "REPORT" }))
      .attach("file", Buffer.from("%PDF-1.4 file larger than limit"), {
        filename: "report.pdf",
        contentType: "application/pdf",
      });
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("FILE_TOO_LARGE");
  });

  it("queues report uploads but never prescription uploads", async () => {
    const service = new FakeService();
    const app = testApp(10_000, service);
    const report = await uploadPdf(app, "REPORT");
    const prescription = await uploadPdf(app, "PRESCRIPTION");
    expect(report.status).toBe(201);
    expect(report.body.document.processingStatus).toBe("QUEUED");
    expect(prescription.status).toBe(201);
    expect(prescription.body.document.processingStatus).toBe("NOT_APPLICABLE");
    expect(service.analysisJobs).toEqual([report.body.document.id]);
  });

  it("requires ownership and review status for verification", async () => {
    const other = await request(testApp())
      .put(`/v1/reports/${documentA}/verify`)
      .set("Authorization", "Bearer token-b")
      .send(verification());
    expect(other.status).toBe(404);
    const owner = await request(testApp())
      .put(`/v1/reports/${documentA}/verify`)
      .set("Authorization", "Bearer token-a")
      .send(verification());
    expect(owner.status).toBe(200);
    expect(owner.body.report.processingStatus).toBe("VERIFIED");
    expect(owner.body.report.measurements[0].numericValue).toBe(101000);
  });

  it("keeps listing and filters patient scoped", async () => {
    const service = new FakeService();
    const response = await request(testApp(10_000, service))
      .get("/v1/reports?test=CBC&hospital=Popular&category=HEMATOLOGY&status=NEEDS_REVIEW")
      .set("Authorization", "Bearer token-a");
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].id).toBe(documentA);
    expect(service.lastReportQuery).toMatchObject({
      test: "CBC",
      hospital: "Popular",
      category: "HEMATOLOGY",
      status: "NEEDS_REVIEW",
    });
  });
});

function testApp(maxUploadBytes = 10_000, service = new FakeService(), rateLimitMax = 10_000) {
  const verifier: AuthVerifier = {
    verify: (token) =>
      Promise.resolve(
        token === "token-a" ? { id: patientA } : token === "token-b" ? { id: patientB } : null,
      ),
  };
  return createApp({
    authVerifier: verifier,
    service,
    webOrigin: "http://localhost:3000",
    maxUploadBytes,
    rateLimitMax,
  });
}

async function uploadPdf(
  app: ReturnType<typeof createApp>,
  documentType: "REPORT" | "PRESCRIPTION",
) {
  return request(app)
    .post("/v1/documents")
    .set("Authorization", "Bearer token-a")
    .field("metadata", JSON.stringify({ documentType }))
    .attach("file", Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF"), {
      filename: "medical.pdf",
      contentType: "application/pdf",
    });
}

class FakeService implements AppService {
  analysisJobs: string[] = [];
  lastReportQuery: DocumentListQuery | null = null;
  private sequence = 10;

  getProfile(authUserId: string) {
    return Promise.resolve(
      profile(authUserId, authUserId === patientA ? "Patient A" : "Patient B"),
    );
  }
  updateProfile(authUserId: string, input: PatientProfileInput) {
    return Promise.resolve(profile(authUserId, input.fullName));
  }
  createDocument(authUserId: string, file: UploadedDocumentFile, metadata: DocumentMetadataInput) {
    const id = `00000000-0000-4000-8000-${String(this.sequence++).padStart(12, "0")}`;
    if (metadata.documentType === "REPORT") this.analysisJobs.push(id);
    return Promise.resolve(
      document(
        id,
        authUserId,
        metadata.documentType === "REPORT" ? "QUEUED" : "NOT_APPLICABLE",
        file,
      ),
    );
  }
  listDocuments(authUserId: string, query: DocumentListQuery) {
    return Promise.resolve(
      page(authUserId === patientA ? [document(documentA, patientA)] : [], query),
    );
  }
  getDocument(authUserId: string, id: string) {
    return authUserId === patientA && id === documentA
      ? Promise.resolve(document(id, authUserId))
      : Promise.reject(notFound());
  }
  getFileUrl(authUserId: string, id: string) {
    return authUserId === patientA && id === documentA
      ? Promise.resolve("https://private.example/signed")
      : Promise.reject(notFound());
  }
  deleteDocument(authUserId: string, id: string) {
    return authUserId === patientA && id === documentA
      ? Promise.resolve()
      : Promise.reject(notFound());
  }
  listReports(authUserId: string, query: DocumentListQuery) {
    this.lastReportQuery = query;
    return Promise.resolve(
      page(authUserId === patientA ? [document(documentA, patientA)] : [], query),
    );
  }
  latestReports(authUserId: string) {
    return Promise.resolve(authUserId === patientA ? [document(documentA, patientA)] : []);
  }
  getReport(authUserId: string, id: string) {
    return authUserId === patientA && id === documentA
      ? Promise.resolve(reportDetail("NEEDS_REVIEW"))
      : Promise.reject(notFound());
  }
  verifyReport(authUserId: string, id: string, input: VerifyReportInput) {
    return authUserId === patientA && id === documentA
      ? Promise.resolve({
          ...reportDetail("VERIFIED"),
          testName: input.testName,
          documentDate: input.reportDate,
          measurements: input.measurements.map((measurement) => ({
            ...measurement,
            normalizedName: measurement.name.toLowerCase(),
            patientCorrected: true,
          })),
        })
      : Promise.reject(notFound());
  }
  retryReport(authUserId: string, id: string) {
    return authUserId === patientA && id === documentA
      ? Promise.resolve(document(id, authUserId, "QUEUED"))
      : Promise.reject(notFound());
  }
  getDashboard(authUserId: string) {
    const reports = authUserId === patientA ? [document(documentA, patientA)] : [];
    return Promise.resolve({
      recentDocuments: reports,
      latestReports: reports,
      counts: { processing: 0, needsReview: 1, verified: 0 },
    });
  }
}

function profile(patientId: string, fullName: string): PatientProfileDto {
  return {
    patientId,
    fullName,
    dateOfBirth: null,
    gender: null,
    bloodGroup: null,
    allergies: [],
    chronicConditions: [],
    emergencyContactName: null,
    emergencyContactPhone: null,
    emergencyContactRelation: null,
    completed: true,
  };
}

function profileInput(fullName: string): PatientProfileInput {
  return {
    fullName,
    dateOfBirth: null,
    gender: null,
    bloodGroup: null,
    allergies: [],
    chronicConditions: [],
    emergencyContactName: null,
    emergencyContactPhone: null,
    emergencyContactRelation: null,
  };
}

function document(
  id: string,
  _owner: string,
  processingStatus: DocumentDto["processingStatus"] = "NEEDS_REVIEW",
  file?: UploadedDocumentFile,
): DocumentDto {
  return {
    id,
    documentType: processingStatus === "NOT_APPLICABLE" ? "PRESCRIPTION" : "REPORT",
    originalFilename: file?.originalFilename ?? "cbc.pdf",
    mimeType: file?.detectedMimeType ?? "application/pdf",
    fileSize: file?.bytes.length ?? 100,
    uploadedAt: "2026-08-07T00:00:00.000Z",
    documentDate: "2026-08-05",
    hospitalName: "Popular Diagnostic Centre",
    testName: "CBC",
    normalizedTestName: "cbc",
    category: "HEMATOLOGY",
    processingStatus,
    verificationStatus:
      processingStatus === "VERIFIED"
        ? "VERIFIED"
        : processingStatus === "NOT_APPLICABLE"
          ? "NOT_APPLICABLE"
          : "PENDING",
    failureCode: null,
  };
}

function reportDetail(status: "NEEDS_REVIEW" | "VERIFIED"): ReportDetailDto {
  return {
    ...document(documentA, patientA, status),
    patientNameOnReport: "Patient A",
    measurements: [
      {
        id: "40000000-0000-4000-8000-000000000004",
        name: "Platelet Count",
        normalizedName: "platelet count",
        textValue: null,
        numericValue: 95000,
        unit: "/µL",
        referenceRange: "150000-450000",
        sourceFlag: "LOW",
        patientCorrected: false,
      },
    ],
  };
}

function verification(): VerifyReportInput {
  return {
    testName: "CBC",
    reportDate: "2026-08-05",
    hospitalName: "Popular Diagnostic Centre",
    category: "HEMATOLOGY",
    measurements: [
      {
        id: "40000000-0000-4000-8000-000000000004",
        name: "Platelet Count",
        normalizedName: "platelet count",
        textValue: null,
        numericValue: 101000,
        unit: "/µL",
        referenceRange: "150000-450000",
        sourceFlag: "LOW",
      },
    ],
  };
}

function page(items: DocumentDto[], query: DocumentListQuery) {
  return { items, page: query.page, pageSize: query.pageSize, total: items.length, totalPages: 1 };
}
