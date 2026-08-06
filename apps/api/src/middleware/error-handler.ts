import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/node";
import type { ErrorRequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { AppError } from "../errors.js";

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, next) => {
  void next;
  const requestId = request.header("x-request-id") ?? randomUUID();
  response.setHeader("x-request-id", requestId);

  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Some submitted information is invalid.",
        requestId,
        fieldErrors: error.flatten().fieldErrors,
      },
    });
    return;
  }
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    response.status(413).json({
      error: { code: "FILE_TOO_LARGE", message: "The selected file is too large.", requestId },
    });
    return;
  }
  if (error instanceof AppError) {
    response.status(error.status).json({
      error: { code: error.code, message: error.message, requestId, fieldErrors: error.details },
    });
    return;
  }

  // Report only a synthetic error so exception text can never leak medical data.
  Sentry.captureMessage("Unhandled MedVault API error", "error");
  response.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again.",
      requestId,
    },
  });
};
