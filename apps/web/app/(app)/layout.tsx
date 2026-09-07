import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { QueryProvider } from "@/components/query-provider";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/auth/login");
  return (
    <QueryProvider key={data.user.id}>
      <AppShell email={data.user.email ?? "Signed in"}>{children}</AppShell>
    </QueryProvider>
  );
}
