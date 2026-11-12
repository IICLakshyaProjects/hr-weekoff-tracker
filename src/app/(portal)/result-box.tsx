import type { ActionResult } from "@/lib/types";

export function ResultBox({ state }: { state: (ActionResult & { errors?: string[] }) | null }) {
  if (!state) return null;
  return (
    <div className={`mt-3 rounded-md px-3 py-2 text-sm ${state.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
      <p>{state.message}</p>
      {state.errors && state.errors.length > 0 && (
        <ul className="mt-2 max-h-48 list-disc overflow-auto pl-5 text-amber-800">
          {state.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
