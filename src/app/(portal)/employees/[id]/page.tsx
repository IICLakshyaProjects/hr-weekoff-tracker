import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getEmployee, listDepartments, listHeads } from "@/lib/employees";
import { EmployeeForm } from "../employee-form";

export const instant = false;

export default async function EditEmployeePage({ params }: PageProps<"/employees/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const employee = await getEmployee(Number(id));
  if (!employee) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">
        Edit employee <span className="text-slate-400">· {employee.emp_code}</span>
      </h1>
      <EmployeeForm employee={employee} heads={await listHeads()} departments={await listDepartments()} />
    </div>
  );
}
