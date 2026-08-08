// Project types — matching acct_ctrl DB schema exactly

export interface Project {
  id: string;
  work_item_id: string;
  objective: string | null;
  success_criteria: string | null;
  start_date: string | null;
  target_date: string | null;
  budgeted_hours: number | null;
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  due_date: string | null;
  sort_order: number;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface Dependency {
  id: string;
  work_item_id: string;
  depends_on_id: string;
  dependency_type: string;
  created_at: string;
}

export interface ProjectWithDetails extends Project {
  // Dari work_item terkait
  title?: string;
  status?: string;
  organization_id?: string;
  client_id?: string;
  client_name?: string;
  // Milestones
  milestones?: Milestone[];
  // Child work items (yang link ke project ini)
  work_items?: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    due_at: string | null;
    is_optional: boolean;
  }>;
  // Stats
  stats?: {
    total_milestones: number;
    completed_milestones: number;
    total_work_items: number;
    completed_work_items: number;
  };
}

export interface CreateProjectInput {
  // Option A: Link ke work_item yang sudah ada
  work_item_id?: string;
  // Option B: Buat work_item baru
  title?: string;
  description?: string;
  client_id?: string;
  // Project fields
  objective?: string;
  success_criteria?: string;
  start_date?: string;
  target_date?: string;
  budgeted_hours?: number;
}

export interface CreateMilestoneInput {
  name: string;
  description?: string;
  due_date?: string;
  sort_order?: number;
}
