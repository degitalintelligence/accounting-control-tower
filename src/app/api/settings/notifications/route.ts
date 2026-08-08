import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { notificationPreferencesSchema, validationMessage } from "@/lib/validation/schemas";
import { getAuthContext, requirePermission } from "@/lib/authorization";

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const admin = createServiceRoleClient();
  const { data, error } = await admin.from("notification_preferences").select("email_enabled, email_on_assignment, email_on_status_change, email_on_deadline, email_on_overdue, email_on_review").eq("profile_id", auth.context.userId).maybeSingle();
  if (error) return NextResponse.json({ error: "Preferensi gagal dimuat." }, { status: 500 });
  return NextResponse.json({ data: data ?? { email_enabled: true, email_on_assignment: true, email_on_status_change: true, email_on_deadline: true, email_on_overdue: true, email_on_review: true } });
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "organization.manage");
  if (denied) return denied;
  const user = { id: auth.context.userId };
  const parsed = notificationPreferencesSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const admin = createServiceRoleClient();
  const { data, error } = await admin.from("notification_preferences").upsert({ profile_id: user.id, ...parsed.data, updated_at: new Date().toISOString() } as never).select("email_enabled, email_on_assignment, email_on_status_change, email_on_deadline, email_on_overdue, email_on_review").single();
  if (error) return NextResponse.json({ error: "Preferensi gagal disimpan." }, { status: 500 });
  return NextResponse.json({ data });
}
