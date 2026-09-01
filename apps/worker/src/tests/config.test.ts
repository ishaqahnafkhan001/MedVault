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
});

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/medvault",
    MEDVAULT_ALLOW_LOCAL_DATABASE: "true",
    REDIS_URL: "redis://localhost:6379",
    SUPABASE_URL: "https://project.example.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-placeholder",
    SUPABASE_STORAGE_BUCKET: "medical-documents",
    GEMINI_API_KEY: "",
  };
}
