"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/app/actions/auth";

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="emp_code">Employee ID</label>
        <input className="input" id="emp_code" name="emp_code" required autoComplete="username" />
      </div>
      <div>
        <label className="label" htmlFor="email">Email ID</label>
        <input className="input" id="email" name="email" type="email" required autoComplete="email" />
      </div>
      {state && !state.ok && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.message}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Checking…" : "Continue"}</button>
    </form>
  );
}
