import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicSupabaseAnonKey, publicSupabaseUrl } from "../env";

let client: SupabaseClient | undefined;

export function getSupabaseBrowserClient(): SupabaseClient {
  client ??= createBrowserClient(publicSupabaseUrl(), publicSupabaseAnonKey());
  return client;
}
