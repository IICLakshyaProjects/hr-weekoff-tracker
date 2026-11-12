import Link from "next/link";
import { LoginForm } from "../login/login-form";

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <div className="card w-full max-w-sm p-6">
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
