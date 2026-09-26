import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="surface max-w-md rounded-3xl p-8 text-center sm:p-10">
        <p className="eyebrow">404 Error</p>
        <h1 className="page-title mt-2">Page not found</h1>
        <p className="muted mt-2 text-sm">
          The page or document you requested cannot be found or may have been moved.
        </p>
        <Link href="/dashboard" className="button-primary mt-6 inline-flex items-center gap-2">
          <ArrowLeft size={16} className="shrink-0" />
          <span>Back to dashboard</span>
        </Link>
      </div>
    </main>
  );
}
