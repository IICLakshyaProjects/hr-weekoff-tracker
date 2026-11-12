import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Optimistic check only: real authorization happens on the server for every page and action.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("hrw_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/weekoffs/:path*", "/sheet/:path*", "/employees/:path*", "/account/:path*", "/activity/:path*", "/api/:path*"],
};
