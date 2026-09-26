import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Sign in" };
export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <Link
        href="/"
        className="group absolute left-6 top-6 inline-flex items-center gap-2 font-display text-lg font-extrabold text-[#154f44] transition hover:text-[#0e4f43]"
      >
        <ArrowLeft
          size={16}
          className="text-[#64736f] transition-transform group-hover:-translate-x-0.5"
        />
        <span>
          MedVault<span className="text-[#df9c4a]">.</span>
        </span>
      </Link>
      <AuthForm mode="login" />
    </main>
  );
}
