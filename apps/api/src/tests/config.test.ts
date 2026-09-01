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

  it("loads a complete local development configuration when explicitly allowed", () => {
    expect(loadConfig(validEnvironment()).DATABASE_URL).toContain("localhost");
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
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/medvault",
    MEDVAULT_ALLOW_LOCAL_DATABASE: "true",
    REDIS_URL: "redis://localhost:6379",
    SUPABASE_URL: "https://project.example.test",
    SUPABASE_ANON_KEY: "public-anon-placeholder",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-placeholder",
    SUPABASE_STORAGE_BUCKET: "medical-documents",
  };
}
