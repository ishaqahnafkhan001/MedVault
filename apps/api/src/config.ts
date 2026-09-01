import { z } from "zod";
import { isServiceUrl, validateDatabaseEnvironment } from "@medvault/shared";

const serviceUrl = (protocols: readonly string[], description: string) =>
  z
    .string()
    .trim()
    .min(1)
    .refine((value) => isServiceUrl(value, protocols), {
      message: `must be a valid ${description} URL`,
    });

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: serviceUrl(["http", "https"], "HTTP(S)").default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  MEDVAULT_ALLOW_LOCAL_DATABASE: z.enum(["true", "false"]).default("false"),
  REDIS_URL: serviceUrl(["redis", "rediss"], "Redis"),
  SUPABASE_URL: serviceUrl(["http", "https"], "Supabase HTTP(S)"),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("medical-documents"),
  NEXT_PUBLIC_API_URL: serviceUrl(["http", "https"], "HTTP(S)").optional(),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 1024 * 1024),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_BACKEND: z.enum(["memory", "redis"]).optional(),
  RATE_LIMIT_FAIL_OPEN: z.enum(["true", "false"]).optional(),
  REPORT_STALE_AFTER_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .default(15 * 60),
  REPORT_RECONCILE_INTERVAL_SECONDS: z.coerce.number().int().min(10).default(60),
  REPORT_RECONCILE_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(100),
  REPORT_MAX_PROCESSING_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(8),
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().default("development"),
});

type ParsedApiConfig = z.infer<typeof configSchema>;
export type ApiConfig = Omit<ParsedApiConfig, "RATE_LIMIT_BACKEND" | "RATE_LIMIT_FAIL_OPEN"> & {
  RATE_LIMIT_BACKEND: "memory" | "redis";
  RATE_LIMIT_FAIL_OPEN: boolean;
};

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  const result = configSchema.safeParse(environment);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join(".") || "environment"} ${issue.message}`,
    );
    throw new Error(`Invalid API environment: ${issues.join("; ")}.`);
  }
  validateDatabaseEnvironment(
    {
      DATABASE_URL: result.data.DATABASE_URL,
      MEDVAULT_ALLOW_LOCAL_DATABASE: result.data.MEDVAULT_ALLOW_LOCAL_DATABASE,
    },
    "API",
  );
  return {
    ...result.data,
    RATE_LIMIT_BACKEND:
      result.data.RATE_LIMIT_BACKEND ??
      (result.data.NODE_ENV === "production" ? "redis" : "memory"),
    RATE_LIMIT_FAIL_OPEN:
      result.data.RATE_LIMIT_FAIL_OPEN === undefined
        ? result.data.NODE_ENV !== "production"
        : result.data.RATE_LIMIT_FAIL_OPEN === "true",
  };
}
