import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE } from "@/lib/demo/session";
import { supabaseEnv } from "./env";

/** Paths anyone can open. Everything else needs a signed-in, allow-listed user. */
export const PUBLIC_PATHS = ["/login", "/design", "/offline"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refreshes the auth session cookie on every request and sends signed-out
 * visitors to /login. This is an optimistic check only: real protection is
 * Row Level Security in the database, which also blocks non-allow-listed users.
 */
export async function updateSession(request: NextRequest) {
  const env = supabaseEnv();
  const { pathname } = request.nextUrl;

  if (!env) {
    // No database configured: demo mode (made-up data only).
    const demo = request.cookies.get(DEMO_COOKIE)?.value === "1";
    if (demo && pathname === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    if (demo || isPublicPath(pathname)) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Link prefetches (the app quietly loading pages you might open) don't need the session check:
  // the page itself still runs as the signed-in user, and the database refuses anyone else.
  // Skipping it saves one trip to Supabase for every link on screen.
  if (request.headers.get("next-router-prefetch") === "1" && !isPublicPath(pathname)) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Verifies the JWT; don't put code between createServerClient and this call.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  if (!signedIn && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  if (signedIn && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}
