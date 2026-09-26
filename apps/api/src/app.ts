import { randomUUID } from "node:crypto";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit, { type Store } from "express-rate-limit";
import { fileTypeFromBuffer } from "file-type";
import helmet from "helmet";
import multer from "multer";
import { z } from "zod";
import { analysisFilterSchema } from "@medvault/shared";
import {
  documentListQuerySchema,
  documentMetadataSchema,
  patientProfileSchema,
  verifyReportSchema,
  createEpisodeSchema,
  episodeDocumentIdsSchema,
  requestSummarySchema,
  createMedicationSchema,
  updateMedicationSchema,
  createScheduleSchema,
  logIntakeSchema,
  updateDocumentSchema,
} from "@medvault/shared";
import { AppError } from "./errors.js";
import { authenticate } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error-handler.js";
import type { AppService, AuthVerifier } from "./types.js";

export interface CreateAppOptions {
  authVerifier: AuthVerifier;
  service: AppService;
  webOrigin: string;
  maxUploadBytes: number;
  rateLimitWindowMs?: number;
  rateLimitMax?: number;
  rateLimitStore?: Store;
  rateLimitPassOnStoreError?: boolean;
  signedUrlTtlSeconds?: number;
}

const idSchema = z.uuid();
const requestIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9._:-]+$/)
  .max(100);
const allowedMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export function createApp(options: CreateAppOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use((request, response, next) => {
    const candidate = request.header("x-request-id");
    const parsedRequestId = requestIdSchema.safeParse(candidate);
    const requestId = parsedRequestId.success ? parsedRequestId.data : randomUUID();
    response.locals.requestId = requestId;
    response.setHeader("x-request-id", requestId);
    next();
  });
  app.use(
    cors({
      origin: options.webOrigin,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );
  app.get("/", (_request, response) => {
    response.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>MedVault API</title>
  </head>
  <body>
    <main>
      <h1>MedVault API is running</h1>
      <p>The backend process is running.</p>
      <p><a href="/health">View process liveness</a></p>
      <p><a href="/ready">View dependency readiness</a></p>
    </main>
  </body>
</html>`);
  });
  app.get("/health", (_request, response) => response.json({ status: "ok" }));
  app.get(
    "/ready",
    asyncRoute(async (_request, response) => {
      await options.service.checkHealth();
      response.json({ status: "ready" });
    }),
  );
  app.use(
    rateLimit({
      windowMs: options.rateLimitWindowMs ?? 60_000,
      limit: options.rateLimitMax ?? 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      ...(options.rateLimitStore ? { store: options.rateLimitStore } : {}),
      passOnStoreError: options.rateLimitPassOnStoreError ?? false,
      handler: (_request, response) => {
        response.status(429).json({
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests. Please wait and try again.",
            requestId: response.locals.requestId,
          },
        });
      },
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use("/v1", authenticate(options.authVerifier));

  app.get(
    "/v1/profile",
    asyncRoute(async (_request, response) => {
      response.json({ profile: await options.service.getProfile(response.locals.auth.id) });
    }),
  );
  app.put(
    "/v1/profile",
    asyncRoute(async (request, response) => {
      const input = patientProfileSchema.parse(request.body);
      response.json({
        profile: await options.service.updateProfile(response.locals.auth.id, input),
      });
    }),
  );

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: options.maxUploadBytes, files: 1 },
  });
  app.post(
    "/v1/documents",
    upload.single("file"),
    asyncRoute(async (request, response) => {
      if (!request.file)
        throw new AppError(400, "FILE_REQUIRED", "Choose a medical document to upload.");
      const metadata = parseMetadata((request.body as { metadata?: unknown }).metadata);
      const detected = await fileTypeFromBuffer(request.file.buffer);
      if (!detected || !allowedMimeTypes.has(detected.mime)) {
        throw new AppError(415, "UNSUPPORTED_FILE", "Upload a PDF, JPEG, PNG, or WebP file.");
      }
      const document = await options.service.createDocument(
        response.locals.auth.id,
        {
          bytes: request.file.buffer,
          originalFilename: request.file.originalname,
          detectedMimeType: detected.mime as
            "application/pdf" | "image/jpeg" | "image/png" | "image/webp",
        },
        metadata,
        response.locals.requestId,
      );
      response.status(201).json({ document });
    }),
  );

  app.get(
    "/v1/documents",
    asyncRoute(async (request, response) => {
      const query = documentListQuerySchema.parse(request.query);
      response.json(await options.service.listDocuments(response.locals.auth.id, query));
    }),
  );
  app.get(
    "/v1/documents/:id",
    asyncRoute(async (request, response) => {
      response.json({
        document: await options.service.getDocument(
          response.locals.auth.id,
          parseId(request.params.id),
        ),
      });
    }),
  );
  app.patch(
    "/v1/documents/:id",
    asyncRoute(async (request, response) => {
      const input = updateDocumentSchema.parse(request.body);
      const document = await options.service.updateDocument(
        response.locals.auth.id,
        parseId(request.params.id),
        input,
      );
      response.json({ document });
    }),
  );
  app.get(
    "/v1/documents/:id/file",
    asyncRoute(async (request, response) => {
      response.setHeader("cache-control", "private, no-store");
      response.json({
        url: await options.service.getFileUrl(response.locals.auth.id, parseId(request.params.id)),
        expiresInSeconds: options.signedUrlTtlSeconds ?? 300,
      });
    }),
  );
  app.delete(
    "/v1/documents/:id",
    asyncRoute(async (request, response) => {
      await options.service.deleteDocument(response.locals.auth.id, parseId(request.params.id));
      response.status(204).send();
    }),
  );

  app.get(
    "/v1/reports/latest",
    asyncRoute(async (_request, response) => {
      response.json({ reports: await options.service.latestReports(response.locals.auth.id) });
    }),
  );
  app.get(
    "/v1/reports",
    asyncRoute(async (request, response) => {
      const query = documentListQuerySchema.parse(request.query);
      response.json(await options.service.listReports(response.locals.auth.id, query));
    }),
  );
  app.get(
    "/v1/reports/:id",
    asyncRoute(async (request, response) => {
      response.json({
        report: await options.service.getReport(
          response.locals.auth.id,
          parseId(request.params.id),
        ),
      });
    }),
  );
  app.put(
    "/v1/reports/:id/verify",
    asyncRoute(async (request, response) => {
      const input = verifyReportSchema.parse(request.body);
      response.json({
        report: await options.service.verifyReport(
          response.locals.auth.id,
          parseId(request.params.id),
          input,
        ),
      });
    }),
  );
  app.post(
    "/v1/reports/:id/retry",
    asyncRoute(async (request, response) => {
      response.status(202).json({
        document: await options.service.retryReport(
          response.locals.auth.id,
          parseId(request.params.id),
          response.locals.requestId,
        ),
      });
    }),
  );
  app.post(
    "/v1/reports/:id/cancel",
    asyncRoute(async (request, response) => {
      response.status(200).json({
        document: await options.service.cancelReport(
          response.locals.auth.id,
          parseId(request.params.id),
        ),
      });
    }),
  );
  app.get(
    "/v1/dashboard",
    asyncRoute(async (_request, response) => {
      response.json(await options.service.getDashboard(response.locals.auth.id));
    }),
  );
  app.get(
    "/v1/measurements/history",
    asyncRoute(async (request, response) => {
      const filter = analysisFilterSchema.parse(request.query);
      response.json({
        history: await options.service.getMeasurementHistory(response.locals.auth.id, filter),
      });
    }),
  );

  app.post(
    "/v1/episodes",
    asyncRoute(async (request, response) => {
      const input = createEpisodeSchema.parse(request.body);
      const episode = await options.service.createEpisode(response.locals.auth.id, input);
      response.status(201).json({ episode });
    }),
  );
  app.get(
    "/v1/episodes",
    asyncRoute(async (_request, response) => {
      const episodes = await options.service.listEpisodes(response.locals.auth.id);
      response.json({ episodes });
    }),
  );
  app.get(
    "/v1/episodes/:id",
    asyncRoute(async (request, response) => {
      const episode = await options.service.getEpisode(
        response.locals.auth.id,
        parseId(request.params.id),
      );
      response.json({ episode });
    }),
  );
  app.post(
    "/v1/episodes/:id/documents",
    asyncRoute(async (request, response) => {
      const input = episodeDocumentIdsSchema.parse(request.body);
      const result = await options.service.addDocumentsToEpisode(
        response.locals.auth.id,
        parseId(request.params.id),
        input.documentIds,
      );
      response.json(result);
    }),
  );
  app.delete(
    "/v1/episodes/:id/documents/:documentId",
    asyncRoute(async (request, response) => {
      const episode = await options.service.removeDocumentFromEpisode(
        response.locals.auth.id,
        parseId(request.params.id),
        parseId(request.params.documentId),
      );
      response.json({ episode });
    }),
  );
  app.delete(
    "/v1/episodes/:id",
    asyncRoute(async (request, response) => {
      await options.service.deleteEpisode(response.locals.auth.id, parseId(request.params.id));
      response.status(204).send();
    }),
  );

  app.put(
    "/v1/episodes/:id",
    asyncRoute(async (request, response) => {
      const input = createEpisodeSchema.parse(request.body);
      const episode = await options.service.updateEpisode(
        response.locals.auth.id,
        parseId(request.params.id),
        input,
      );
      response.json({ episode });
    }),
  );

  app.get(
    "/v1/episodes/:id/trend",
    asyncRoute(async (request, response) => {
      const trend = await options.service.getEpisodeTrend(
        response.locals.auth.id,
        parseId(request.params.id),
        analysisFilterSchema.parse(request.query),
      );
      response.json({ trend });
    }),
  );

  app.post(
    "/v1/episodes/:id/summary",
    asyncRoute(async (request, response) => {
      const input = requestSummarySchema.parse(request.body);
      const analysis = await options.service.requestEpisodeSummary(
        response.locals.auth.id,
        parseId(request.params.id),
        input,
      );
      response.status(202).json({ analysis });
    }),
  );

  app.get(
    "/v1/episodes/:id/analyses/:analysisId",
    asyncRoute(async (request, response) => {
      const analysis = await options.service.getEpisodeAnalysis(
        response.locals.auth.id,
        parseId(request.params.id),
        parseId(request.params.analysisId),
      );
      response.json({ analysis });
    }),
  );

  // ── Medications ─────────────────────────────────────────────────────────────
  app.get(
    "/v1/reports/:id/summary",
    asyncRoute(async (request, response) => {
      response.json({
        analysis: await options.service.getReportSummary(
          response.locals.auth.id,
          parseId(request.params.id),
        ),
      });
    }),
  );
  app.post(
    "/v1/reports/:id/summary",
    asyncRoute(async (request, response) => {
      const input = requestSummarySchema.parse(request.body);
      response.status(202).json({
        analysis: await options.service.requestReportSummary(
          response.locals.auth.id,
          parseId(request.params.id),
          input,
        ),
      });
    }),
  );

  app.post(
    "/v1/medications",
    asyncRoute(async (request, response) => {
      const input = createMedicationSchema.parse(request.body);
      const medication = await options.service.createMedication(response.locals.auth.id, input);
      response.status(201).json({ medication });
    }),
  );

  app.get(
    "/v1/medications",
    asyncRoute(async (_request, response) => {
      const medications = await options.service.listMedications(response.locals.auth.id);
      response.json({ medications });
    }),
  );

  app.get(
    "/v1/medications/:id",
    asyncRoute(async (request, response) => {
      const medication = await options.service.getMedication(
        response.locals.auth.id,
        parseId(request.params.id),
      );
      response.json({ medication });
    }),
  );

  app.put(
    "/v1/medications/:id",
    asyncRoute(async (request, response) => {
      const input = updateMedicationSchema.parse(request.body);
      const medication = await options.service.updateMedication(
        response.locals.auth.id,
        parseId(request.params.id),
        input,
      );
      response.json({ medication });
    }),
  );

  app.delete(
    "/v1/medications/:id",
    asyncRoute(async (request, response) => {
      await options.service.archiveMedication(response.locals.auth.id, parseId(request.params.id));
      response.status(204).send();
    }),
  );

  // ── Schedules & Occurrences ─────────────────────────────────────────────────

  app.post(
    "/v1/medications/:medicationId/schedules",
    asyncRoute(async (request, response) => {
      const input = createScheduleSchema.parse(request.body);
      const schedule = await options.service.createSchedule(
        response.locals.auth.id,
        parseId(request.params.medicationId),
        input,
      );
      response.status(201).json({ schedule });
    }),
  );

  app.get(
    "/v1/medications/:medicationId/schedules",
    asyncRoute(async (request, response) => {
      const schedules = await options.service.listSchedules(
        response.locals.auth.id,
        parseId(request.params.medicationId),
      );
      response.json({ schedules });
    }),
  );

  app.delete(
    "/v1/medications/:medicationId/schedules/:scheduleId",
    asyncRoute(async (request, response) => {
      const schedule = await options.service.deactivateSchedule(
        response.locals.auth.id,
        parseId(request.params.medicationId),
        parseId(request.params.scheduleId),
      );
      response.json({ schedule });
    }),
  );

  app.get(
    "/v1/medications/:medicationId/occurrences",
    asyncRoute(async (request, response) => {
      const { from, to } = request.query;
      if (typeof from !== "string" || typeof to !== "string") {
        throw new AppError(400, "INVALID_QUERY", "from and to dates are required.");
      }
      const occurrences = await options.service.listOccurrences(
        response.locals.auth.id,
        parseId(request.params.medicationId),
        new Date(from),
        new Date(to),
      );
      response.json({ occurrences });
    }),
  );

  app.post(
    "/v1/occurrences/:occurrenceId/intake",
    asyncRoute(async (request, response) => {
      const input = logIntakeSchema.parse(request.body);
      const occurrence = await options.service.logIntake(
        response.locals.auth.id,
        parseId(request.params.occurrenceId),
        input,
      );
      response.json({ occurrence });
    }),
  );

  app.use((_request, _response, next) =>
    next(new AppError(404, "ROUTE_NOT_FOUND", "The requested endpoint does not exist.")),
  );
  app.use(errorHandler);
  return app;
}

function parseMetadata(value: unknown) {
  if (typeof value !== "string")
    throw new AppError(400, "METADATA_REQUIRED", "Document details are required.");
  try {
    return documentMetadataSchema.parse(JSON.parse(value));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new AppError(400, "INVALID_METADATA", "Document details are invalid.");
    throw error;
  }
}

function parseId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    throw new AppError(400, "INVALID_ID", "The resource identifier is invalid.");
  }
  return idSchema.parse(value);
}

function asyncRoute(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<unknown>,
) {
  return (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next);
  };
}
