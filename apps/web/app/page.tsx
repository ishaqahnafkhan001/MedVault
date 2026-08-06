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
          <p className="eyebrow mb-5">Patient-owned records</p>
          <h1 className="font-display text-5xl font-extrabold leading-[1.04] text-[#132d28] sm:text-6xl lg:text-7xl">
            Your medical history,
            <br />
            <span className="text-[#176c5b]">finally in order.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-[#5f706b]">
            Securely keep reports and prescriptions, verify extracted report details, and find the
            result you need without digging through folders.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/auth/register" className="button-primary px-5 py-3">
              Start your vault <ArrowRight size={18} />
            </Link>
            <Link href="/auth/login" className="button-secondary px-5 py-3">
              I already have an account
            </Link>
          </div>
          <p className="mt-5 flex items-center gap-2 text-sm text-[#6c7a76]">
            <LockKeyhole size={15} /> Private storage. You verify every AI-extracted result.
          </p>
        </div>
        <div className="relative">
          <div className="absolute -inset-16 rounded-full bg-[#dceee7] blur-3xl" />
          <div className="surface relative rounded-[2rem] p-5 sm:p-7">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#75827e]">
                  Your health record
                </p>
                <h2 className="mt-1 text-2xl font-extrabold">Latest reports</h2>
              </div>
              <div className="rounded-full bg-[#e5f2ed] p-3 text-[#176c5b]">
                <FileCheck2 />
              </div>
            </div>
            {[
              ["Complete Blood Count", "05 Aug 2026", "Verified"],
              ["HbA1c", "28 Jul 2026", "Verified"],
              ["Kidney Function", "12 Jul 2026", "Verified"],
            ].map(([name, date, status], i) => (
              <div
                key={name}
                className="mb-3 flex items-center gap-4 rounded-2xl border border-[#e4ebe8] bg-white p-4"
              >
                <div
                  className={`h-11 w-1 rounded-full ${i === 0 ? "bg-[#df9c4a]" : "bg-[#72a999]"}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{name}</p>
                  <p className="mt-1 text-sm text-[#74827e]">{date}</p>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-[#eaf4ef] px-2.5 py-1 text-xs font-bold text-[#176c5b]">
                  <CheckCircle2 size={13} />
                  {status}
                </span>
              </div>
            ))}
            <div className="mt-6 flex items-center gap-3 rounded-2xl bg-[#173a33] p-4 text-white">
              <Search className="text-[#9ccbbd]" />
              <div>
                <p className="font-bold">Searchable, verified history</p>
                <p className="text-sm text-[#bdd5ce]">
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
