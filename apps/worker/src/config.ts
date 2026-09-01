import { isServiceUrl, validateDatabaseEnvironment } from "@medvault/shared";
import { z } from "zod";

const serviceUrl = (protocols: readonly string[], description: string) =>
  z
    .string()
    .trim()
    .min(1)
    .refine((value) => isServiceUrl(value, protocols), {
      message: `must be a valid ${description} URL`,
    });

const workerConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  MEDVAULT_ALLOW_LOCAL_DATABASE: z.enum(["true", "false"]).default("false"),
  REDIS_URL: serviceUrl(["redis", "rediss"], "Redis"),
  SUPABASE_URL: serviceUrl(["http", "https"], "Supabase HTTP(S)"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("medical-documents"),
  GEMINI_API_KEY: z.string().default(""),
  GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  REPORT_QUEUE_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
  NEXT_PUBLIC_API_URL: serviceUrl(["http", "https"], "HTTP(S)").optional(),
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().default("development"),
});

export type WorkerConfig = z.infer<typeof workerConfigSchema>;

export function loadWorkerConfig(environment: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const result = workerConfigSchema.safeParse(environment);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join(".") || "environment"} ${issue.message}`,
    );
    throw new Error(`Invalid worker environment: ${issues.join("; ")}.`);
  }
  validateDatabaseEnvironment(
    {
      DATABASE_URL: result.data.DATABASE_URL,
      MEDVAULT_ALLOW_LOCAL_DATABASE: result.data.MEDVAULT_ALLOW_LOCAL_DATABASE,
    },
    "worker",
  );
  if (result.data.NODE_ENV === "production" && !result.data.GEMINI_API_KEY) {
    throw new Error("Invalid worker environment: GEMINI_API_KEY is required in production.");
  }
  return result.data;
}
