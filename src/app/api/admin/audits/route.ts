import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthContext, canAccessClient, canManageOrganization } from "@/lib/authorization";

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  if (!canManageOrganization(auth.context.memberships.find((item) => item.client_id === null)?.role)) return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  const samples = (auth.context.admin as unknown as SupabaseClient).from("audit_samples").select("id, organization_id, auditor_id, work_item_id, rating, notes, sampled_at").eq("organization_id", auth.context.organizationId).order("sampled_at", { ascending: false });
  const result = await samples;
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  const workItemIds = (result.data ?? []).map((item: { work_item_id: string }) => item.work_item_id);
  const findings = workItemIds.length ? await auth.context.admin.from("audit_findings").select("id, audit_sample_id, finding_type, severity, description, evidence, root_cause, owner_id, due_date, corrective_task_id, created_at").in("audit_sample_id", (result.data ?? []).map((item: { id: string }) => item.id)) : { data: [], error: null };
  return NextResponse.json({ samples: result.data ?? [], findings: findings.data ?? [] });
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  if (!canManageOrganization(auth.context.memberships.find((item) => item.client_id === null)?.role)) return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  const body = await request.json() as { action?: "sample" | "finding"; id?: string; work_item_id?: string; rating?: string | null; notes?: string | null; audit_sample_id?: string; finding_type?: string; severity?: string; description?: string; evidence?: string | null; root_cause?: string | null; owner_id?: string | null; due_date?: string | null; corrective_task_id?: string | null };
  const admin = auth.context.admin;
  const db = admin as unknown as SupabaseClient;
  if (body.action === "sample") {
    if (!body.work_item_id) return NextResponse.json({ error: "Work item wajib diisi." }, { status: 400 });
    const item = await db.from("work_items").select("id, client_id").eq("id", body.work_item_id).eq("organization_id", auth.context.organizationId).maybeSingle();
    if (!item.data || !canAccessClient(auth.context, item.data.client_id)) return NextResponse.json({ error: "Work item tidak dapat diakses." }, { status: 403 });
    const result = await db.from("audit_samples").insert({ organization_id: auth.context.organizationId, auditor_id: auth.context.userId, work_item_id: body.work_item_id, rating: body.rating ?? null, notes: body.notes ?? null }).select("id, organization_id, auditor_id, work_item_id, rating, notes, sampled_at").single();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    return NextResponse.json(result.data, { status: 201 });
  }
  if (body.action === "finding" && body.audit_sample_id && body.finding_type && body.description) {
    const sample = await db.from("audit_samples").select("id, work_item_id").eq("id", body.audit_sample_id).eq("organization_id", auth.context.organizationId).maybeSingle();
    if (!sample.data) return NextResponse.json({ error: "Audit sample tidak dapat diakses." }, { status: 403 });
    const item = await db.from("work_items").select("client_id").eq("id", sample.data.work_item_id).eq("organization_id", auth.context.organizationId).maybeSingle();
    if (!item.data || !canAccessClient(auth.context, item.data.client_id)) return NextResponse.json({ error: "Audit sample tidak dapat diakses." }, { status: 403 });
    if (body.owner_id) {
      const owner = await db.from("memberships").select("profile_id").eq("organization_id", auth.context.organizationId).eq("profile_id", body.owner_id).eq("is_active", true).limit(1).maybeSingle();
      if (!owner.data) return NextResponse.json({ error: "Owner bukan anggota tenant." }, { status: 400 });
    }
    const result = await db.from("audit_findings").insert({ audit_sample_id: body.audit_sample_id, finding_type: body.finding_type, severity: body.severity ?? "minor", description: body.description, evidence: body.evidence ?? null, root_cause: body.root_cause ?? null, owner_id: body.owner_id ?? null, due_date: body.due_date ?? null, corrective_task_id: body.corrective_task_id ?? null }).select("id, audit_sample_id, finding_type, severity, description, evidence, root_cause, owner_id, due_date, corrective_task_id, created_at").single();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    return NextResponse.json(result.data, { status: 201 });
  }
  return NextResponse.json({ error: "Payload audit tidak valid." }, { status: 400 });
}
