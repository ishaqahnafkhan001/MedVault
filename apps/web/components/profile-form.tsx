"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Check, LoaderCircle } from "lucide-react";
import type { PatientProfileDto, PatientProfileInput } from "@medvault/shared";
import { apiRequest } from "@/lib/api";

const empty: PatientProfileInput = {
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

export function ProfileForm({ onboarding = false }: { onboarding?: boolean }) {
  const router = useRouter();
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => apiRequest<{ profile: PatientProfileDto | null }>("/v1/profile"),
  });
  const [form, setForm] = useState(empty);
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
    if (profile.data?.profile) {
      const p = profile.data.profile;
      setForm(p);
      setAllergies(p.allergies.join(", "));
      setConditions(p.chronicConditions.join(", "));
    }
  }, [profile.data]);

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate({ ...form, allergies: list(allergies), chronicConditions: list(conditions) });
  }
  if (profile.isLoading)
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <LoaderCircle className="animate-spin text-[#176c5b]" />
      </div>
    );
  return (
    <form onSubmit={submit} className="surface rounded-3xl p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" required>
          <input
            className="field"
            required
            minLength={2}
            maxLength={120}
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />
        </Field>
        <Field label="Date of birth">
          <input
            className="field"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            value={form.dateOfBirth ?? ""}
            onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value || null })}
          />
        </Field>
        <Field label="Gender (optional)">
          <input
            className="field"
            maxLength={40}
            placeholder="How you identify"
            value={form.gender ?? ""}
            onChange={(e) => setForm({ ...form, gender: e.target.value || null })}
          />
        </Field>
        <Field label="Blood group">
          <select
            className="field"
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
        <Field label="Allergies" hint="Separate multiple items with commas">
          <input
            className="field"
            placeholder="e.g. Penicillin, peanuts"
            value={allergies}
            onChange={(e) => setAllergies(e.target.value)}
          />
        </Field>
        <Field label="Existing or chronic conditions" hint="Separate multiple items with commas">
          <input
            className="field"
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
        <Field label="Name">
          <input
            className="field"
            value={form.emergencyContactName ?? ""}
            onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value || null })}
          />
        </Field>
        <Field label="Phone">
          <input
            className="field"
            type="tel"
            value={form.emergencyContactPhone ?? ""}
            onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value || null })}
          />
        </Field>
        <Field label="Relationship">
          <input
            className="field"
            value={form.emergencyContactRelation ?? ""}
            onChange={(e) => setForm({ ...form, emergencyContactRelation: e.target.value || null })}
          />
        </Field>
      </div>
      {mutation.isError && (
        <p role="alert" className="mt-5 rounded-xl bg-[#f8e4e4] p-3 text-sm text-[#963e42]">
          {mutation.error.message}
        </p>
      )}
      {mutation.isSuccess && !onboarding && (
        <p
          role="status"
          className="mt-5 flex items-center gap-2 rounded-xl bg-[#e4f2ec] p-3 text-sm font-bold text-[#176c5b]"
        >
          <Check size={16} /> Profile saved.
        </p>
      )}
      <button className="button-primary mt-7 min-w-36" disabled={mutation.isPending}>
        {mutation.isPending && <LoaderCircle size={17} className="animate-spin" />}
        {onboarding ? "Save & continue" : "Save profile"}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="label">
        {label}
        {required && " *"}
      </span>
      {children}
      {hint && <span className="muted mt-1 block text-xs">{hint}</span>}
    </label>
  );
}
function list(value: string) {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 50);
}
