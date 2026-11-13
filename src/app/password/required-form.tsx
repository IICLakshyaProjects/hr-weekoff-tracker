"use client";

import { useActionState } from "react";
import { setRequiredPassword } from "@/app/actions/auth";

export function RequiredPasswordForm() {
  const [state, action, pending] = useActionState(setRequiredPassword, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="next">New password</label>
        <input className="input" id="next" name="next" type="password" minLength={8} required autoComplete="new-password" />
      </div>
      <div>
        <label className="label" htmlFor="confirm">Confirm new password</label>
        <input className="input" id="confirm" name="confirm" type="password" minLength={8} required autoComplete="new-password" />
      </div>
      {state && !state.ok && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.message}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Saving…" : "Save password"}</button>
    </form>
  );
}
