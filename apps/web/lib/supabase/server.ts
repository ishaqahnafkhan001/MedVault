import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicSupabaseAnonKey, publicSupabaseUrl } from "../env";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(publicSupabaseUrl(), publicSupabaseAnonKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies; proxy.ts performs refreshes.
        }
      },
    },
  });
}
