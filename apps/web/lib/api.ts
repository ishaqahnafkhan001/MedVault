"use client";

import { publicApiUrl } from "./env";
import { getSupabaseBrowserClient } from "./supabase/client";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly fieldErrors?: unknown,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  if (!data.session?.access_token)
    throw new ApiClientError("Please sign in again.", "UNAUTHENTICATED", 401);
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${data.session.access_token}`);
  if (init?.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const response = await fetch(`${publicApiUrl()}${path}`, { ...init, headers, cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; code?: string; fieldErrors?: unknown };
  };
  if (!response.ok) {
    throw new ApiClientError(
      payload.error?.message ?? "Something went wrong. Please try again.",
      payload.error?.code ?? "REQUEST_FAILED",
      response.status,
      payload.error?.fieldErrors,
    );
  }
  return payload as T;
}
