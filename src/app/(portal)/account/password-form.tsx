"use client";

import { useActionState } from "react";
import { changePassword } from "@/app/actions/auth";
import { ResultBox } from "@/app/(portal)/result-box";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, null);
  return (
    <form action={action} className="card space-y-3 p-4">
      <h2 className="font-medium">Change password</h2>
      <input className="input" type="password" name="current" placeholder="Current password" required autoComplete="current-password" />
      <input className="input" type="password" name="next" placeholder="New password (min 8 characters)" minLength={8} required autoComplete="new-password" />
      <input className="input" type="password" name="confirm" placeholder="Confirm new password" minLength={8} required autoComplete="new-password" />
      <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Update password"}</button>
      <ResultBox state={state} />
    </form>
  );
}
