import { describe, expect, it } from "vitest";
import { patientProfileSchema, type PatientProfileDto } from "@medvault/shared";
import { toProfileInput, sanitizeProfileInput, emptyProfileInput } from "./profile-form";

describe("Profile form data transformations", () => {
  const mockDto: PatientProfileDto = {
    patientId: "00000000-0000-4000-8000-000000000001",
    completed: true,
    fullName: "Jane Doe",
    dateOfBirth: "1990-05-15",
    gender: "Female",
    bloodGroup: "O+",
    allergies: ["Penicillin", "Dust"],
    chronicConditions: ["Asthma"],
    emergencyContactName: "John Doe",
    emergencyContactPhone: "+1234567890",
    emergencyContactRelation: "Spouse",
  };

  it("strips patientId and completed from PatientProfileDto", () => {
    const input = toProfileInput(mockDto);
    expect(input).not.toHaveProperty("patientId");
    expect(input).not.toHaveProperty("completed");
    expect(input.fullName).toBe("Jane Doe");
    expect(input.dateOfBirth).toBe("1990-05-15");
    expect(input.bloodGroup).toBe("O+");
    expect(input.allergies).toEqual(["Penicillin", "Dust"]);
  });

  it("handles null/undefined DTO gracefully", () => {
    expect(toProfileInput(null)).toEqual(emptyProfileInput);
    expect(toProfileInput(undefined)).toEqual(emptyProfileInput);
  });

  it("produces a payload that strictly passes patientProfileSchema", () => {
    const form = toProfileInput(mockDto);
    const sanitized = sanitizeProfileInput(form, "Penicillin, Dust", "Asthma");

    expect(() => patientProfileSchema.parse(sanitized)).not.toThrow();
    const parsed = patientProfileSchema.parse(sanitized);
    expect(parsed.fullName).toBe("Jane Doe");
    expect(parsed.dateOfBirth).toBe("1990-05-15");
    expect(parsed.bloodGroup).toBe("O+");
    expect(parsed.allergies).toEqual(["Penicillin", "Dust"]);
    expect(parsed.chronicConditions).toEqual(["Asthma"]);
  });

  it("trims whitespace and converts empty strings to null", () => {
    const sanitized = sanitizeProfileInput(
      {
        fullName: "  John Smith  ",
        dateOfBirth: "   ",
        gender: "   ",
        bloodGroup: null,
        allergies: [],
        chronicConditions: [],
        emergencyContactName: "  ",
        emergencyContactPhone: "  ",
        emergencyContactRelation: "  ",
      },
      "",
      "",
    );

    expect(sanitized.fullName).toBe("John Smith");
    expect(sanitized.dateOfBirth).toBeNull();
    expect(sanitized.gender).toBeNull();
    expect(sanitized.bloodGroup).toBeNull();
    expect(sanitized.allergies).toEqual([]);
    expect(sanitized.chronicConditions).toEqual([]);
    expect(sanitized.emergencyContactName).toBeNull();
    expect(sanitized.emergencyContactPhone).toBeNull();
    expect(sanitized.emergencyContactRelation).toBeNull();

    expect(() => patientProfileSchema.parse(sanitized)).not.toThrow();
  });

  it("prevents extra keys and IDOR injection from reaching schema", () => {
    const dtoWithInjection = {
      ...mockDto,
      patientId: "malicious-patient-id",
      completed: true,
      extraUnauthorizedField: "hacked",
    };

    const form = toProfileInput(dtoWithInjection);
    const sanitized = sanitizeProfileInput(form, "Pollen", "Hypertension");

    expect(sanitized).not.toHaveProperty("patientId");
    expect(sanitized).not.toHaveProperty("completed");
    expect(sanitized).not.toHaveProperty("extraUnauthorizedField");

    // The strict schema will parse without throwing unrecognized keys error
    expect(() => patientProfileSchema.parse(sanitized)).not.toThrow();
  });
});
