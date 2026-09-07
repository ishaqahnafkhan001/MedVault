import { describe, expect, it } from "vitest";
import { loadPublicEnvironment } from "./env";

describe("web environment", () => {
  it("accepts localhost API configuration in development", () => {
    expect(loadPublicEnvironment(validEnvironment()).NEXT_PUBLIC_API_URL).toBe(
      "http://localhost:4000",
    );
  });

  it("accepts localhost in a production-mode build when local-app mode is explicit", () => {
    expect(
      loadPublicEnvironment({ ...validEnvironment(), NODE_ENV: "production" }).NEXT_PUBLIC_API_URL,
    ).toBe("http://localhost:4000");
  });

  it("rejects localhost in production when the explicit local-app flag is omitted", () => {
    const environment = validEnvironment();
    delete environment.NEXT_PUBLIC_ALLOW_LOCAL_API;
    expect(() =>
      loadPublicEnvironment({
        ...environment,
        NODE_ENV: "production",
      }),
    ).toThrowError("NEXT_PUBLIC_API_URL must not use localhost");
  });

  it("rejects localhost API configuration when the local-app flag is false", () => {
    expect(() =>
      loadPublicEnvironment({
        ...validEnvironment(),
        NODE_ENV: "production",
        NEXT_PUBLIC_ALLOW_LOCAL_API: "false",
      }),
    ).toThrowError("NEXT_PUBLIC_API_URL must not use localhost");
  });

  it("accepts a hosted HTTPS API in production when the local-app flag is omitted", () => {
    const environment = validEnvironment();
    delete environment.NEXT_PUBLIC_ALLOW_LOCAL_API;
    expect(
      loadPublicEnvironment({
        ...environment,
        NODE_ENV: "production",
        NEXT_PUBLIC_API_URL: "https://api.example.test",
      }).NEXT_PUBLIC_API_URL,
    ).toBe("https://api.example.test");
  });

  it("identifies missing public variables without exposing another value", () => {
    const environment = validEnvironment();
    environment.NEXT_PUBLIC_SUPABASE_URL = undefined;
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sensitive-public-placeholder";
    try {
      loadPublicEnvironment(environment);
      throw new Error("Expected configuration validation to fail");
    } catch (error) {
      expect(String(error)).toContain("NEXT_PUBLIC_SUPABASE_URL");
      expect(String(error)).not.toContain("sensitive-public-placeholder");
    }
  });
});

function validEnvironment(): Record<string, string | undefined> {
  return {
    NODE_ENV: "development",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.example.test",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-placeholder",
    NEXT_PUBLIC_API_URL: "http://localhost:4000",
    NEXT_PUBLIC_ALLOW_LOCAL_API: "true",
  };
}
