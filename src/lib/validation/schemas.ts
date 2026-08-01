import { z } from "zod";
import { holidayHandlingValues, validateRRule } from "@/lib/recurrence/rules";

const uuid = z.string().uuid();
const nullableUuid = uuid.nullable().optional();
const nullableText = z.string().trim().max(10000).nullable().optional();
const dateTime = z.string().datetime({ offset: true }).nullable().optional();
const recurrenceRRule = z.string().trim().min(1).max(500).refine((value) => !validateRRule(value), "RRULE tidak valid.");
export const recurrenceRuleSchema = z.object({
  rrule: recurrenceRRule,
  timezone: z.string().trim().min(1).max(100),
  generation_lead_days: z.number().int().min(0).max(365).optional(),
  holiday_handling: z.enum(holidayHandlingValues).optional(),
  skip_weekends: z.boolean().optional(),
}).strict();

export const clientCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  timezone: z.string().trim().min(1).max(100).optional(),
}).strict();

export const clientUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  timezone: z.string().trim().min(1).max(100).optional(),
}).strict();

export const organizationUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  timezone: z.string().trim().min(1).max(100),
  currency: z.string().trim().min(3).max(10),
}).strict();

export const memberCreateSchema = z.object({
  email: z.string().trim().email().max(320),
  display_name: z.string().trim().min(1).max(200),
  role: z.enum(["admin", "finance_manager", "finance_staff"]),
  client_id: uuid.nullable().optional(),
  entity_id: uuid.nullable().optional(),
}).strict();

export const memberUpdateSchema = memberCreateSchema.omit({ email: true }).partial().extend({
  is_active: z.boolean().optional(),
});

export const notificationPreferencesSchema = z.object({
  email_enabled: z.boolean(),
  email_on_assignment: z.boolean(),
  email_on_status_change: z.boolean(),
  email_on_deadline: z.boolean(),
  email_on_overdue: z.boolean(),
  email_on_review: z.boolean(),
}).strict();

export const workItemCreateSchema = z.object({
  title: z.string().trim().min(1).max(500),
  type: z.enum(["routine", "project", "ad_hoc", "report"]),
  client_id: uuid,
  description: nullableText,
  acceptance_criteria: nullableText,
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  risk_level: z.enum(["low", "medium", "high", "critical"]).optional(),
  due_at: dateTime,
  start_at: dateTime,
  project_id: nullableUuid,
  parent_id: nullableUuid,
  entity_id: nullableUuid,
  section_id: nullableUuid,
  checklist_template_id: nullableUuid,
  assigneeId: uuid.optional(),
  assigneeRole: z.enum(["maker", "checker", "approver"]).optional(),
  business_period: z.string().trim().min(4).max(20).nullable().optional(),
  duplicate_action: z.enum(["warn", "allow"]).default("warn"),
  amount: z.number().finite().min(0).nullable().optional(),
  currency_code: z.string().regex(/^[A-Z]{3}$/).default("IDR"),
}).strict();

export const workItemUpdateSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  description: nullableText,
  acceptance_criteria: nullableText,
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  risk_level: z.enum(["low", "medium", "high", "critical"]).optional(),
  due_at: dateTime,
  start_at: dateTime,
  review_due_at: dateTime,
  client_due_at: dateTime,
  project_id: nullableUuid,
  parent_id: nullableUuid,
  entity_id: nullableUuid,
  section_id: nullableUuid,
  checklist_template_id: nullableUuid,
  weight: z.number().finite().min(0).max(100).optional(),
  is_optional: z.boolean().optional(),
});

export const transitionSchema = z.object({
  to_status: z.enum(["draft", "assigned", "in_progress", "blocked", "submitted", "under_review", "revision_required", "resubmitted", "awaiting_approval", "approved", "completed", "cancelled"]),
  reason: z.string().trim().max(5000).optional(),
});

export const assignmentSchema = z.object({
  profile_id: uuid,
  role: z.enum(["maker", "checker", "approver"]),
  leave_warning_acknowledged: z.boolean().optional(),
}).strict();

export const plannedLeaveCreateSchema = z.object({
  profile_id: uuid,
  start_date: z.string().date(),
  end_date: z.string().date(),
  reason: z.string().trim().max(5000).optional(),
}).strict();

export const plannedLeaveUpdateSchema = plannedLeaveCreateSchema.omit({ profile_id: true }).partial().strict();
export const plannedLeaveRejectSchema = z.object({ reason: z.string().trim().min(1).max(5000) }).strict();

const findingSchema = z.object({
  checklist_item_id: nullableUuid,
  finding_type: z.string().trim().max(100).optional(),
  description: z.string().trim().max(10000).optional(),
  severity: z.string().trim().max(100).nullable().optional(),
});

export const reviewSchema = z.object({
  kind: z.enum(["review", "approval"]),
  decision: z.enum(["approved", "rejected", "revision_required"]),
  comment: z.string().trim().max(10000).nullable().optional(),
  findings: z.array(findingSchema).max(100).optional(),
});

export const checklistResponseSchema = z.object({
  checklist_item_id: uuid,
  value: z.string().max(10000).nullable().optional(),
  file_id: nullableUuid,
});

export const checklistItemCreateSchema = z.object({
  label: z.string().trim().min(1).max(500),
  input_type: z.enum(["checkbox", "text", "number", "date", "file", "url", "confirmation"]).optional(),
  is_required: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(100000).optional(),
  validation_rules: z.record(z.string(), z.unknown()).optional(),
});

export const checklistItemUpdateSchema = checklistItemCreateSchema.partial().extend({ item_id: uuid });

export const suggestionRejectSchema = z.object({ reason: z.string().trim().min(1).max(5000) });

export const aiReviewSchema = z.object({
  action: z.enum(["accept", "reject"]).optional(),
  note_id: uuid.optional(),
  work_item_id: uuid,
});

export const workItemIdQuerySchema = z.object({ work_item_id: uuid });

export function validationMessage(error: z.ZodError) {
  return error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ");
}
