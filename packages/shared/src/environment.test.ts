import { describe, expect, it } from "vitest";
import {
  classifyServiceUrl,
  describeEnvironmentTopology,
  formatEnvironmentTopology,
  validateDatabaseEnvironment,
  validatePublicApiUrl,
} from "./environment.js";

const localDatabase = "postgresql://local-user:local-password@127.0.0.1:5432/medvault";
const remoteDatabase = "postgresql://remote-user:remote-password@db.example.test:5432/medvault";

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

describe("public API production policy", () => {
  it("allows a development localhost API", () => {
    expect(() => validatePublicApiUrl("http://localhost:4000", "development")).not.toThrow();
  });

  it("rejects a production localhost API", () => {
    expect(() => validatePublicApiUrl("http://localhost:4000", "production")).toThrowError(
      "NEXT_PUBLIC_API_URL must not use localhost",
    );
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
