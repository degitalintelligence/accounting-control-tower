import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { NotificationRecord } from "@/types/notification";
import { structuredSupabaseError } from "@/lib/supabase/error";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createServiceRoleClient();
  const membershipResult = await admin
    .from("memberships")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const membership = membershipResult as unknown as {
    data: { organization_id: string } | null;
    error: { message: string; code: string; hint: string; details: string } | null;
  };

  if (membership.error) {
    console.error("[notifications] Membership query gagal:", structuredSupabaseError(membership.error));
    return NextResponse.json({ error: "Gagal memuat notifikasi." }, { status: 500 });
  }
  if (!membership.data) return NextResponse.json({ data: [], unread_count: 0 });

  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? "20") || 20));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const result = await admin
    .from("notifications")
    .select("id, event_type, title, body, data, channel, read_at, created_at", { count: "exact" })
    .eq("organization_id", membership.data.organization_id)
    .eq("profile_id", user.id)
    .order("read_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .range(from, to);
  const notifications = result as unknown as {
    data: NotificationRecord[] | null;
    count: number | null;
    error: { message: string; code: string; hint: string; details: string } | null;
  };

  if (notifications.error) {
    console.error("[notifications] Query gagal:", structuredSupabaseError(notifications.error));
    return NextResponse.json({ error: "Gagal memuat notifikasi." }, { status: 500 });
  }

  const unreadResult = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", membership.data.organization_id)
    .eq("profile_id", user.id)
    .is("read_at", null);
  const unread = unreadResult as unknown as { count: number | null; error: { message: string } | null };

  if (unread.error) {
    console.error("[notifications] Unread count gagal:", structuredSupabaseError(unread.error));
    return NextResponse.json({ error: "Gagal menghitung notifikasi." }, { status: 500 });
  }

  return NextResponse.json({
    data: notifications.data ?? [],
    total: notifications.count ?? 0,
    unread_count: unread.count ?? 0,
    page,
    limit,
  });
}
