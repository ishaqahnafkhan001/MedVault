import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { fileTypeFromBuffer } from "file-type";
import helmet from "helmet";
import multer from "multer";
import { z } from "zod";
import {
  documentListQuerySchema,
  documentMetadataSchema,
  patientProfileSchema,
  verifyReportSchema,
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
  signedUrlTtlSeconds?: number;
}

const idSchema = z.uuid();
const allowedMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export function createApp(options: CreateAppOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(
    cors({
      origin: options.webOrigin,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE"],
    }),
  );
  app.use(
    rateLimit({
      windowMs: options.rateLimitWindowMs ?? 60_000,
      limit: options.rateLimitMax ?? 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error: { code: "RATE_LIMITED", message: "Too many requests. Please wait and try again." },
      },
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => response.json({ status: "ok" }));
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
  app.get(
    "/v1/documents/:id/file",
    asyncRoute(async (request, response) => {
      response.json({
        url: await options.service.getFileUrl(response.locals.auth.id, parseId(request.params.id)),
        expiresInSeconds: options.signedUrlTtlSeconds ?? 300,
      });
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
