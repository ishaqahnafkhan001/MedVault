import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Create account" };
export default function RegisterPage() {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <Link
        href="/"
        className="absolute left-6 top-6 font-display text-xl font-extrabold text-[#154f44]"
      >
        MedVault<span className="text-[#df9c4a]">.</span>
      </Link>
      <AuthForm mode="register" />
    </main>
  );
}
