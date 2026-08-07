import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  const target = next === "/reset-password" || next === "/dashboard" || next === "/onboarding/organization" ? next : "/dashboard";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const redirectUrl = appUrl ? new URL(target, appUrl) : new URL("/login?error=auth_callback", request.url);
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      const admin = createServiceRoleClient();
      const membership = user
        ? await admin.from("memberships").select("id, organizations!inner(id)").eq("profile_id", user.id).eq("is_active", true).is("organizations.deleted_at", null).limit(1)
        : { data: [], error: null };
      if (user && !membership.error && membership.data?.length) return NextResponse.redirect(redirectUrl);
      if (user && !membership.error) return NextResponse.redirect(new URL("/onboarding/organization", appUrl ?? request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth_callback", request.url));
}
