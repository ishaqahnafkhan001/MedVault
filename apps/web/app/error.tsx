"use client";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="surface max-w-lg rounded-3xl p-8 text-center sm:p-10">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#fae8e8]">
          <AlertTriangle className="shrink-0 text-[#a63d40]" size={26} />
        </div>
        <p className="eyebrow text-[#a63d40]">Application Error</p>
        <h1 className="page-title mt-1 text-2xl font-extrabold sm:text-3xl">
          Something went wrong
        </h1>
        <p className="muted mt-2 text-sm">
          No medical details were included in this error message.
        </p>
        <button className="button-primary mt-6 inline-flex items-center gap-2" onClick={reset}>
          <RefreshCw size={15} className="shrink-0" />
          <span>Try again</span>
        </button>
      </div>
    </main>
  );
}
