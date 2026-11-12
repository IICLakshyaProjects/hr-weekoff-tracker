"use client";

import { useActionState } from "react";
import { adminLogin, login } from "@/app/actions/auth";

export function LoginForm({ admin = false }: { admin?: boolean }) {
  const [state, action, pending] = useActionState(admin ? adminLogin : login, null);
  return (
    <form action={action} className="space-y-4">
      {!admin && (
        <div>
          <label className="label" htmlFor="emp_code">Employee ID</label>
          <input className="input" id="emp_code" name="emp_code" required autoComplete="username" />
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">Email ID</label>
        <input className="input" id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input className="input" id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      {state && !state.ok && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.message}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Signing in…" : admin ? "Sign in as Admin" : "Sign in"}
      </button>
    </form>
  );
}
