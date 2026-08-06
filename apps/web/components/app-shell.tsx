"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { FileText, FolderHeart, LayoutDashboard, LogOut, Menu, UserRound, X } from "lucide-react";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/documents", label: "Documents", icon: FolderHeart },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export function AppShell({ children, email }: { children: ReactNode; email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await getSupabaseBrowserClient().auth.signOut();
    router.replace("/auth/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#dce5e1] bg-[#f7f8f3]/95 px-5 py-4 backdrop-blur lg:hidden">
        <Link href="/dashboard" className="font-display text-xl font-extrabold text-[#154f44]">
          MedVault<span className="text-[#df9c4a]">.</span>
        </Link>
        <button
          className="rounded-lg p-2"
          onClick={() => setOpen(!open)}
          aria-label="Toggle navigation"
        >
          {open ? <X /> : <Menu />}
        </button>
      </header>
      <aside
        className={`${open ? "block" : "hidden"} fixed inset-x-0 top-[65px] z-20 border-b border-[#dce5e1] bg-[#163b34] p-5 text-white lg:sticky lg:top-0 lg:block lg:h-screen lg:border-0 lg:p-6`}
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
                className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-bold transition ${active ? "bg-white text-[#174c42]" : "text-[#cde0da] hover:bg-white/8 hover:text-white"}`}
              >
                <Icon size={18} />
                {label}
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
            <LogOut size={17} /> Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 px-5 py-7 sm:px-8 lg:px-10 lg:py-9 xl:px-14">{children}</main>
    </div>
  );
}
