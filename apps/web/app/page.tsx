import Link from "next/link";
import { ArrowRight, CheckCircle2, FileCheck2, LockKeyhole, Search } from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f8f3]">
      <nav
        className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10"
        aria-label="Main navigation"
      >
        <Link
          href="/"
          className="font-display text-xl font-extrabold tracking-tight text-[#154f44]"
        >
          MedVault<span className="text-[#df9c4a]">.</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/auth/login" className="button-secondary">
            Sign in
          </Link>
          <Link href="/auth/register" className="button-primary">
            Create account
          </Link>
        </div>
      </nav>
      <section className="relative mx-auto grid min-h-[calc(100vh-88px)] max-w-7xl items-center gap-14 px-6 py-16 lg:grid-cols-[1.05fr_.95fr] lg:px-10">
        <div className="relative z-10 max-w-2xl">
          <p className="eyebrow mb-5">Patient-controlled records</p>
          <h1 className="font-display text-5xl font-extrabold leading-[1.04] text-[#132d28] sm:text-6xl lg:text-7xl">
            Your medical history,
            <br />
            <span className="text-[#176c5b]">finally in order.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-[#5f706b]">
            Securely keep reports and prescriptions, verify extracted report details, and find the
            result you need without digging through folders.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/auth/register" className="button-primary group px-6 py-3.5">
              <span>Start your vault</span>
              <ArrowRight
                size={16}
                className="shrink-0 transition-transform group-hover:translate-x-1"
              />
            </Link>
            <Link href="/auth/login" className="button-secondary px-6 py-3.5">
              I already have an account
            </Link>
          </div>
          <p className="mt-5 flex items-center gap-2 text-sm text-[#6c7a76]">
            <LockKeyhole size={15} className="shrink-0 text-[#176c5b]" />
            <span>Private storage. You verify every AI-extracted result.</span>
          </p>
        </div>
        <div className="relative">
          <div className="absolute -inset-16 rounded-full bg-[#dceee7] blur-3xl" />
          <div className="surface relative rounded-[2rem] p-5 sm:p-7">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#75827e]">
                  Illustrative dashboard
                </p>
                <h2 className="mt-1 text-2xl font-extrabold text-[#132d28]">Latest reports</h2>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e5f2ed] text-[#176c5b]">
                <FileCheck2 size={20} className="shrink-0" />
              </div>
            </div>
            {[
              ["Complete Blood Count", "05 Aug 2026", "Verified"],
              ["HbA1c", "28 Jul 2026", "Verified"],
              ["Kidney Function", "12 Jul 2026", "Verified"],
            ].map(([name, date, status], i) => (
              <div
                key={name}
                className="mb-3 flex items-center gap-4 rounded-2xl border border-[#e4ebe8] bg-white p-4 shadow-2xs"
              >
                <div
                  className={`h-10 w-1 shrink-0 rounded-full ${i === 0 ? "bg-[#df9c4a]" : "bg-[#72a999]"}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-[#162522]">{name}</p>
                  <p className="mt-0.5 text-xs text-[#74827e]">{date}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#eaf4ef] px-2.5 py-1 text-xs font-extrabold text-[#176c5b]">
                  <CheckCircle2 size={13} className="shrink-0" />
                  {status}
                </span>
              </div>
            ))}
            <div className="mt-6 flex items-center gap-3.5 rounded-2xl bg-[#173a33] p-4 text-white">
              <Search size={18} className="shrink-0 text-[#9ccbbd]" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">Searchable, verified history</p>
                <p className="text-xs text-[#bdd5ce]">
                  Latest report date takes priority—not upload date.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
