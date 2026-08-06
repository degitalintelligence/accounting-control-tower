import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthContext, canAccessOptionalClient, requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit/logger";
import { validateEscalationRules } from "@/lib/validation/policy";

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "escalations.view");
  if (denied) return denied;
  const db = auth.context.admin as unknown as SupabaseClient;
  let policiesQuery = db.from("escalation_policies").select("id, organization_id, client_id, name, description, rules, is_active, created_at, updated_at").eq("organization_id", auth.context.organizationId).order("name");
  if (!auth.context.isOrgWide) policiesQuery = policiesQuery.in("client_id", auth.context.clientIds);
  let instancesQuery = db.from("escalation_instances").select("id, policy_id, work_item_id, current_level, escalated_at, resolved_at, notes, escalation_policies!inner(id, organization_id, client_id, name, rules), work_items!inner(id, organization_id, client_id, title, status, due_at, priority, clients(id, name))").eq("escalation_policies.organization_id", auth.context.organizationId).eq("work_items.organization_id", auth.context.organizationId).order("escalated_at", { ascending: false });
  if (!auth.context.isOrgWide) instancesQuery = instancesQuery.in("escalation_policies.client_id", auth.context.clientIds).in("work_items.client_id", auth.context.clientIds);
  const [policies, instances] = await Promise.all([policiesQuery, instancesQuery]);
  if (policies.error) return NextResponse.json({ error: policies.error.message }, { status: 400 });
  if (instances.error) return NextResponse.json({ error: instances.error.message }, { status: 400 });

  const instanceRows = (instances.data ?? []) as Array<Record<string, unknown>>;
  const workItemIds = instanceRows.map((row) => row.work_item_id).filter((id): id is string => typeof id === "string");
  const notificationsQuery = workItemIds.length
    ? db.from("notifications").select("id, profile_id, event_type, data, sent_at, created_at, notification_deliveries(id, channel, status, delivered_at, created_at), profiles(id, display_name, email)").eq("organization_id", auth.context.organizationId).eq("event_type", "item_escalated").in("data->>work_item_id", workItemIds)
    : null;
  const notifications = notificationsQuery ? await notificationsQuery : { data: [], error: null };
  if (notifications.error) return NextResponse.json({ error: notifications.error.message }, { status: 400 });

  const notificationRows = (notifications.data ?? []) as Array<Record<string, unknown>>;
  const notificationsByWorkItem = new Map<string, Array<Record<string, unknown>>>();
  for (const notification of notificationRows) {
    const data = notification.data as Record<string, unknown> | null;
    const workItemId = typeof data?.work_item_id === "string" ? data.work_item_id : null;
    if (!workItemId) continue;
    const current = notificationsByWorkItem.get(workItemId) ?? [];
    current.push(notification);
    notificationsByWorkItem.set(workItemId, current);
  }

  const enrichedInstances = instanceRows.map((row) => {
    const policy = row.escalation_policies as { id: string; organization_id: string; client_id: string | null; name: string; rules: unknown };
    const workItem = row.work_items as { id: string; organization_id: string; client_id: string; title: string; status: string; due_at: string | null; priority: string; clients: { id: string; name: string } | null };
    const rules = Array.isArray(policy.rules) ? policy.rules : [];
    const matchingRule = rules.find((rule) => rule && typeof rule === "object" && (rule as Record<string, unknown>).level === row.current_level) as Record<string, unknown> | undefined;
    const itemNotifications = notificationsByWorkItem.get(workItem.id) ?? [];
    return {
      ...row,
      escalation_policies: { ...policy, rules },
      work_items: workItem,
      priority: workItem.priority ?? null,
      client: workItem.clients ?? null,
      threshold_hours: typeof matchingRule?.threshold_hours === "number" ? matchingRule.threshold_hours : null,
      recipients: itemNotifications.map((notification) => ({
        profile: notification.profiles ?? null,
        notification_id: notification.id,
        sent_at: notification.sent_at ?? null,
        deliveries: notification.notification_deliveries ?? [],
      })),
      notification_delivery_status: itemNotifications.flatMap((notification) => Array.isArray(notification.notification_deliveries) ? notification.notification_deliveries : []),
    };
  });

  return NextResponse.json({ policies: policies.data ?? [], instances: enrichedInstances });
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "escalations.manage");
  if (denied) return denied;
  const body = await request.json() as { action?: "resolve"; id?: string; name?: string; description?: string | null; client_id?: string | null; rules?: unknown; is_active?: boolean };
  const db = auth.context.admin as unknown as SupabaseClient;
  if (body.action === "resolve") {
    if (!body.id) return NextResponse.json({ error: "ID eskalasi wajib diisi." }, { status: 400 });
    const existing = await db.from("escalation_instances").select("id, policy_id, work_item_id, current_level, escalated_at, resolved_at, notes, escalation_policies!inner(organization_id, client_id), work_items!inner(organization_id, client_id, title)").eq("id", body.id).eq("escalation_policies.organization_id", auth.context.organizationId).eq("work_items.organization_id", auth.context.organizationId).maybeSingle();
    if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 400 });
    const row = existing.data as { id: string; policy_id: string; work_item_id: string; resolved_at: string | null; escalation_policies: { client_id: string | null }; work_items: { client_id: string | null; title: string } } | null;
    if (!row || !canAccessOptionalClient(auth.context, row.escalation_policies.client_id) || !canAccessOptionalClient(auth.context, row.work_items.client_id)) return NextResponse.json({ error: "Eskalasi tidak ditemukan." }, { status: 404 });
    if (row.resolved_at) return NextResponse.json({ error: "Eskalasi sudah diselesaikan." }, { status: 409 });
    const resolvedAt = new Date().toISOString();
    const result = await db.from("escalation_instances").update({ resolved_at: resolvedAt }).eq("id", body.id).is("resolved_at", null).select("id, policy_id, work_item_id, current_level, escalated_at, resolved_at, notes").single();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    await logAudit(db, { organizationId: auth.context.organizationId, actorId: auth.context.userId, action: "escalation_instance.resolved", entityType: "escalation_instance", entityId: body.id, oldValue: { resolved_at: null }, newValue: { resolved_at: resolvedAt }, metadata: { policy_id: row.policy_id, work_item_id: row.work_item_id } });
    return NextResponse.json(result.data);
  }
  if (!body.name?.trim() || !canAccessOptionalClient(auth.context, body.client_id)) return NextResponse.json({ error: "Nama dan client yang valid wajib diisi." }, { status: 400 });
  const validation = validateEscalationRules(body.rules);
  if (validation.error) return NextResponse.json({ error: validation.error }, { status: 400 });
  const values = { organization_id: auth.context.organizationId, client_id: body.client_id ?? null, name: body.name.trim(), description: body.description ?? null, rules: validation.rules, is_active: body.is_active ?? true, updated_at: new Date().toISOString() };
  const result = body.id ? await db.from("escalation_policies").update(values).eq("id", body.id).eq("organization_id", auth.context.organizationId).select("id, client_id, name, description, rules, is_active, created_at, updated_at").single() : await db.from("escalation_policies").insert(values).select("id, client_id, name, description, rules, is_active, created_at, updated_at").single();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  return NextResponse.json(result.data, { status: body.id ? 200 : 201 });
}

export async function DELETE(request: Request) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "escalations.manage");
  if (denied) return denied;

  const body = await request.json().catch(() => null) as { id?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "ID kebijakan wajib diisi." }, { status: 400 });

  const db = auth.context.admin as unknown as SupabaseClient;
  let existingQuery = db
    .from("escalation_policies")
    .select("id, client_id, name, description, rules, is_active")
    .eq("id", body.id)
    .eq("organization_id", auth.context.organizationId);
  if (!auth.context.isOrgWide) existingQuery = existingQuery.in("client_id", auth.context.clientIds);
  const existing = await existingQuery.maybeSingle();
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 400 });
  if (!existing.data) return NextResponse.json({ error: "Kebijakan tidak ditemukan." }, { status: 404 });

  const instance = await db
    .from("escalation_instances")
    .select("id")
    .eq("policy_id", body.id)
    .limit(1)
    .maybeSingle();
  if (instance.error) return NextResponse.json({ error: instance.error.message }, { status: 400 });

  if (instance.data) {
    const result = await db
      .from("escalation_policies")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", body.id)
      .eq("organization_id", auth.context.organizationId);
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });

    await logAudit(db, {
      organizationId: auth.context.organizationId,
      actorId: auth.context.userId,
      action: "escalation_policy.deactivated",
      entityType: "escalation_policy",
      entityId: body.id,
      oldValue: existing.data as Record<string, unknown>,
      newValue: { is_active: false, reason: "policy_has_escalation_history" },
    });

    return NextResponse.json({
      ok: true,
      mode: "deactivated",
      message: "Kebijakan memiliki histori eskalasi dan dinonaktifkan agar histori tetap aman.",
    });
  }

  const result = await db
    .from("escalation_policies")
    .delete()
    .eq("id", body.id)
    .eq("organization_id", auth.context.organizationId);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });

  await logAudit(db, {
    organizationId: auth.context.organizationId,
    actorId: auth.context.userId,
    action: "escalation_policy.deleted",
    entityType: "escalation_policy",
    entityId: body.id,
    oldValue: existing.data as Record<string, unknown>,
  });

  return NextResponse.json({
    ok: true,
    mode: "deleted",
    message: "Kebijakan berhasil dihapus.",
  });
}
