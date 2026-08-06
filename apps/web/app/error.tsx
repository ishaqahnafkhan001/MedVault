"use client";
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="surface max-w-lg rounded-2xl p-8 text-center">
        <h1 className="text-2xl font-extrabold">Something went wrong</h1>
        <p className="muted mt-2">No medical details were included in this error message.</p>
        <button className="button-primary mt-5" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
