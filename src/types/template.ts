import type { WorkItemType, WorkItemPriority, RiskLevel, Json } from "./work-item";

/**
 * Task template — blueprints untuk work items yang bisa di-reuse.
 * Tabel: acct_ctrl.task_templates
 */
export interface TaskTemplate {
  id: string;
  organization_id: string;
  client_id: string;
  entity_id: string | null;
  section_id: string | null;
  name: string;
  description: string | null;
  type: WorkItemType;
  priority: WorkItemPriority;
  risk_level: RiskLevel;
  is_active: boolean;
  effective_from: string | null;
  effective_until: string | null;
  parent_template_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Version dari satu template. Setiap perubahan template bikin versi baru.
 * Tabel: acct_ctrl.template_versions
 */
export interface TemplateVersion {
  id: string;
  template_id: string;
  version_number: number;
  title_template: string;
  description_template: string | null;
  acceptance_criteria_template: string | null;
  maker_rule: Json;
  checker_rule: Json;
  approver_rule: Json;
  sop_version_id: string | null;
  evidence_schema: Json;
  maker_deadline_rule: Json;
  checker_deadline_rule: Json;
  final_deadline_rule: Json;
  escalation_policy_id: string | null;
  child_blueprint: Json;
  weight: number;
  is_optional: boolean;
  effective_from: string | null;
  notes: string | null;
  created_at: string;
}

/**
 * Template dengan seluruh versinya (untuk detail view).
 */
export interface TemplateWithVersions extends TaskTemplate {
  versions: TemplateVersion[];
}

/**
 * Input untuk POST /api/templates — buat template baru + versi pertama.
 */
export interface CreateTemplateInput {
  name: string;
  description?: string;
  type?: WorkItemType;
  priority?: WorkItemPriority;
  risk_level?: RiskLevel;
  client_id: string;
  entity_id?: string;
  section_id?: string;
  effective_from?: string;
  effective_until?: string;
  parent_template_id?: string;
  version: {
    title_template: string;
    description_template?: string;
    acceptance_criteria_template?: string;
    maker_rule?: Json;
    checker_rule?: Json;
    approver_rule?: Json;
    sop_version_id?: string;
    evidence_schema?: Json;
    maker_deadline_rule?: Json;
    checker_deadline_rule?: Json;
    final_deadline_rule?: Json;
    escalation_policy_id?: string;
    child_blueprint?: Json;
    weight?: number;
    is_optional?: boolean;
    effective_from?: string;
    notes?: string;
  };
}

/**
 * Input untuk POST /api/templates/[id]/versions — tambah versi baru.
 */
export interface CreateVersionInput {
  title_template: string;
  description_template?: string;
  acceptance_criteria_template?: string;
  maker_rule?: Json;
  checker_rule?: Json;
  approver_rule?: Json;
  sop_version_id?: string;
  evidence_schema?: Json;
  maker_deadline_rule?: Json;
  checker_deadline_rule?: Json;
  final_deadline_rule?: Json;
  escalation_policy_id?: string;
  child_blueprint?: Json;
  weight?: number;
  is_optional?: boolean;
  effective_from?: string;
  notes?: string;
}

/**
 * Input untuk POST /api/templates/[id]/instantiate — generate work items dari template.
 */
export interface InstantiateInput {
  due_date?: string;
  assignee_id?: string;
  custom_fields?: Record<string, unknown>;
}

/**
 * Child blueprint — definisi child task dalam template version.
 */
export interface ChildBlueprint {
  title_suffix: string;
  description?: string;
  type?: WorkItemType;
  priority?: WorkItemPriority;
  risk_level?: RiskLevel;
  assignee_role?: string;
  weight?: number;
  is_optional?: boolean;
  due_offset_days?: number;
  acceptance_criteria?: string;
}
