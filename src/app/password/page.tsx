import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme";
import { logout } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { RequiredPasswordForm } from "./required-form";

export const instant = false;

export default async function RequiredPasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.must_change_password) redirect(user.role === "ADMIN" ? "/employees" : "/weekoffs");

  return (
    <main className="relative flex min-h-screen items-center justify-center p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle className="h-9 w-9 justify-center px-0" />
      </div>
      <div className="card w-full max-w-sm p-6">
        <BrandLogo className="mb-4 h-12 w-auto max-w-full object-contain object-left" />
        <h1 className="text-xl font-semibold">Set your password</h1>
        <p className="mb-6 text-sm text-slate-500">
          You signed in with the shared department-head password. Choose your own password before continuing. This cannot be skipped.
        </p>
        <RequiredPasswordForm />
        <form action={logout} className="mt-4">
          <button className="btn w-full">Sign out</button>
        </form>
      </div>
    </main>
  );
}
