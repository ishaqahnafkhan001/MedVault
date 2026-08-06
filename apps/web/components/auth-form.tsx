"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import type { PatientProfileDto } from "@medvault/shared";
import { apiRequest } from "@/lib/api";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    const supabase = getSupabaseBrowserClient();
    const result =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${window.location.origin}/auth/login` },
          });
    if (result.error) {
      setLoading(false);
      setMessage(result.error.message);
      return;
    }
    if (mode === "register" && !result.data.session) {
      setLoading(false);
      setMessage("Check your email to confirm your account, then sign in.");
      return;
    }
    let destination = "/onboarding";
    if (mode === "login") {
      try {
        const profile = await apiRequest<{ profile: PatientProfileDto | null }>("/v1/profile");
        destination = profile.profile ? "/dashboard" : "/onboarding";
      } catch {
        setLoading(false);
        setMessage("Signed in, but your vault is temporarily unavailable. Please try again.");
        return;
      }
    }
    router.push(destination);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="surface w-full max-w-md rounded-[1.6rem] p-7 sm:p-9">
      <p className="eyebrow">{mode === "login" ? "Welcome back" : "Private by default"}</p>
      <h1 className="mt-3 text-3xl font-extrabold">
        {mode === "login" ? "Sign in to MedVault" : "Create your vault"}
      </h1>
      <p className="muted mt-2 text-sm">
        {mode === "login"
          ? "Continue to your medical record."
          : "Keep your reports and prescriptions in one secure place."}
      </p>
      <div className="mt-7">
        <label className="label" htmlFor="email">
          Email address
        </label>
        <input
          className="field"
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="mt-4">
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          className="field"
          id="password"
          type="password"
          minLength={8}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {message && (
        <p className="mt-4 rounded-xl bg-[#fff4df] p-3 text-sm text-[#7d551d]" role="status">
          {message}
        </p>
      )}
      <button className="button-primary mt-6 w-full py-3" disabled={loading}>
        {loading && <LoaderCircle size={17} className="animate-spin" />}
        {mode === "login" ? "Sign in" : "Create account"}
      </button>
      <p className="muted mt-6 text-center text-sm">
        {mode === "login" ? "New to MedVault?" : "Already have an account?"}{" "}
        <Link
          className="font-bold text-[#176c5b] underline-offset-4 hover:underline"
          href={mode === "login" ? "/auth/register" : "/auth/login"}
        >
          {mode === "login" ? "Create account" : "Sign in"}
        </Link>
      </p>
    </form>
  );
}
