import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const reset = sp.reset === "1";
  return (
    <main className="relative flex min-h-screen items-center justify-center p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle className="h-9 w-9 justify-center px-0" />
      </div>
      <div className="card w-full max-w-sm p-6">
        <BrandLogo className="mb-4 h-12 w-auto max-w-full object-contain object-left" />
        <h1 className="text-xl font-semibold">Week Off Tracker</h1>
        <p className="mb-6 text-sm text-slate-500">Sign in with your Employee ID and registered email.</p>
        {reset && <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">Password saved. Sign in with your new password.</p>}
        <LoginForm />
      </div>
    </main>
  );
}
