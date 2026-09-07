export type EnvironmentLocation = "local" | "remote" | "not-configured";
export type EnvironmentRecord = Readonly<Record<string, string | undefined>>;

export interface EnvironmentIssue {
  variable: string;
  problem: string;
}

export interface SafeEnvironmentTopology {
  database: EnvironmentLocation;
  redis: EnvironmentLocation;
  redisHost: string | null;
  supabase: "configured" | "not-configured";
  gemini: "configured" | "not-configured";
  api: EnvironmentLocation;
}

const localHostnames = new Set([
  "localhost",
  "0.0.0.0",
  "::",
  "::1",
  "host.docker.internal",
  "gateway.docker.internal",
  "docker.for.win.localhost",
  "postgres",
  "redis",
]);

export function configurationError(scope: string, issues: readonly EnvironmentIssue[]): Error {
  const unique = [...new Map(issues.map((issue) => [issue.variable, issue])).values()];
  const details = unique.map(({ variable, problem }) => `${variable} ${problem}`).join("; ");
  return new Error(`Invalid ${scope} environment: ${details}.`);
}

export function isServiceUrl(value: string, protocols: readonly string[]): boolean {
  try {
    return protocols.includes(new URL(value).protocol.replace(/:$/, ""));
  } catch {
    return false;
  }
}

export function isLocalHostname(hostname: string): boolean {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (localHostnames.has(normalized) || normalized.endsWith(".localhost")) return true;
  const ipv4 = normalized.split(".");
  return ipv4.length === 4 && ipv4[0] === "127" && ipv4.every(isIpv4Part);
}

export function classifyServiceUrl(value: string | undefined): EnvironmentLocation {
  if (!value) return "not-configured";
  try {
    return isLocalHostname(new URL(value).hostname) ? "local" : "remote";
  } catch {
    return "not-configured";
  }
}

export function safeUrlHost(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

export function validateDatabaseEnvironment(
  environment: EnvironmentRecord,
  scope: string,
): { databaseUrl: string; allowLocalDatabase: boolean } {
  const issues: EnvironmentIssue[] = [];
  const databaseUrl = environment.DATABASE_URL?.trim() ?? "";
  if (!databaseUrl) {
    issues.push({ variable: "DATABASE_URL", problem: "is required" });
  } else if (!isServiceUrl(databaseUrl, ["postgres", "postgresql"])) {
    issues.push({ variable: "DATABASE_URL", problem: "must be a valid PostgreSQL URL" });
  }

  const allowSetting = environment.MEDVAULT_ALLOW_LOCAL_DATABASE?.trim().toLowerCase() ?? "false";
  if (allowSetting !== "true" && allowSetting !== "false") {
    issues.push({
      variable: "MEDVAULT_ALLOW_LOCAL_DATABASE",
      problem: 'must be either "true" or "false"',
    });
  }
  if (issues.length) throw configurationError(scope, issues);

  const allowLocalDatabase = allowSetting === "true";
  assertDatabaseLocationAllowed(databaseUrl, allowLocalDatabase);
  return { databaseUrl, allowLocalDatabase };
}

export function validateRedisEnvironment(
  environment: EnvironmentRecord,
  scope: string,
  nodeEnvironment: "development" | "test" | "production",
): { redisUrl: string; allowLocalRedis: boolean } {
  const issues: EnvironmentIssue[] = [];
  const redisUrl = environment.REDIS_URL?.trim() ?? "";
  if (!redisUrl) {
    issues.push({ variable: "REDIS_URL", problem: "is required" });
  } else if (!isServiceUrl(redisUrl, ["redis", "rediss"])) {
    issues.push({ variable: "REDIS_URL", problem: "must be a valid Redis URL" });
  } else if (nodeEnvironment === "production" && !isEncryptedRedisUrl(redisUrl)) {
    issues.push({ variable: "REDIS_URL", problem: "must use rediss:// in production" });
  }

  const allowSetting = environment.MEDVAULT_ALLOW_LOCAL_REDIS?.trim().toLowerCase() ?? "false";
  if (allowSetting !== "true" && allowSetting !== "false") {
    issues.push({
      variable: "MEDVAULT_ALLOW_LOCAL_REDIS",
      problem: 'must be either "true" or "false"',
    });
  }
  if (issues.length) throw configurationError(scope, issues);

  const allowLocalRedis = allowSetting === "true";
  assertRedisLocationAllowed(redisUrl, allowLocalRedis);
  return { redisUrl, allowLocalRedis };
}

export function assertDatabaseLocationAllowed(
  databaseUrl: string,
  allowLocalDatabase: boolean,
): void {
  if (!allowLocalDatabase && classifyServiceUrl(databaseUrl) === "local") {
    throw new Error(
      "Local PostgreSQL is disabled by MEDVAULT_ALLOW_LOCAL_DATABASE. Set it to true only for an intentional local development database.",
    );
  }
}

export function assertRedisLocationAllowed(redisUrl: string, allowLocalRedis: boolean): void {
  if (!allowLocalRedis && classifyServiceUrl(redisUrl) === "local") {
    throw new Error(
      "Local Redis is disabled by MEDVAULT_ALLOW_LOCAL_REDIS. Set it to true only for intentional optional local tooling.",
    );
  }
}

export function validatePublicApiUrl(
  apiUrl: string,
  nodeEnvironment: "development" | "test" | "production",
  allowLocalApi = false,
): void {
  if (!isServiceUrl(apiUrl, ["http", "https"])) {
    throw configurationError("web", [
      { variable: "NEXT_PUBLIC_API_URL", problem: "must be a valid HTTP(S) URL" },
    ]);
  }
  if (
    nodeEnvironment === "production" &&
    classifyServiceUrl(apiUrl) === "local" &&
    !allowLocalApi
  ) {
    throw new Error(
      "NEXT_PUBLIC_API_URL must not use localhost in a deployed build. Set NEXT_PUBLIC_ALLOW_LOCAL_API=true only for the local-application development architecture.",
    );
  }
}

export function describeEnvironmentTopology(input: {
  databaseUrl?: string | undefined;
  redisUrl?: string | undefined;
  supabaseConfigured: boolean;
  geminiConfigured: boolean;
  apiUrl?: string | undefined;
}): SafeEnvironmentTopology {
  return {
    database: classifyServiceUrl(input.databaseUrl),
    redis: classifyServiceUrl(input.redisUrl),
    redisHost: safeUrlHost(input.redisUrl),
    supabase: input.supabaseConfigured ? "configured" : "not-configured",
    gemini: input.geminiConfigured ? "configured" : "not-configured",
    api: classifyServiceUrl(input.apiUrl),
  };
}

export function formatEnvironmentTopology(topology: SafeEnvironmentTopology): string {
  const redisHost = topology.redisHost ? ` (host=${topology.redisHost})` : "";
  return [
    `database=${topology.database}`,
    `redis=${topology.redis}${redisHost}`,
    `supabase=${topology.supabase}`,
    `gemini=${topology.gemini}`,
    `api=${topology.api}`,
  ].join("; ");
}

function isIpv4Part(value: string): boolean {
  if (!/^\d{1,3}$/.test(value)) return false;
  const number = Number(value);
  return number >= 0 && number <= 255;
}

function isEncryptedRedisUrl(value: string): boolean {
  if (!value.startsWith("rediss://")) return false;
  try {
    return !new URL(value).searchParams.has("tls");
  } catch {
    return false;
  }
}
