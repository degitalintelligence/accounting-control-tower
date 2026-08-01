import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isValidTimezone, previewOccurrences, validateRRule } from "@/lib/recurrence/rules";
import { holidayHandlingValues } from "@/lib/recurrence/rules";

type Context = { params: Promise<{ id: string }> };

async function getScope(userId: string) {
  const admin = createServiceRoleClient();
  const membership = await admin.from("memberships").select("organization_id").eq("profile_id", userId).eq("is_active", true).limit(1).single();
  const data = membership as unknown as { data: { organization_id: string } | null; error: { message: string } | null };
  return { admin, organizationId: data.data?.organization_id ?? null, error: data.error };
}

async function authorize(request: NextRequest, context: Context) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { id } = await context.params;
  const scope = await getScope(user.id);
  if (!scope.organizationId) return { response: NextResponse.json({ error: "Organisasi tidak ditemukan." }, { status: 403 }) };
  const template = await scope.admin.from("task_templates").select("id, organization_id").eq("id", id).eq("organization_id", scope.organizationId).is("deleted_at", null).single();
  const result = template as unknown as { data: { id: string; organization_id: string } | null; error: { message: string } | null };
  if (result.error || !result.data) return { response: NextResponse.json({ error: "Template tidak ditemukan." }, { status: 404 }) };
  return { admin: scope.admin, templateId: id, organizationId: scope.organizationId };
}

export async function GET(request: NextRequest, context: Context) {
  const auth = await authorize(request, context);
  if (auth.response) return auth.response;
  const result = await auth.admin!.from("recurrence_rules").select("id, template_id, rrule, timezone, generation_lead_days, holiday_handling, skip_weekends, created_at, updated_at").eq("template_id", auth.templateId!).is("deleted_at", null).maybeSingle();
  const data = result as unknown as { data: unknown | null; error: { message: string } | null };
  if (data.error) return NextResponse.json({ error: "Gagal memuat aturan pengulangan." }, { status: 500 });
  const storedRule = data.data as { rrule: string; timezone: string; skip_weekends: boolean; holiday_handling: string } | null;
  const preview = storedRule ? previewOccurrences(storedRule.rrule, storedRule.timezone, new Date(), 5, { skipWeekends: storedRule.skip_weekends, holidayHandling: storedRule.holiday_handling as "allow" | "skip" | "next_working_day" }) : [];
  return NextResponse.json({ data: data.data, preview });
}

export async function PUT(request: NextRequest, context: Context) {
  const auth = await authorize(request, context);
  if (auth.response) return auth.response;
  const body = await request.json() as { rrule?: string; timezone?: string; generation_lead_days?: number; holiday_handling?: string; skip_weekends?: boolean };
  const validationError = validateRRule(body.rrule);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const timezone = body.timezone || "Asia/Jakarta";
  if (!isValidTimezone(timezone)) return NextResponse.json({ error: "Timezone tidak valid." }, { status: 400 });
  if (!holidayHandlingValues.includes((body.holiday_handling || "skip") as never)) return NextResponse.json({ error: "Penanganan hari libur tidak valid." }, { status: 400 });
  const leadDays = Number(body.generation_lead_days ?? 0);
  if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 365) return NextResponse.json({ error: "Lead time harus bilangan bulat 0 sampai 365." }, { status: 400 });
  const values = { rrule: body.rrule!.trim(), timezone, generation_lead_days: leadDays, holiday_handling: body.holiday_handling || "skip", skip_weekends: Boolean(body.skip_weekends), updated_at: new Date().toISOString(), deleted_at: null };
  const existing = await auth.admin!.from("recurrence_rules").select("id").eq("template_id", auth.templateId!).maybeSingle();
  const current = existing as unknown as { data: { id: string } | null; error: { message: string } | null };
  const result = current.data
    ? await auth.admin!.from("recurrence_rules").update(values as never).eq("id", current.data.id).select("id, template_id, rrule, timezone, generation_lead_days, holiday_handling, skip_weekends, created_at, updated_at").single()
    : await auth.admin!.from("recurrence_rules").insert({ template_id: auth.templateId, ...values } as never).select("id, template_id, rrule, timezone, generation_lead_days, holiday_handling, skip_weekends, created_at, updated_at").single();
  const data = result as unknown as { data: unknown | null; error: { message: string } | null };
  if (data.error) return NextResponse.json({ error: "Gagal menyimpan aturan pengulangan." }, { status: 500 });
  return NextResponse.json({ data: data.data, preview: previewOccurrences(values.rrule, values.timezone, new Date(), 5, { skipWeekends: values.skip_weekends, holidayHandling: values.holiday_handling as "allow" | "skip" | "next_working_day" }) });
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await authorize(request, context);
  if (auth.response) return auth.response;
  const result = await auth.admin!.from("recurrence_rules").update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() } as never).eq("template_id", auth.templateId!).is("deleted_at", null);
  const data = result as unknown as { error: { message: string } | null };
  if (data.error) return NextResponse.json({ error: "Gagal menghapus aturan pengulangan." }, { status: 500 });
  return NextResponse.json({ data: null });
}
