-- Menambahkan logika otomatisasi penggantian placeholder pada template work items.
-- Placeholder yang didukung: {{month}}, {{month_num}}, {{year}}, {{day}}.
-- Bahasa default untuk nama bulan adalah Bahasa Indonesia.

DROP FUNCTION IF EXISTS acct_ctrl.instantiate_template_instance(uuid,uuid,text,date,timestamp with time zone,timestamp with time zone,uuid,uuid,uuid,uuid,jsonb);

CREATE OR REPLACE FUNCTION acct_ctrl.instantiate_template_instance(
  p_template_id UUID,
  p_template_version_id UUID,
  p_instance_key TEXT,
  p_occurrence_date DATE,
  p_due_at TIMESTAMPTZ,
  p_start_at TIMESTAMPTZ,
  p_created_by UUID,
  p_entity_id UUID DEFAULT NULL,
  p_section_id UUID DEFAULT NULL,
  p_assignee_id UUID DEFAULT NULL,
  p_source_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, public
AS $$
DECLARE
  v_template acct_ctrl.task_templates%ROWTYPE;
  v_version acct_ctrl.template_versions%ROWTYPE;
  v_parent acct_ctrl.work_items%ROWTYPE;
  v_child acct_ctrl.work_items%ROWTYPE;
  v_child_blueprint JSONB;
  v_child_json JSONB;
  v_children JSONB := '[]'::jsonb;
  v_entity_id UUID;
  v_section_id UUID;
  v_due_at TIMESTAMPTZ;
  v_child_due_at TIMESTAMPTZ;
  
  -- Placeholder variables
  v_ref_date DATE := COALESCE(p_occurrence_date, CURRENT_DATE);
  v_month_name TEXT;
  v_month_num TEXT;
  v_year TEXT;
  v_day TEXT;
  v_title TEXT;
  v_desc TEXT;
  v_child_title TEXT;
  v_child_desc TEXT;
BEGIN
  -- Determine placeholder values (Indonesian names)
  v_month_name := CASE EXTRACT(MONTH FROM v_ref_date)
    WHEN 1 THEN 'Januari' WHEN 2 THEN 'Februari' WHEN 3 THEN 'Maret'
    WHEN 4 THEN 'April' WHEN 5 THEN 'Mei' WHEN 6 THEN 'Juni'
    WHEN 7 THEN 'Juli' WHEN 8 THEN 'Agustus' WHEN 9 THEN 'September'
    WHEN 10 THEN 'Oktober' WHEN 11 THEN 'November' WHEN 12 THEN 'Desember'
  END;
  v_month_num := TO_CHAR(v_ref_date, 'MM');
  v_year := TO_CHAR(v_ref_date, 'YYYY');
  v_day := TO_CHAR(v_ref_date, 'DD');

  PERFORM pg_advisory_xact_lock(hashtextextended(p_template_id::text || ':' || p_instance_key, 0));

  SELECT * INTO v_template FROM acct_ctrl.task_templates WHERE id = p_template_id AND is_active AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template tidak aktif atau tidak ditemukan'; END IF;

  SELECT * INTO v_version FROM acct_ctrl.template_versions WHERE id = p_template_version_id AND template_id = p_template_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Versi template tidak ditemukan'; END IF;

  IF v_version.checklist_template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM acct_ctrl.checklist_templates c
    WHERE c.id = v_version.checklist_template_id
      AND c.organization_id = v_template.organization_id
      AND c.is_active AND c.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'Template checklist tidak valid'; END IF;

  v_entity_id := COALESCE(p_entity_id, v_template.entity_id);
  v_section_id := COALESCE(p_section_id, v_template.section_id);
  v_due_at := p_due_at;

  SELECT * INTO v_parent FROM acct_ctrl.work_items WHERE template_id = p_template_id AND recurrence_instance_key = p_instance_key AND COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(v_entity_id, '00000000-0000-0000-0000-000000000000'::uuid) AND deleted_at IS NULL;

  IF NOT FOUND THEN
    -- Replace placeholders in Parent
    v_title := REPLACE(REPLACE(REPLACE(REPLACE(v_version.title_template, '{{month}}', v_month_name), '{{month_num}}', v_month_num), '{{year}}', v_year), '{{day}}', v_day);
    v_desc := REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(v_version.description_template, v_template.description), '{{month}}', v_month_name), '{{month_num}}', v_month_num), '{{year}}', v_year), '{{day}}', v_day);

    INSERT INTO acct_ctrl.work_items (organization_id, client_id, entity_id, section_id, type, template_id, template_version_id, checklist_template_id, recurrence_instance_key, title, description, acceptance_criteria, status, priority, risk_level, weight, is_optional, start_at, due_at, timezone, source_type, source_reference_id, source_metadata, created_by)
    VALUES (v_template.organization_id, v_template.client_id, v_entity_id, v_section_id, v_template.type, v_template.id, v_version.id, v_version.checklist_template_id, p_instance_key, v_title, v_desc, v_version.acceptance_criteria_template, CASE WHEN p_assignee_id IS NULL THEN 'draft'::acct_ctrl.work_item_status ELSE 'assigned'::acct_ctrl.work_item_status END, v_template.priority, v_template.risk_level, v_version.weight, v_version.is_optional, p_start_at, v_due_at, COALESCE((SELECT timezone FROM acct_ctrl.recurrence_rules WHERE template_id = p_template_id AND deleted_at IS NULL LIMIT 1), 'Asia/Jakarta'), 'template'::acct_ctrl.source_type, p_instance_key, p_source_metadata, p_created_by) RETURNING * INTO v_parent;

    IF p_assignee_id IS NOT NULL THEN
      INSERT INTO acct_ctrl.assignments(work_item_id, profile_id, role, assigned_by) VALUES (v_parent.id, p_assignee_id, 'maker', p_created_by);
      INSERT INTO acct_ctrl.work_item_status_history(work_item_id, from_status, to_status, changed_by, reason) VALUES (v_parent.id, 'draft', 'assigned', p_created_by, 'Recurring instance auto-assigned');
    END IF;

    v_child_blueprint := COALESCE(v_version.child_blueprint, '[]'::jsonb);
    FOR v_child_json IN SELECT value FROM jsonb_array_elements(v_child_blueprint) LOOP
      v_child_due_at := CASE WHEN v_due_at IS NULL THEN NULL ELSE v_due_at + (COALESCE((v_child_json->>'due_offset_days')::integer, 0) * INTERVAL '1 day') END;
      
      -- Replace placeholders in Child
      v_child_title := REPLACE(REPLACE(REPLACE(REPLACE(v_version.title_template || ' — ' || (v_child_json->>'title_suffix'), '{{month}}', v_month_name), '{{month_num}}', v_month_num), '{{year}}', v_year), '{{day}}', v_day);
      v_child_desc := REPLACE(REPLACE(REPLACE(REPLACE(v_child_json->>'description', '{{month}}', v_month_name), '{{month_num}}', v_month_num), '{{year}}', v_year), '{{day}}', v_day);

      INSERT INTO acct_ctrl.work_items (organization_id, client_id, entity_id, section_id, type, parent_id, template_id, template_version_id, checklist_template_id, recurrence_instance_key, title, description, acceptance_criteria, status, priority, risk_level, weight, is_optional, due_at, timezone, source_type, source_reference_id, source_metadata, created_by)
      VALUES (v_template.organization_id, v_template.client_id, v_entity_id, v_section_id, COALESCE((v_child_json->>'type')::acct_ctrl.work_item_type, v_template.type), v_parent.id, v_template.id, v_version.id, COALESCE((v_child_json->>'checklist_template_id')::uuid, v_version.checklist_template_id), p_instance_key || ':' || (v_child_json->>'title_suffix'), v_child_title, v_child_desc, v_child_json->>'acceptance_criteria', 'draft', COALESCE((v_child_json->>'priority')::acct_ctrl.priority_level, v_template.priority), COALESCE((v_child_json->>'risk_level')::acct_ctrl.risk_level, v_template.risk_level), COALESCE((v_child_json->>'weight')::numeric, 1), COALESCE((v_child_json->>'is_optional')::boolean, false), v_child_due_at, v_parent.timezone, 'template'::acct_ctrl.source_type, p_instance_key, p_source_metadata, p_created_by) RETURNING * INTO v_child;
      v_children := v_children || jsonb_build_array(to_jsonb(v_child));
    END LOOP;
  ELSE
    SELECT COALESCE(jsonb_agg(to_jsonb(w)), '[]'::jsonb) INTO v_children FROM acct_ctrl.work_items w WHERE w.parent_id = v_parent.id AND w.deleted_at IS NULL;
  END IF;

  RETURN jsonb_build_object('parent', to_jsonb(v_parent), 'children', v_children);
END;
$$;
