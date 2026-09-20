import * as Sentry from "@sentry/node";
import type { ErrorRequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { AppError } from "../errors.js";

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, next) => {
  void next;
  void request;
  const requestId = response.locals.requestId;
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
  if (error instanceof multer.MulterError) {
    const fileTooLarge = error.code === "LIMIT_FILE_SIZE";
    response.status(fileTooLarge ? 413 : 400).json({
      error: {
        code: fileTooLarge ? "FILE_TOO_LARGE" : "INVALID_UPLOAD",
        message: fileTooLarge
          ? "The selected file is too large."
          : "The document upload is invalid. Choose one file and try again.",
        requestId,
      },
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
