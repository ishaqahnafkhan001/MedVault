import { describe, expect, it } from "vitest";
import {
  classifyServiceUrl,
  describeEnvironmentTopology,
  formatEnvironmentTopology,
  validateDatabaseEnvironment,
  validatePublicApiUrl,
  validateRedisEnvironment,
} from "./environment.js";

const localDatabase = "postgresql://local-user:local-password@127.0.0.1:5432/medvault";
const remoteDatabase = "postgresql://remote-user:remote-password@db.example.test:5432/medvault";
const localRedis = "redis://default:local-secret@127.0.0.1:6379/0";
const remoteRedis = "rediss://default:remote-secret@redis.example.test:6380/0";

describe("database location policy", () => {
  it("allows an intentional local database", () => {
    expect(() =>
      validateDatabaseEnvironment(
        { DATABASE_URL: localDatabase, MEDVAULT_ALLOW_LOCAL_DATABASE: "true" },
        "test",
      ),
    ).not.toThrow();
  });

  it("rejects a forbidden local database without exposing the URL", () => {
    expect(() =>
      validateDatabaseEnvironment(
        { DATABASE_URL: localDatabase, MEDVAULT_ALLOW_LOCAL_DATABASE: "false" },
        "test",
      ),
    ).toThrowError("Local PostgreSQL is disabled by MEDVAULT_ALLOW_LOCAL_DATABASE");
    try {
      validateDatabaseEnvironment(
        { DATABASE_URL: localDatabase, MEDVAULT_ALLOW_LOCAL_DATABASE: "false" },
        "test",
      );
    } catch (error) {
      expect(String(error)).not.toContain("local-password");
    }
  });

  it("allows a remote database when local use is forbidden", () => {
    expect(() =>
      validateDatabaseEnvironment(
        { DATABASE_URL: remoteDatabase, MEDVAULT_ALLOW_LOCAL_DATABASE: "false" },
        "test",
      ),
    ).not.toThrow();
  });

  it.each([
    "postgresql://user:password@localhost:5432/db",
    "postgresql://user:password@127.42.0.1:5432/db",
    "postgresql://user:password@[::1]:5432/db",
    "postgresql://user:password@host.docker.internal:5432/db",
    "postgresql://user:password@postgres:5432/db",
  ])("classifies %s as local", (url) => {
    expect(classifyServiceUrl(url)).toBe("local");
  });
});

describe("Redis location policy", () => {
  it.each([
    "redis://default:secret@localhost:6379/0",
    "redis://default:secret@127.42.0.1:6379/0",
    "redis://default:secret@[::1]:6379/0",
    "redis://default:secret@host.docker.internal:6379/0",
    "redis://default:secret@redis:6379/0",
  ])("rejects local target %s unless explicitly allowed", (redisUrl) => {
    expect(() =>
      validateRedisEnvironment({ REDIS_URL: redisUrl }, "test", "development"),
    ).toThrowError("Local Redis is disabled by MEDVAULT_ALLOW_LOCAL_REDIS");
  });

  it("allows an intentional local Redis override", () => {
    expect(() =>
      validateRedisEnvironment(
        { REDIS_URL: localRedis, MEDVAULT_ALLOW_LOCAL_REDIS: "true" },
        "test",
        "development",
      ),
    ).not.toThrow();
  });

  it.each([
    ["development", "redis://default:remote-secret@redis.example.test:6379/0"],
    ["development", remoteRedis],
    ["test", "redis://default:remote-secret@redis.example.test:6379/0"],
    ["test", remoteRedis],
  ] as const)("allows %s Redis URL %s", (nodeEnvironment, redisUrl) => {
    expect(() =>
      validateRedisEnvironment({ REDIS_URL: redisUrl }, "test", nodeEnvironment),
    ).not.toThrow();
  });

  it("allows encrypted Redis in production", () => {
    expect(() =>
      validateRedisEnvironment({ REDIS_URL: remoteRedis }, "test", "production"),
    ).not.toThrow();
  });

  it.each([
    "redis://default:production-secret@redis.example.test:6379/0",
    "redis://default:production-secret@redis.example.test:6379/0?tls=true",
    "REDISS://default:production-secret@redis.example.test:6380/0",
    "rediss://default:production-secret@redis.example.test:6380/0?tls=",
    "rediss://default:production-secret@redis.example.test:6380/0?tls",
  ])("rejects noncanonical or plaintext production Redis URL %s", (redisUrl) => {
    expect(() =>
      validateRedisEnvironment(
        { REDIS_URL: redisUrl, MEDVAULT_ALLOW_LOCAL_REDIS: "true" },
        "test",
        "production",
      ),
    ).toThrowError("REDIS_URL must use rediss:// in production");
  });

  it("does not expose Redis credentials in the production TLS error", () => {
    const redisUrl = "redis://default:production-secret@redis.example.test:6379/0";
    try {
      validateRedisEnvironment({ REDIS_URL: redisUrl }, "test", "production");
      throw new Error("Expected production Redis validation to fail");
    } catch (error) {
      expect(String(error)).toContain("REDIS_URL must use rediss:// in production");
      expect(String(error)).not.toContain("production-secret");
      expect(String(error)).not.toContain(redisUrl);
    }
  });

  it("rejects an invalid override without exposing Redis credentials", () => {
    expect(() =>
      validateRedisEnvironment(
        { REDIS_URL: remoteRedis, MEDVAULT_ALLOW_LOCAL_REDIS: "sometimes" },
        "test",
        "development",
      ),
    ).toThrowError('MEDVAULT_ALLOW_LOCAL_REDIS must be either "true" or "false"');
    try {
      validateRedisEnvironment({ REDIS_URL: localRedis }, "test", "development");
    } catch (error) {
      expect(String(error)).not.toContain("local-secret");
    }
  });
});

describe("public API production policy", () => {
  it("allows a development localhost API", () => {
    expect(() => validatePublicApiUrl("http://localhost:4000", "development")).not.toThrow();
  });

  it("rejects a production localhost API", () => {
    expect(() => validatePublicApiUrl("http://localhost:4000", "production")).toThrowError(
      "NEXT_PUBLIC_API_URL must not use localhost",
    );
  });

  it("allows an explicitly local production-mode build for the local application", () => {
    expect(() => validatePublicApiUrl("http://localhost:4000", "production", true)).not.toThrow();
  });
});

describe("safe topology diagnostics", () => {
  it("reports classifications and Redis host without secret URL material", () => {
    const output = formatEnvironmentTopology(
      describeEnvironmentTopology({
        databaseUrl: remoteDatabase,
        redisUrl: "rediss://redis-user:redis-password@redis.example.test:6380/3?tls=true",
        supabaseConfigured: true,
        geminiConfigured: true,
        apiUrl: "https://api.example.test/v1",
      }),
    );
    expect(output).toContain("database=remote");
    expect(output).toContain("redis=remote (host=redis.example.test)");
    expect(output).toContain("api=remote");
    expect(output).not.toContain("remote-password");
    expect(output).not.toContain("redis-password");
    expect(output).not.toContain("tls=true");
  });
});
