import type { AssignmentRole } from "@/types/work-item";

export type ChecklistInputType = "checkbox" | "text" | "number" | "date" | "file" | "url" | "confirmation";

export interface ChecklistTemplate {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  target_role: AssignmentRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  items?: ChecklistItem[];
}

export interface ChecklistItem {
  id: string;
  checklist_template_id: string;
  label: string;
  input_type: ChecklistInputType;
  is_required: boolean;
  sort_order: number;
  validation_rules: Record<string, unknown>;
  created_at: string;
}

export interface ChecklistResponse {
  id: string;
  work_item_id: string;
  checklist_item_id: string;
  profile_id: string;
  value: string | null;
  file_id: string | null;
  created_at: string;
  updated_at: string;
  item?: ChecklistItem;
}

export interface WorkItemChecklist {
  template: ChecklistTemplate | null;
  responses: ChecklistResponse[];
  required_total: number;
  required_completed: number;
}
