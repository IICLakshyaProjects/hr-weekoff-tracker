import { requireUser } from "@/lib/auth";
import { getEmployee } from "@/lib/employees";
import { ROLE_LABEL } from "@/lib/types";
import { PasswordForm } from "./password-form";

export default async function AccountPage() {
  const user = await requireUser();
  const me = (await getEmployee(user.id))!;
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">My account</h1>
      <div className="card grid grid-cols-2 gap-3 p-4 text-sm">
        <Info label="Employee ID" value={me.emp_code} />
        <Info label="Name" value={me.name} />
        <Info label="Email" value={me.email} />
        <Info label="Role" value={ROLE_LABEL[me.role]} />
        <Info label="Department" value={me.department} />
        <Info label="Reporting head" value={me.manager_name} />
        <Info label="Default week off" value={me.default_weekoff} />
        <Info label="Can update week offs" value={user.can_edit_weekoff ? "Yes" : "No"} />
      </div>
      <PasswordForm />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div>{value || "—"}</div>
    </div>
  );
}
