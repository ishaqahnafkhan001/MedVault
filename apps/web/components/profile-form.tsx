"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Check, LoaderCircle } from "lucide-react";
import type { PatientProfileDto, PatientProfileInput } from "@medvault/shared";
import { apiRequest, ApiClientError } from "@/lib/api";

export const emptyProfileInput: PatientProfileInput = {
  fullName: "",
  dateOfBirth: null,
  gender: null,
  bloodGroup: null,
  allergies: [],
  chronicConditions: [],
  emergencyContactName: null,
  emergencyContactPhone: null,
  emergencyContactRelation: null,
};

export function toProfileInput(dto: PatientProfileDto | null | undefined): PatientProfileInput {
  if (!dto) return emptyProfileInput;
  return {
    fullName: dto.fullName ?? "",
    dateOfBirth: dto.dateOfBirth ?? null,
    gender: dto.gender ?? null,
    bloodGroup: dto.bloodGroup ?? null,
    allergies: Array.isArray(dto.allergies) ? dto.allergies : [],
    chronicConditions: Array.isArray(dto.chronicConditions) ? dto.chronicConditions : [],
    emergencyContactName: dto.emergencyContactName ?? null,
    emergencyContactPhone: dto.emergencyContactPhone ?? null,
    emergencyContactRelation: dto.emergencyContactRelation ?? null,
  };
}

export function sanitizeProfileInput(
  form: PatientProfileInput,
  allergiesText: string,
  conditionsText: string,
): PatientProfileInput {
  return {
    fullName: form.fullName.trim(),
    dateOfBirth: form.dateOfBirth ? form.dateOfBirth.trim() || null : null,
    gender: form.gender ? form.gender.trim() || null : null,
    bloodGroup: form.bloodGroup || null,
    allergies: parseList(allergiesText),
    chronicConditions: parseList(conditionsText),
    emergencyContactName: form.emergencyContactName
      ? form.emergencyContactName.trim() || null
      : null,
    emergencyContactPhone: form.emergencyContactPhone
      ? form.emergencyContactPhone.trim() || null
      : null,
    emergencyContactRelation: form.emergencyContactRelation
      ? form.emergencyContactRelation.trim() || null
      : null,
  };
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => v.slice(0, 120))
    .slice(0, 50);
}

const fieldLabels: Record<string, string> = {
  fullName: "Full name",
  dateOfBirth: "Date of birth",
  gender: "Gender",
  bloodGroup: "Blood group",
  allergies: "Allergies",
  chronicConditions: "Existing or chronic conditions",
  emergencyContactName: "Emergency contact name",
  emergencyContactPhone: "Emergency contact phone",
  emergencyContactRelation: "Emergency contact relationship",
};

function getFieldErrors(error: unknown): Record<string, string[]> {
  if (
    error instanceof ApiClientError &&
    error.fieldErrors &&
    typeof error.fieldErrors === "object" &&
    !Array.isArray(error.fieldErrors)
  ) {
    const result: Record<string, string[]> = {};
    for (const [key, val] of Object.entries(error.fieldErrors)) {
      if (Array.isArray(val)) {
        result[key] = val.filter((item): item is string => typeof item === "string");
      }
    }
    return result;
  }
  return {};
}

export function ProfileForm({ onboarding = false }: { onboarding?: boolean }) {
  const router = useRouter();
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => apiRequest<{ profile: PatientProfileDto | null }>("/v1/profile"),
  });
  const [form, setForm] = useState<PatientProfileInput>(emptyProfileInput);
  const [allergies, setAllergies] = useState("");
  const [conditions, setConditions] = useState("");

  const mutation = useMutation({
    mutationFn: (body: PatientProfileInput) =>
      apiRequest<{ profile: PatientProfileDto }>("/v1/profile", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      if (onboarding) router.replace("/dashboard");
      void profile.refetch();
    },
  });

  useEffect(() => {
    if (!profile.data) return;
    const p = profile.data.profile;
    if (p) {
      setForm(toProfileInput(p));
      setAllergies(p.allergies?.join(", ") ?? "");
      setConditions(p.chronicConditions?.join(", ") ?? "");
    } else {
      setForm(emptyProfileInput);
      setAllergies("");
      setConditions("");
    }
  }, [profile.data]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const payload = sanitizeProfileInput(form, allergies, conditions);
    mutation.mutate(payload);
  }

  const errors = mutation.isError ? getFieldErrors(mutation.error) : {};
  const errorEntries = Object.entries(errors);

  if (profile.isLoading)
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <LoaderCircle className="animate-spin text-[#176c5b]" />
      </div>
    );

  return (
    <form onSubmit={submit} className="surface rounded-3xl p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" required error={errors.fullName?.[0]}>
          <input
            className={`field ${errors.fullName ? "!border-[#963e42]" : ""}`}
            required
            minLength={2}
            maxLength={120}
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />
        </Field>
        <Field label="Date of birth" error={errors.dateOfBirth?.[0]}>
          <input
            className={`field ${errors.dateOfBirth ? "!border-[#963e42]" : ""}`}
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            value={form.dateOfBirth ?? ""}
            onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value || null })}
          />
        </Field>
        <Field label="Gender (optional)" error={errors.gender?.[0]}>
          <input
            className={`field ${errors.gender ? "!border-[#963e42]" : ""}`}
            maxLength={40}
            placeholder="How you identify"
            value={form.gender ?? ""}
            onChange={(e) => setForm({ ...form, gender: e.target.value || null })}
          />
        </Field>
        <Field label="Blood group" error={errors.bloodGroup?.[0]}>
          <select
            className={`field ${errors.bloodGroup ? "!border-[#963e42]" : ""}`}
            value={form.bloodGroup ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                bloodGroup: (e.target.value || null) as PatientProfileInput["bloodGroup"],
              })
            }
          >
            <option value="">Not set</option>
            {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field
          label="Allergies"
          hint="Separate multiple items with commas"
          error={errors.allergies?.[0]}
        >
          <input
            className={`field ${errors.allergies ? "!border-[#963e42]" : ""}`}
            placeholder="e.g. Penicillin, peanuts"
            value={allergies}
            onChange={(e) => setAllergies(e.target.value)}
          />
        </Field>
        <Field
          label="Existing or chronic conditions"
          hint="Separate multiple items with commas"
          error={errors.chronicConditions?.[0]}
        >
          <input
            className={`field ${errors.chronicConditions ? "!border-[#963e42]" : ""}`}
            placeholder="e.g. Asthma"
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
          />
        </Field>
      </div>
      <div className="my-7 border-t border-[#e2e9e6]" />
      <h2 className="text-lg font-extrabold">
        Emergency contact <span className="muted text-sm font-normal">(optional)</span>
      </h2>
      <div className="mt-4 grid gap-5 sm:grid-cols-3">
        <Field label="Name" error={errors.emergencyContactName?.[0]}>
          <input
            className={`field ${errors.emergencyContactName ? "!border-[#963e42]" : ""}`}
            maxLength={120}
            value={form.emergencyContactName ?? ""}
            onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value || null })}
          />
        </Field>
        <Field label="Phone" error={errors.emergencyContactPhone?.[0]}>
          <input
            className={`field ${errors.emergencyContactPhone ? "!border-[#963e42]" : ""}`}
            type="tel"
            maxLength={40}
            value={form.emergencyContactPhone ?? ""}
            onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value || null })}
          />
        </Field>
        <Field label="Relationship" error={errors.emergencyContactRelation?.[0]}>
          <input
            className={`field ${errors.emergencyContactRelation ? "!border-[#963e42]" : ""}`}
            maxLength={60}
            value={form.emergencyContactRelation ?? ""}
            onChange={(e) => setForm({ ...form, emergencyContactRelation: e.target.value || null })}
          />
        </Field>
      </div>
      {mutation.isError && (
        <div role="alert" className="mt-5 rounded-xl bg-[#f8e4e4] p-4 text-sm text-[#963e42]">
          <p className="font-bold">{mutation.error.message}</p>
          {errorEntries.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-1">
              {errorEntries.flatMap(([field, msgs]) =>
                msgs.map((msg, idx) => (
                  <li key={`${field}-${idx}`}>
                    <span className="font-semibold">{fieldLabels[field] ?? field}:</span> {msg}
                  </li>
                )),
              )}
            </ul>
          )}
        </div>
      )}
      {mutation.isSuccess && !onboarding && (
        <p
          role="status"
          className="mt-5 flex items-center gap-2 rounded-xl bg-[#e4f2ec] p-3 text-sm font-bold text-[#176c5b]"
        >
          <Check size={16} className="shrink-0" /> Profile saved.
        </p>
      )}
      <button
        type="submit"
        className="button-primary mt-7 inline-flex min-w-36 items-center justify-center gap-2"
        disabled={mutation.isPending}
      >
        {mutation.isPending ? (
          <LoaderCircle size={17} className="shrink-0 animate-spin" />
        ) : (
          <Check size={17} className="shrink-0" />
        )}
        <span>{onboarding ? "Save & continue" : "Save profile"}</span>
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  error,
  children,
}: {
  label: string;
  hint?: string | undefined;
  required?: boolean | undefined;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="label">
        {label}
        {required && " *"}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs font-semibold text-[#963e42]">{error}</span>
      ) : (
        hint && <span className="muted mt-1 block text-xs">{hint}</span>
      )}
    </label>
  );
}
