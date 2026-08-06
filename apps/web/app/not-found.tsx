import Link from "next/link";
export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="text-center">
        <p className="eyebrow">404</p>
        <h1 className="mt-2 text-3xl font-extrabold">Page not found</h1>
        <Link href="/dashboard" className="button-primary mt-6">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
