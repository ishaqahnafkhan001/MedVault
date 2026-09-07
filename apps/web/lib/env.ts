import {
  configurationError,
  isServiceUrl,
  validatePublicApiUrl,
  type EnvironmentIssue,
  type EnvironmentRecord,
} from "@medvault/shared";

export interface PublicEnvironment {
  NODE_ENV: "development" | "test" | "production";
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  NEXT_PUBLIC_API_URL: string;
  NEXT_PUBLIC_ALLOW_LOCAL_API: boolean;
}

export function loadPublicEnvironment(
  environment: EnvironmentRecord = currentPublicEnvironment(),
): PublicEnvironment {
  const issues: EnvironmentIssue[] = [];
  const nodeEnvironment = environment.NODE_ENV ?? "development";
  if (!isNodeEnvironment(nodeEnvironment)) {
    issues.push({ variable: "NODE_ENV", problem: "must be development, test, or production" });
  }

  const supabaseUrl = environment.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!supabaseUrl) {
    issues.push({ variable: "NEXT_PUBLIC_SUPABASE_URL", problem: "is required" });
  } else if (!isServiceUrl(supabaseUrl, ["http", "https"])) {
    issues.push({
      variable: "NEXT_PUBLIC_SUPABASE_URL",
      problem: "must be a valid HTTP(S) URL",
    });
  }

  const anonKey = environment.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  if (!anonKey) {
    issues.push({ variable: "NEXT_PUBLIC_SUPABASE_ANON_KEY", problem: "is required" });
  }

  const apiUrl = environment.NEXT_PUBLIC_API_URL?.trim() ?? "";
  if (!apiUrl) {
    issues.push({ variable: "NEXT_PUBLIC_API_URL", problem: "is required" });
  } else if (!isServiceUrl(apiUrl, ["http", "https"])) {
    issues.push({ variable: "NEXT_PUBLIC_API_URL", problem: "must be a valid HTTP(S) URL" });
  }

  const allowLocalApiSetting =
    environment.NEXT_PUBLIC_ALLOW_LOCAL_API?.trim().toLowerCase() ?? "false";
  if (allowLocalApiSetting !== "true" && allowLocalApiSetting !== "false") {
    issues.push({
      variable: "NEXT_PUBLIC_ALLOW_LOCAL_API",
      problem: 'must be either "true" or "false"',
    });
  }

  if (issues.length) throw configurationError("web", issues);
  const validNodeEnvironment = nodeEnvironment as PublicEnvironment["NODE_ENV"];
  const allowLocalApi = allowLocalApiSetting === "true";
  validatePublicApiUrl(apiUrl, validNodeEnvironment, allowLocalApi);
  return {
    NODE_ENV: validNodeEnvironment,
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    NEXT_PUBLIC_API_URL: apiUrl,
    NEXT_PUBLIC_ALLOW_LOCAL_API: allowLocalApi,
  };
}

export function publicSupabaseUrl(): string {
  return loadPublicEnvironment().NEXT_PUBLIC_SUPABASE_URL;
}

export function publicSupabaseAnonKey(): string {
  return loadPublicEnvironment().NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function publicApiUrl(): string {
  return loadPublicEnvironment().NEXT_PUBLIC_API_URL;
}

function currentPublicEnvironment(): EnvironmentRecord {
  return {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_ALLOW_LOCAL_API: process.env.NEXT_PUBLIC_ALLOW_LOCAL_API,
  };
}

function isNodeEnvironment(value: string): value is PublicEnvironment["NODE_ENV"] {
  return value === "development" || value === "test" || value === "production";
}
