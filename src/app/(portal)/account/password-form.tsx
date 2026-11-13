"use client";

import { useActionState } from "react";
import { changePassword } from "@/app/actions/auth";
import { ResultBox } from "@/app/(portal)/result-box";

export function PasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(changePassword, null);
  return (
    <form action={action} className="card space-y-3 p-4" autoComplete="on">
      <h2 className="font-medium">Change password</h2>
      <p className="text-sm text-slate-500">This updates only the account you are signed in with.</p>
      <div>
        <label className="label" htmlFor="username">Account</label>
        <input className="input" id="username" name="username" autoComplete="username" value={email} readOnly />
      </div>
      <div>
        <label className="label" htmlFor="current">Current password</label>
        <input className="input" id="current" type="password" name="current" required autoComplete="current-password" />
      </div>
      <div>
        <label className="label" htmlFor="next">New password</label>
        <input className="input" id="next" type="password" name="next" minLength={8} required autoComplete="new-password" placeholder="At least 8 characters" />
      </div>
      <div>
        <label className="label" htmlFor="confirm">Confirm new password</label>
        <input className="input" id="confirm" type="password" name="confirm" minLength={8} required autoComplete="new-password" />
      </div>
      <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Update password"}</button>
      <ResultBox state={state} />
    </form>
  );
}
