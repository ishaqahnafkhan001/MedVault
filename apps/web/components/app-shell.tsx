"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  FileText,
  FolderHeart,
  LayoutDashboard,
  LogOut,
  Menu,
  UserRound,
  X,
  Activity,
  ChartLine,
} from "lucide-react";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/documents", label: "Documents", icon: FolderHeart },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/history", label: "Test history", icon: ChartLine },
  { href: "/episodes", label: "Episodes", icon: Activity },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export function AppShell({ children, email }: { children: ReactNode; email: string }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  async function logout() {
    try {
      await getSupabaseBrowserClient().auth.signOut();
    } finally {
      queryClient.clear();
      window.location.replace("/auth/login");
    }
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#dce5e1] bg-[#f7f8f3]/95 px-5 py-3.5 backdrop-blur lg:hidden">
        <Link href="/dashboard" className="font-display text-xl font-extrabold text-[#154f44]">
          MedVault<span className="text-[#df9c4a]">.</span>
        </Link>
        <button
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#dce5e1] bg-white text-[#154f44] shadow-xs"
          onClick={() => setOpen(!open)}
          aria-label="Toggle navigation"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>
      <aside
        className={`${open ? "block" : "hidden"} fixed inset-x-0 top-[61px] z-20 border-b border-[#dce5e1] bg-[#163b34] p-5 text-white lg:sticky lg:top-0 lg:block lg:h-screen lg:border-0 lg:p-6`}
      >
        <Link href="/dashboard" className="hidden font-display text-2xl font-extrabold lg:block">
          MedVault<span className="text-[#e8ab61]">.</span>
        </Link>
        <p className="mt-2 hidden text-xs text-[#a7c7be] lg:block">Your health record, in order.</p>
        <nav className="grid gap-1 lg:mt-10" aria-label="Patient navigation">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                onClick={() => setOpen(false)}
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-bold transition ${active ? "bg-white text-[#174c42] shadow-xs" : "text-[#cde0da] hover:bg-white/8 hover:text-white"}`}
              >
                <Icon size={18} className="shrink-0" />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-5 border-t border-white/10 pt-4 lg:absolute lg:inset-x-6 lg:bottom-6">
          <p className="mb-2 truncate px-2 text-xs text-[#a7c7be]">{email}</p>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-[#cde0da] hover:bg-white/8 hover:text-white"
          >
            <LogOut size={16} className="shrink-0" /> <span>Sign out</span>
          </button>
        </div>
      </aside>
      <main className="min-w-0 px-5 py-7 sm:px-8 lg:px-10 lg:py-9 xl:px-14">{children}</main>
    </div>
  );
}
