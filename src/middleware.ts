import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { consumeRateLimit, getClientAddress, rateLimitCategory, rateLimitHeaders } from "@/lib/rate-limit";

/** Routes yang tidak butuh auth */
const publicRoutes = ["/login", "/auth/callback", "/reset-password"];
const bypassRoutes = [
  "/api/wa-webhook",
  "/api/health",
  "/api/jobs/ai-extraction",
  "/api/jobs/escalation-check",
  "/api/jobs/notifications",
  "/api/jobs/recurrence",
  "/api/jobs/reminders",
  "/api/jobs/whatsapp-retention",
  "/api/jobs/waha-cleanup",
];

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /**
   * HTML navigasi disajikan tanpa cache (no-store) sehingga setelah deploy
   * browser/proxy tidak menampilkan build lama. Aset statis (_next/static)
   * sudah content-hashed dan di-cache immutable (lihat next.config.ts).
   * `_next/static`, `_next/image`, dan favicon tidak lewat matcher ini.
   */
  const isHtmlNavigation = request.headers.get("accept")?.includes("text/html") === true;

  const applySecurityHeaders = (response: NextResponse) => {
    Object.entries(securityHeaders).forEach(([key, value]) => response.headers.set(key, value));
    if (isHtmlNavigation) {
      response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      response.headers.set("Pragma", "no-cache");
    }
    return response;
  };

  const category = rateLimitCategory(pathname, request.method);
  if (category) {
    const decision = consumeRateLimit(`${category.name}:${getClientAddress(request.headers)}`, category.limit, category.windowMs);
    if (!decision.allowed) {
      const response = NextResponse.json({ error: "Terlalu banyak permintaan. Silakan coba lagi nanti." }, { status: 429, headers: rateLimitHeaders(decision) });
      return applySecurityHeaders(response);
    }
  }

  // Skip static files, favicon, Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return applySecurityHeaders(NextResponse.next());
  }

  // Skip bypass routes (e.g. WhatsApp webhook — no auth needed)
  if (bypassRoutes.includes(pathname)) {
    return applySecurityHeaders(NextResponse.next());
  }

  const isOnPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  // Callback and password-reset pages establish/consume auth state themselves.
  // Login still performs the lookup so the existing logged-in redirect remains.
  const requiresAuthLookup = !isOnPublicRoute || pathname === "/login";
  if (!requiresAuthLookup) {
    return applySecurityHeaders(NextResponse.next());
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Jika env vars tidak ada di middleware, ini bisa menyebabkan 500.
    // Kita return response dasar agar tidak crash.
    return applySecurityHeaders(NextResponse.next());
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
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

  // Tidak ada user dan bukan di halaman publik → redirect ke login
  if (!user && !isOnPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return applySecurityHeaders(NextResponse.redirect(url));
  }

  // Sudah login dan mengakses login page → redirect ke dashboard
  if (user && isOnPublicRoute && pathname !== "/reset-password") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return applySecurityHeaders(NextResponse.redirect(url));
  }

  return applySecurityHeaders(supabaseResponse);
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
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
