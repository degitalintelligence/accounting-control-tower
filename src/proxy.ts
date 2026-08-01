import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { consumeRateLimit, getClientAddress, rateLimitCategory, rateLimitHeaders } from "@/lib/rate-limit";

/** Routes yang tidak butuh auth */
const publicRoutes = ["/login", "/auth/callback", "/reset-password"];
const bypassRoutes = ["/api/wa-webhook", "/api/jobs", "/api/health"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const category = rateLimitCategory(pathname, request.method);
  if (category) {
    const decision = consumeRateLimit(`${category.name}:${getClientAddress(request.headers)}`, category.limit, category.windowMs);
    if (!decision.allowed) {
      return NextResponse.json({ error: "Terlalu banyak permintaan. Silakan coba lagi nanti." }, { status: 429, headers: rateLimitHeaders(decision) });
    }
  }

  // Skip static files, favicon, Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Skip bypass routes (e.g. WhatsApp webhook — no auth needed)
  if (bypassRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "acct_ctrl" },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — penting agar cookie tetap valid
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isOnPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  // Tidak ada user dan bukan di halaman publik → redirect ke login
  if (!user && !isOnPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Sudah login dan mengakses login page → redirect ke dashboard
  if (user && isOnPublicRoute && pathname !== "/reset-password") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match semua request path kecuali:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - Semua file dengan ekstensi (gambar, css, js, dll)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.).*)",
  ],
};
