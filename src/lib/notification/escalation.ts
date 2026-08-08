import type { SupabaseClient } from "@supabase/supabase-js";
import { logAudit } from "@/lib/audit/logger";
import { publishNotificationEvent } from "./publisher";

type AnyClient = Pick<SupabaseClient, "from">;

type EscalationRule = {
  threshold_hours: number;
  level: "maker" | "team_leader" | "administrator" | "owner";
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
    level: "team_leader",
    priority: "high",
    recipient_roles: ["team_leader"],
  },
  {
    threshold_hours: 48,
    level: "owner",
    priority: "critical",
    recipient_roles: ["administrator", "owner"],
  },
];

const levelRank: Record<EscalationRule["level"], number> = {
  maker: 0,
  team_leader: 1,
  administrator: 2,
  owner: 3,
};

const priorityRank: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function normalizeLevel(level: string): EscalationRule["level"] | null {
  if (level === "maker" || level === "team_leader" || level === "administrator" || level === "owner") return level;
  if (level === "admin") return "administrator";
  return null;
}

function parseRules(value: unknown): EscalationRule[] {
  if (!Array.isArray(value)) return defaultRules;

  const rules = value.flatMap((rule): EscalationRule[] => {
    if (!rule || typeof rule !== "object") return [];
    const candidate = rule as Record<string, unknown>;
    const level = typeof candidate.level === "string" ? normalizeLevel(candidate.level) : null;
    if (
      typeof candidate.threshold_hours !== "number" ||
      !Number.isFinite(candidate.threshold_hours) ||
      !level ||
      typeof candidate.priority !== "string" ||
      !(candidate.priority in priorityRank)
    ) {
      return [];
    }

    const recipientRoles = Array.isArray(candidate.recipient_roles)
      ? candidate.recipient_roles.filter((role): role is string => typeof role === "string").map(normalizeRole)
      : undefined;

    return [{
      threshold_hours: candidate.threshold_hours,
      level,
      priority: candidate.priority as EscalationRule["priority"],
      ...(recipientRoles?.length ? { recipient_roles: recipientRoles } : {}),
    }];
  });

  return rules.length > 0 ? rules.sort((a, b) => a.threshold_hours - b.threshold_hours) : defaultRules;
}

function normalizeRole(role: string): string {
  if (role === "admin" || role === "administrator") return "administrator";
  return role;
}

function getRecipients(rule: EscalationRule): string[] {
  if (rule.recipient_roles && rule.recipient_roles.length > 0) return [...new Set(rule.recipient_roles.map(normalizeRole))];
  if (rule.level === "team_leader") return ["team_leader"];
  if (rule.level === "owner") return ["administrator", "owner"];
  return ["staff"];
}

async function getRecipientIds(
  admin: AnyClient,
  item: WorkItem,
  policy: Policy,
  rule: EscalationRule
) {
  const roles = getRecipients(rule);
  const result = await admin
    .from("memberships")
    .select("profile_id, role_id, role, organization_roles!inner(role_key)")
    .eq("organization_id", item.organization_id)
    .eq("is_active", true)
    .in("organization_roles.role_key", roles);

  const { data: recipients, error } = result as unknown as {
    data: Recipient[] | null;
    error: { message: string; code: string; hint: string; details: string } | null;
  };

  if (error) throw error;

  return (recipients ?? []).map((recipient) => recipient.profile_id);
}

async function recordEscalationEvent(
  admin: AnyClient,
  item: WorkItem,
  policy: Policy,
  rule: EscalationRule,
  overdueHours: number,
  profileIds: string[]
) {
  if (!profileIds.length) return;
  await publishNotificationEvent(admin, {
    eventType: "item_escalated",
    organizationId: item.organization_id,
    aggregateType: "work_item",
    aggregateId: item.id,
    profileIds,
    title: "Work item memerlukan eskalasi",
    body: `Work item telah overdue lebih dari ${rule.threshold_hours} jam.`,
    data: { work_item_id: item.id, escalation_level: rule.level, overdue_hours: Math.floor(overdueHours) },
    dedupKey: `escalation:${policy.id}:${item.id}:${rule.threshold_hours}`,
  });
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
  const profileIds = await getRecipientIds(admin, item, policy, rule);
  await recordEscalationEvent(admin, item, policy, rule, overdueHours, profileIds);

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
    .select("id, organization_id, client_id, rules, organizations!inner(deleted_at)")
    .eq("is_active", true)
    .is("organizations.deleted_at", null);
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
      .select("id, organization_id, client_id, title, priority, status, due_at, organizations!inner(deleted_at)")
      .is("organizations.deleted_at", null)
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
