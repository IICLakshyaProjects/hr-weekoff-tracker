import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="login-page relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-16">
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <ThemeToggle className="login-theme-toggle h-10 w-10 justify-center px-0" />
      </div>
      <div className="login-decoration login-decoration-one" aria-hidden="true" />
      <div className="login-decoration login-decoration-two" aria-hidden="true" />
      <section className="login-card relative z-10 w-full max-w-md rounded-2xl border p-7 sm:p-9">
        <BrandLogo className="mb-8 h-12 w-auto max-w-full object-contain object-left sm:h-14" />
        <div className="mb-7">
          <p className="login-eyebrow mb-2 text-xs font-bold uppercase tracking-[0.16em]">Employee portal</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Welcome back</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Sign in to Week Off Tracker with your Employee ID and registered email.
          </p>
        </div>
        <LoginForm />
        <p className="login-footer mt-7 border-t pt-5 text-center text-xs text-slate-500">
          Secure access for employees and department heads
        </p>
      </section>
    </main>
  );
}
