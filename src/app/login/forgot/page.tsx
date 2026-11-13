import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme";
import { ForgotForm } from "./forgot-form";

export default function ForgotPasswordPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle className="h-9 w-9 justify-center px-0" />
      </div>
      <div className="card w-full max-w-sm p-6">
        <BrandLogo className="mb-4 h-12 w-auto max-w-full object-contain object-left" />
        <h1 className="text-xl font-semibold">Forgot password</h1>
        <p className="mb-6 text-sm text-slate-500">Enter the Employee ID and email on your account. You can then choose a new password.</p>
        <ForgotForm />
        <p className="mt-6 text-xs">
          <Link className="text-indigo-600 hover:underline" href="/login">← Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
