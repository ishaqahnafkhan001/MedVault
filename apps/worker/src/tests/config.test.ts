import { describe, expect, it } from "vitest";
import { loadWorkerConfig } from "../config.js";

describe("worker environment", () => {
  it("allows an idle development worker without Gemini", () => {
    expect(loadWorkerConfig(validEnvironment()).GEMINI_API_KEY).toBe("");
  });

  it("requires GEMINI_API_KEY in production without exposing other secrets", () => {
    const environment = validEnvironment();
    environment.NODE_ENV = "production";
    environment.SUPABASE_SERVICE_ROLE_KEY = "sensitive-service-role";
    try {
      loadWorkerConfig(environment);
      throw new Error("Expected configuration validation to fail");
    } catch (error) {
      expect(String(error)).toContain("GEMINI_API_KEY");
      expect(String(error)).not.toContain("sensitive-service-role");
    }
  });

  it("uses hosted PostgreSQL and hosted Redis by default", () => {
    const config = loadWorkerConfig(validEnvironment());
    expect(config.DATABASE_URL).toContain("pooler.supabase.test");
    expect(config.REDIS_URL).toContain("redis.example.test");
  });

  it("rejects local Redis unless optional local tooling is explicitly enabled", () => {
    const local = { ...validEnvironment(), REDIS_URL: "redis://default:secret@localhost:6379/0" };
    expect(() => loadWorkerConfig(local)).toThrowError(
      "Local Redis is disabled by MEDVAULT_ALLOW_LOCAL_REDIS",
    );
    expect(() => loadWorkerConfig({ ...local, MEDVAULT_ALLOW_LOCAL_REDIS: "true" })).not.toThrow();
  });

  it("allows both hosted Redis URL protocols outside production", () => {
    expect(() =>
      loadWorkerConfig({
        ...validEnvironment(),
        NODE_ENV: "test",
        REDIS_URL: "redis://default:test-secret@redis.example.test:6379/0",
      }),
    ).not.toThrow();
    expect(() => loadWorkerConfig(validEnvironment())).not.toThrow();
  });

  it("requires encrypted Redis in production without exposing credentials", () => {
    const environment = {
      ...validEnvironment(),
      NODE_ENV: "production",
      REDIS_URL: "redis://default:production-secret@redis.example.test:6379/0",
      GEMINI_API_KEY: "configured-test-key",
    };
    expect(() => loadWorkerConfig(environment)).toThrowError(
      "REDIS_URL must use rediss:// in production",
    );
    try {
      loadWorkerConfig(environment);
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
      loadWorkerConfig({
        ...validEnvironment(),
        NODE_ENV: "production",
        REDIS_URL: redisUrl,
        GEMINI_API_KEY: "configured-test-key",
      }),
    ).toThrowError("REDIS_URL must use rediss:// in production");
  });

  it("allows encrypted Redis in production", () => {
    expect(() =>
      loadWorkerConfig({
        ...validEnvironment(),
        NODE_ENV: "production",
        GEMINI_API_KEY: "configured-test-key",
      }),
    ).not.toThrow();
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
    SUPABASE_SERVICE_ROLE_KEY: "service-role-placeholder",
    SUPABASE_STORAGE_BUCKET: "medical-documents",
    GEMINI_API_KEY: "",
  };
}
