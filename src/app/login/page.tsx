import { Suspense } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme";
import { LoginForm } from "./login-form";

/** Only this notice depends on the URL, so the rest of the page renders immediately. */
async function ResetNotice({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  if (sp.reset !== "1") return null;
  return <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">Password saved. Sign in with your new password.</p>;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="relative flex min-h-screen items-center justify-center p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle className="h-9 w-9 justify-center px-0" />
      </div>
      <div className="card w-full max-w-sm p-6">
        <BrandLogo className="mb-4 h-12 w-auto max-w-full object-contain object-left" />
        <h1 className="text-xl font-semibold">Week Off Tracker</h1>
        <p className="mb-6 text-sm text-slate-500">Sign in with your Employee ID and registered email.</p>
        <Suspense fallback={null}>
          <ResetNotice searchParams={searchParams} />
        </Suspense>
        <LoginForm />
      </div>
    </main>
  );
}
