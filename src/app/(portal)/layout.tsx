import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/types";
import { logout } from "@/app/actions/auth";
import { LoadingScreen } from "@/components/loading-screen";
import { NavLinks } from "./nav-links";

// Per-user pages read the database on every request. This opts the layout out;
// each page also exports `instant = false`, because Next validates pages separately.
export const instant = false;

export default function PortalLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<LoadingScreen label="Loading your account…" />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const links = [
    // The super admin manages employees; marking week offs is done by heads.
    ...(user.role !== "ADMIN" ? [{ href: "/weekoffs", label: "Week Offs" }] : []),
    { href: "/sheet", label: "Week Off Sheet" },
    ...(user.role !== "EMPLOYEE" ? [{ href: "/employees", label: user.role === "ADMIN" ? "Employees" : "My Team" }] : []),
    ...(user.role === "ADMIN" ? [{ href: "/employees/import", label: "Bulk Upload" }, { href: "/activity", label: "Activity Log" }] : []),
    { href: "/account", label: "My Account" },
  ];

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-slate-200 bg-white md:w-56 md:shrink-0 md:border-b-0 md:border-r">
        <div className="px-4 py-4">
          <div className="text-base font-semibold text-indigo-700">Week Off Tracker</div>
          <div className="mt-3 text-sm font-medium">{user.name}</div>
          <div className="text-xs text-slate-500">
            {user.emp_code} · {ROLE_LABEL[user.role]}
          </div>
        </div>
        <NavLinks links={links} />
        <form action={logout} className="px-4 py-4">
          <button className="btn w-full">Sign out</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
