import { NextResponse, type NextRequest } from "next/server";
import { decryptSession, SESSION_COOKIE } from "@/lib/session";

// Optimistic auth gate (Next.js "Proxy", formerly middleware). It only reads the
// signed session cookie — never the database — and simply keeps signed-out users
// out of authenticated areas and signed-in users off the auth pages. The
// authoritative role + approval checks run server-side in the DAL (src/lib/dal.ts).

const PUBLIC_PATHS = new Set(["/", "/login", "/signup"]);

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.has(pathname);

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await decryptSession(token);

  if (!session && !isPublic) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (session && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run on all routes except API (handlers self-authorize), Next internals, and
  // static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
