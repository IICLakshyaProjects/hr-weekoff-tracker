import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="text-xl font-semibold">Week Off Tracker</h1>
        <p className="mb-6 text-sm text-slate-500">Sign in with your Employee ID and registered email.</p>
        <LoginForm />
      </div>
    </main>
  );
}
