import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthContext, canAccessClient, requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit/logger";

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "audit.view");
  if (denied) return denied;
  const db = auth.context.admin as unknown as SupabaseClient;
  let workItems = db.from("work_items").select("id, client_id").eq("organization_id", auth.context.organizationId);
  if (!auth.context.isOrgWide) workItems = workItems.in("client_id", auth.context.clientIds);
  const workItemResult = await workItems;
  if (workItemResult.error) return NextResponse.json({ error: workItemResult.error.message }, { status: 400 });
  const workItemIds = (workItemResult.data ?? []).map((item: { id: string }) => item.id);
  if (!workItemIds.length) return NextResponse.json({ samples: [], findings: [] });
  const samples = db.from("audit_samples").select("id, organization_id, auditor_id, work_item_id, rating, notes, sampled_at").eq("organization_id", auth.context.organizationId).in("work_item_id", workItemIds).order("sampled_at", { ascending: false });
  const result = await samples;
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  const findings = result.data?.length ? await db.from("audit_findings").select("id, client_id, audit_sample_id, finding_type, severity, description, evidence, root_cause, owner_id, due_date, corrective_task_id, status, resolution, resolved_by, resolved_at, created_at, updated_at").in("audit_sample_id", (result.data ?? []).map((item: { id: string }) => item.id)) : { data: [], error: null };
  if (findings.error) return NextResponse.json({ error: findings.error.message }, { status: 400 });
  return NextResponse.json({ samples: result.data ?? [], findings: findings.data ?? [] });
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "audit.manage");
  if (denied) return denied;
  const body = await request.json() as { action?: "sample" | "finding" | "auto_sample" | "update_finding"; id?: string; work_item_id?: string; rating?: string | null; notes?: string | null; audit_sample_id?: string; finding_type?: string; severity?: string; description?: string; evidence?: string | null; root_cause?: string | null; owner_id?: string | null; due_date?: string | null; corrective_task_id?: string | null; sample_size?: number; status?: string; resolution?: string | null };
  const admin = auth.context.admin;
  const db = admin as unknown as SupabaseClient;
  if (body.action === "update_finding" && body.id) {
    const statuses = ["open", "in_progress", "remediated", "accepted", "closed", "reopened"];
    if (!body.status || !statuses.includes(body.status)) return NextResponse.json({ error: "Status finding tidak valid." }, { status: 400 });
    if (["remediated", "accepted", "closed"].includes(body.status) && !body.resolution?.trim()) return NextResponse.json({ error: "Resolution wajib untuk status penyelesaian." }, { status: 400 });
    const existing = await db.from("audit_findings").select("id, client_id, audit_sample_id, status, resolved_by, resolved_at").eq("id", body.id).maybeSingle();
    if (!existing.data) return NextResponse.json({ error: "Finding tidak ditemukan." }, { status: 404 });
    if (!canAccessClient(auth.context, existing.data.client_id)) return NextResponse.json({ error: "Finding tidak dapat diakses." }, { status: 403 });
    const result = await db.from("audit_findings").update({ status: body.status, resolution: body.resolution?.trim() || null, resolved_by: ["remediated", "accepted", "closed"].includes(body.status) ? auth.context.userId : null, resolved_at: ["remediated", "accepted", "closed"].includes(body.status) ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", body.id).select("id, status, resolution, resolved_by, resolved_at, updated_at").single();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    await logAudit(db, { organizationId: auth.context.organizationId, actorId: auth.context.userId, action: "audit_finding.status_updated", entityType: "audit_finding", entityId: body.id, oldValue: { status: existing.data.status, resolved_by: existing.data.resolved_by, resolved_at: existing.data.resolved_at }, newValue: { status: result.data.status, resolved_by: result.data.resolved_by, resolved_at: result.data.resolved_at } });
    return NextResponse.json(result.data);
  }
  if (body.action === "auto_sample") {
    const result = await (db as unknown as { rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: number | null; error: { message: string } | null }> }).rpc("auto_sample_audits", { p_organization_id: auth.context.organizationId, p_auditor_id: auth.context.userId, p_sample_size: body.sample_size ?? null });
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    await logAudit(db, {
      organizationId: auth.context.organizationId,
      actorId: auth.context.userId,
      action: "audit_samples.auto_created",
      entityType: "audit_sampling_run",
      entityId: auth.context.organizationId,
      newValue: {
        inserted: result.data ?? 0,
        sample_size: body.sample_size ?? null,
      },
      metadata: { creation_mode: "automatic" },
    });
    return NextResponse.json({ inserted: result.data ?? 0 }, { status: 201 });
  }
  if (body.action === "sample") {
    if (!body.work_item_id) return NextResponse.json({ error: "Work item wajib diisi." }, { status: 400 });
    const item = await db.from("work_items").select("id, client_id").eq("id", body.work_item_id).eq("organization_id", auth.context.organizationId).maybeSingle();
    if (!item.data || !canAccessClient(auth.context, item.data.client_id)) return NextResponse.json({ error: "Work item tidak dapat diakses." }, { status: 403 });
    const result = await db.from("audit_samples").insert({ organization_id: auth.context.organizationId, auditor_id: auth.context.userId, work_item_id: body.work_item_id, rating: body.rating ?? null, notes: body.notes ?? null }).select("id, organization_id, auditor_id, work_item_id, rating, notes, sampled_at").single();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    await logAudit(db, { organizationId: auth.context.organizationId, actorId: auth.context.userId, action: "audit_sample.created", entityType: "audit_sample", entityId: result.data.id, newValue: { work_item_id: result.data.work_item_id, rating: result.data.rating }, metadata: { client_id: item.data.client_id, creation_mode: "manual" } });
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
    const severity = (body.severity ?? "minor").toLowerCase();
    if (!["minor", "moderate", "major", "critical"].includes(severity)) return NextResponse.json({ error: "Severity finding tidak valid." }, { status: 400 });
    if (["major", "critical"].includes(severity) && !body.due_date) return NextResponse.json({ error: "Due date wajib untuk finding Major atau Critical." }, { status: 400 });
    const rpcResult = await db.rpc("create_audit_finding_with_corrective_action" as never, {
      p_organization_id: auth.context.organizationId,
      p_audit_sample_id: body.audit_sample_id,
      p_finding_type: body.finding_type,
      p_severity: severity,
      p_description: body.description,
      p_evidence: body.evidence ?? null,
      p_root_cause: body.root_cause ?? null,
      p_owner_id: body.owner_id ?? null,
      p_due_date: body.due_date ?? null,
      p_actor_id: auth.context.userId,
    } as never);
    const result = rpcResult as unknown as { data: Record<string, unknown> | null; error: { message: string } | null };
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    const findingId = typeof result.data?.id === "string" ? result.data.id : null;
    if (!findingId) return NextResponse.json({ error: "Finding berhasil dibuat tetapi ID finding tidak dikembalikan." }, { status: 500 });
    await logAudit(db, { organizationId: auth.context.organizationId, actorId: auth.context.userId, action: "audit_finding.created", entityType: "audit_finding", entityId: findingId, newValue: { audit_sample_id: body.audit_sample_id, finding_type: body.finding_type, severity, owner_id: body.owner_id ?? null, due_date: body.due_date ?? null, corrective_task_id: result.data?.corrective_task_id ?? null }, metadata: { client_id: item.data.client_id } });
    return NextResponse.json(result.data, { status: 201 });
  }
  return NextResponse.json({ error: "Payload audit tidak valid." }, { status: 400 });
}
