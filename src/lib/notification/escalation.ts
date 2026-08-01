import type { SupabaseClient } from "@supabase/supabase-js";
import { logAudit } from "@/lib/audit/logger";

type AnyClient = Pick<SupabaseClient, "from">;

type EscalationRule = {
  threshold_hours: number;
  level: "maker" | "team_lead" | "accounting_manager" | "owner";
  priority: "low" | "medium" | "high" | "critical";
  recipient_roles?: string[];
};

type Policy = {
  id: string;
  organization_id: string;
  client_id: string | null;
  rules: unknown;
};

type WorkItem = {
  id: string;
  organization_id: string;
  client_id: string;
  title: string;
  priority: string;
  status: string;
  due_at: string;
};

type Instance = {
  id: string;
  current_level: EscalationRule["level"];
};

type Recipient = {
  profile_id: string;
  role: string;
};

const defaultRules: EscalationRule[] = [
  {
    threshold_hours: 24,
    level: "accounting_manager",
    priority: "high",
    recipient_roles: ["manager", "accounting_manager"],
  },
  {
    threshold_hours: 48,
    level: "owner",
    priority: "critical",
    recipient_roles: ["admin", "owner"],
  },
  {
    threshold_hours: 72,
    level: "owner",
    priority: "critical",
    recipient_roles: ["director"],
  },
];

const levelRank: Record<EscalationRule["level"], number> = {
  maker: 0,
  team_lead: 1,
  accounting_manager: 2,
  owner: 3,
};

const priorityRank: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function parseRules(value: unknown): EscalationRule[] {
  if (!Array.isArray(value)) return defaultRules;

  const rules = value.filter((rule): rule is EscalationRule => {
    if (!rule || typeof rule !== "object") return false;
    const candidate = rule as Record<string, unknown>;
    return (
      typeof candidate.threshold_hours === "number" &&
      Number.isFinite(candidate.threshold_hours) &&
      typeof candidate.level === "string" &&
      candidate.level in levelRank &&
      typeof candidate.priority === "string" &&
      candidate.priority in priorityRank
    );
  });

  return rules.length > 0 ? rules.sort((a, b) => a.threshold_hours - b.threshold_hours) : defaultRules;
}

function getRecipients(rule: EscalationRule): string[] {
  if (rule.recipient_roles && rule.recipient_roles.length > 0) return rule.recipient_roles;
  if (rule.level === "team_lead") return ["team_lead", "manager"];
  if (rule.level === "accounting_manager") return ["manager", "accounting_manager"];
  if (rule.level === "owner") return ["admin", "owner", "director"];
  return ["maker"];
}

async function notifyRecipients(
  admin: AnyClient,
  item: WorkItem,
  policy: Policy,
  rule: EscalationRule,
  overdueHours: number
) {
  const roles = getRecipients(rule);
  const result = await admin
    .from("memberships")
    .select("profile_id, role")
    .eq("organization_id", item.organization_id)
    .eq("is_active", true)
    .in("role", roles);

  const { data: recipients, error } = result as unknown as {
    data: Recipient[] | null;
    error: { message: string; code: string; hint: string; details: string } | null;
  };

  if (error) throw error;

  const dedupPrefix = `escalation:${policy.id}:${item.id}:${rule.threshold_hours}`;
  for (const recipient of recipients ?? []) {
    await admin.from("notifications").upsert(
      {
        profile_id: recipient.profile_id,
        organization_id: item.organization_id,
        event_type: "item_escalated",
        title: "Work item memerlukan eskalasi",
        body: `Work item telah overdue lebih dari ${rule.threshold_hours} jam.`,
        data: {
          work_item_id: item.id,
          escalation_level: rule.level,
          overdue_hours: Math.floor(overdueHours),
        },
        channel: "in_app",
        dedup_key: `${dedupPrefix}:${recipient.profile_id}`,
      },
      { onConflict: "dedup_key", ignoreDuplicates: true }
    );
  }
}

async function recordEscalationEvent(
  admin: AnyClient,
  item: WorkItem,
  policy: Policy,
  rule: EscalationRule,
  overdueHours: number
) {
  const eventKey = `escalation:${policy.id}:${item.id}:${rule.threshold_hours}`;
  const event = await admin
    .from("domain_events")
    .upsert(
      {
        organization_id: item.organization_id,
        event_type: "work_item.escalated",
        aggregate_type: "work_item",
        aggregate_id: item.id,
        event_key: eventKey,
        payload: {
          policy_id: policy.id,
          escalation_level: rule.level,
          threshold_hours: rule.threshold_hours,
          overdue_hours: Math.floor(overdueHours),
        },
      },
      { onConflict: "event_key", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle();

  const { data: domainEvent, error } = event as unknown as {
    data: { id: string } | null;
    error: { message: string; code: string; hint: string; details: string } | null;
  };

  if (error) throw error;
  if (!domainEvent) return;

  await admin.from("outbox_events").upsert(
    {
      domain_event_id: domainEvent.id,
      event_type: "work_item.escalated",
      payload: { event_key: eventKey, work_item_id: item.id },
    },
    { onConflict: "domain_event_id", ignoreDuplicates: true }
  );
}

async function processRule(
  admin: AnyClient,
  item: WorkItem,
  policy: Policy,
  rule: EscalationRule,
  overdueHours: number,
  instance: Instance | null
) {
  if (overdueHours < rule.threshold_hours) return instance;

  const shouldAdvance = !instance || levelRank[rule.level] > levelRank[instance.current_level];
  await notifyRecipients(admin, item, policy, rule, overdueHours);
  await recordEscalationEvent(admin, item, policy, rule, overdueHours);

  if (shouldAdvance) {
    const update = await admin
      .from("escalation_instances")
      .update({ current_level: rule.level, escalated_at: new Date().toISOString() })
      .eq("id", instance?.id ?? "00000000-0000-0000-0000-000000000000")
      .select("id, current_level")
      .maybeSingle();

    if (!instance) {
      const insert = await admin
        .from("escalation_instances")
        .upsert(
          {
            policy_id: policy.id,
            work_item_id: item.id,
            current_level: rule.level,
            notes: `Overdue ${Math.floor(overdueHours)} jam`,
          },
          { onConflict: "policy_id,work_item_id", ignoreDuplicates: false }
        )
        .select("id, current_level")
        .maybeSingle();
      const { data, error } = insert as unknown as { data: Instance | null; error: unknown };
      if (error) throw error;
      return data;
    }

    const { error } = update as unknown as { error: unknown };
    if (error) throw error;
  }

  return instance;
}

export async function runEscalationCheck(admin: AnyClient) {
  const policiesResult = await admin
    .from("escalation_policies")
    .select("id, organization_id, client_id, rules")
    .eq("is_active", true);
  const { data: policies, error: policiesError } = policiesResult as unknown as {
    data: Policy[] | null;
    error: { message: string; code: string; hint: string; details: string } | null;
  };
  if (policiesError) throw policiesError;

  const now = Date.now();
  let escalated = 0;
  let resolved = 0;

  for (const policy of policies ?? []) {
    let itemsQuery = admin
      .from("work_items")
      .select("id, organization_id, client_id, title, priority, status, due_at")
      .eq("organization_id", policy.organization_id)
      .is("deleted_at", null)
      .not("status", "in", "(completed,cancelled)")
      .not("due_at", "is", null);
    if (policy.client_id) itemsQuery = itemsQuery.eq("client_id", policy.client_id);

    const itemsResult = await itemsQuery;
    const { data: items, error: itemsError } = itemsResult as unknown as {
      data: WorkItem[] | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };
    if (itemsError) throw itemsError;

    for (const item of items ?? []) {
      const overdueHours = (now - new Date(item.due_at).getTime()) / 3_600_000;
      const instanceResult = await admin
        .from("escalation_instances")
        .select("id, current_level")
        .eq("policy_id", policy.id)
        .eq("work_item_id", item.id)
        .is("resolved_at", null)
        .maybeSingle();
      const { data: instance, error: instanceError } = instanceResult as unknown as {
        data: Instance | null;
        error: unknown;
      };
      if (instanceError) throw instanceError;

      if (overdueHours > 0) {
        for (const rule of parseRules(policy.rules)) {
          const previousPriority = item.priority;
          await processRule(admin, item, policy, rule, overdueHours, instance);
          if (overdueHours >= rule.threshold_hours && priorityRank[rule.priority] > priorityRank[previousPriority]) {
            const update = await admin
              .from("work_items")
              .update({ priority: rule.priority, updated_at: new Date().toISOString() })
              .eq("id", item.id)
              .eq("organization_id", item.organization_id)
              .neq("priority", rule.priority)
              .select("id");
            const { data: updatedItems, error } = update as unknown as { data: { id: string }[] | null; error: unknown };
            if (error) throw error;
            if ((updatedItems ?? []).length > 0) {
              await logAudit(admin, {
                organizationId: item.organization_id,
                actorId: null,
                action: "work_item.escalated",
                entityType: "work_item",
                entityId: item.id,
                oldValue: { priority: previousPriority },
                newValue: { priority: rule.priority, threshold_hours: rule.threshold_hours },
                metadata: { policy_id: policy.id, escalation_level: rule.level },
              });
              escalated += 1;
            }
          }
        }
      } else if (instance) {
        const update = await admin
          .from("escalation_instances")
          .update({ resolved_at: new Date().toISOString() })
          .eq("id", instance.id)
          .is("resolved_at", null);
        const { error } = update as unknown as { error: unknown };
        if (error) throw error;
        resolved += 1;
      }
    }
  }

  return { escalated, resolved };
}
