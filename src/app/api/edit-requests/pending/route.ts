import { getCurrentUser } from "@/lib/auth";
import { pendingEditSummary } from "@/lib/month-lock";

/** Polled by the admin notification banner. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return new Response("Unauthorized", { status: 401 });
  return Response.json(await pendingEditSummary(), { headers: { "Cache-Control": "no-store" } });
}
