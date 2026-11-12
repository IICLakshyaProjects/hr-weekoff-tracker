import { requireAdmin } from "@/lib/auth";
import { listDepartments, listHeads } from "@/lib/employees";
import { EmployeeForm } from "../employee-form";

export default async function NewEmployeePage() {
  await requireAdmin();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Add employee</h1>
      <EmployeeForm heads={await listHeads()} departments={await listDepartments()} />
    </div>
  );
}
