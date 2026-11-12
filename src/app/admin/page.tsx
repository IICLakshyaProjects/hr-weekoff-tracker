import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme";
import { LoginForm } from "../login/login-form";

export default function AdminLoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle className="h-9 w-9 justify-center px-0" />
      </div>
      <div className="card w-full max-w-sm p-6">
        <BrandLogo className="mb-4 h-12 w-auto max-w-full object-contain object-left" />
        <div className="mb-1 inline-block rounded bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-800">ADMIN</div>
        <h1 className="text-xl font-semibold">Admin Panel Login</h1>
        <p className="mb-6 text-sm text-slate-500">Sign in with your admin email and password.</p>
        <LoginForm admin />
        <p className="mt-6 text-xs">
          <Link className="text-indigo-600 hover:underline" href="/login">← Employee / Department Head login</Link>
        </p>
      </div>
    </main>
  );
}
