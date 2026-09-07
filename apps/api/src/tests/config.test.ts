import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";

describe("API environment", () => {
  it("defaults to memory/fail-open in development and Redis/fail-closed in production", () => {
    const development = loadConfig(validEnvironment());
    const production = loadConfig({ ...validEnvironment(), NODE_ENV: "production" });
    expect(development.RATE_LIMIT_BACKEND).toBe("memory");
    expect(development.RATE_LIMIT_FAIL_OPEN).toBe(true);
    expect(production.RATE_LIMIT_BACKEND).toBe("redis");
    expect(production.RATE_LIMIT_FAIL_OPEN).toBe(false);
  });

  it("loads a complete hosted development configuration", () => {
    const config = loadConfig(validEnvironment());
    expect(config.DATABASE_URL).toContain("pooler.supabase.test");
    expect(config.REDIS_URL).toContain("redis.example.test");
  });

  it("rejects local Redis by default and permits only an explicit optional override", () => {
    const local = { ...validEnvironment(), REDIS_URL: "redis://default:secret@localhost:6379/0" };
    expect(() => loadConfig(local)).toThrowError(
      "Local Redis is disabled by MEDVAULT_ALLOW_LOCAL_REDIS",
    );
    expect(() => loadConfig({ ...local, MEDVAULT_ALLOW_LOCAL_REDIS: "true" })).not.toThrow();
  });

  it("accepts both hosted Redis URL protocols in development", () => {
    expect(() =>
      loadConfig({
        ...validEnvironment(),
        REDIS_URL: "redis://default:secret@redis.example.test:6379/0",
      }),
    ).not.toThrow();
    expect(() => loadConfig(validEnvironment())).not.toThrow();
  });

  it("requires encrypted Redis in production without exposing credentials", () => {
    const environment = {
      ...validEnvironment(),
      NODE_ENV: "production",
      REDIS_URL: "redis://default:production-secret@redis.example.test:6379/0",
    };
    expect(() => loadConfig(environment)).toThrowError(
      "REDIS_URL must use rediss:// in production",
    );
    try {
      loadConfig(environment);
      throw new Error("Expected production Redis validation to fail");
    } catch (error) {
      expect(String(error)).not.toContain("production-secret");
      expect(String(error)).not.toContain(environment.REDIS_URL);
    }
  });

  it.each([
    "rediss://default:secret@redis.example.test:6380/0?tls=",
    "rediss://default:secret@redis.example.test:6380/0?tls",
  ])("rejects a production Redis TLS query override in %s", (redisUrl) => {
    expect(() =>
      loadConfig({ ...validEnvironment(), NODE_ENV: "production", REDIS_URL: redisUrl }),
    ).toThrowError("REDIS_URL must use rediss:// in production");
  });

  it("reports missing variable names without printing configured secrets", () => {
    const environment = validEnvironment();
    delete environment.SUPABASE_SERVICE_ROLE_KEY;
    environment.SUPABASE_ANON_KEY = "sensitive-anon-value";
    try {
      loadConfig(environment);
      throw new Error("Expected configuration validation to fail");
    } catch (error) {
      expect(String(error)).toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(String(error)).not.toContain("sensitive-anon-value");
    }
  });
});

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "development",
    DATABASE_URL:
      "postgresql://postgres.project-ref:password@aws-0-region.pooler.supabase.test:5432/postgres",
    MEDVAULT_ALLOW_LOCAL_DATABASE: "false",
    REDIS_URL: "rediss://default:password@redis.example.test:6380/0",
    MEDVAULT_ALLOW_LOCAL_REDIS: "false",
    SUPABASE_URL: "https://project.example.test",
    SUPABASE_ANON_KEY: "public-anon-placeholder",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-placeholder",
    SUPABASE_STORAGE_BUCKET: "medical-documents",
  };
}
