import Link from "next/link";

export function NotFoundScreen() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="card w-full max-w-md p-6 text-center">
        <p className="text-sm font-semibold text-indigo-600">404</p>
        <h1 className="mt-1 text-xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-slate-500">That address is not part of the week off tracker.</p>
        <Link className="btn btn-primary mt-4" href="/">Back to the tracker</Link>
      </div>
    </div>
  );
}
