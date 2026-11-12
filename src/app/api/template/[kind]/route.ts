import { toCsv } from "@/lib/csv";

const TEMPLATES: Record<string, (string | number)[][]> = {
  employees: [
    ["Employee Number", "Full Name", "Email", "Job Title", "Business Unit", "Department", "Location", "Band", "Reporting To"],
    ["H100", "Priya Sharma", "priya@company.com", "Operations Head", "Corporate", "Operations", "Mumbai", "B5", ""],
    ["E101", "Rahul Verma", "rahul@company.com", "Executive", "Corporate", "Operations", "Mumbai", "B2", "H100"],
    ["E102", "Anita Rao", "anita@company.com", "Executive", "Corporate", "Operations", "Pune", "B2", "H100"],
  ],
  weekoffs: [
    ["employee_id", "date", "action", "note"],
    ["E101", "2026-11-15", "ADD", ""],
    ["E102", "2026-11-14", "ADD", "Swapped with Sunday"],
  ],
};

export async function GET(_req: Request, { params }: RouteContext<"/api/template/[kind]">) {
  const { kind } = await params;
  const rows = TEMPLATES[kind];
  if (!rows) return new Response("Not found", { status: 404 });
  return new Response("﻿" + toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}-template.csv"`,
    },
  });
}
