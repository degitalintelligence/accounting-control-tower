/**
 * Database types for acct_ctrl schema.
 * Matches actual migration 001_create_acct_ctrl_schema.sql.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  acct_ctrl: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          settings: Json;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
      };
      profiles: {
        Row: {
          id: string;
          display_name: string;
          email: string | null;
          phone: string | null;
          avatar_url: string | null;
          timezone: string;
          quiet_hours_start: string | null;
          quiet_hours_end: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          email?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          timezone?: string;
          quiet_hours_start?: string | null;
          quiet_hours_end?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          email?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          timezone?: string;
          quiet_hours_start?: string | null;
          quiet_hours_end?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      memberships: {
        Row: {
          id: string;
          profile_id: string;
          organization_id: string;
          client_id: string | null;
          entity_id: string | null;
          role: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          organization_id: string;
          client_id?: string | null;
          entity_id?: string | null;
          role: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          organization_id?: string;
          client_id?: string | null;
          entity_id?: string | null;
          role?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      assignments: {
        Row: {
          id: string;
          work_item_id: string;
          profile_id: string;
          role: string;
          assigned_by: string | null;
          assigned_at: string;
          unassigned_at: string | null;
          reason: string | null;
        };
        Insert: {
          id?: string;
          work_item_id: string;
          profile_id: string;
          role: string;
          assigned_by?: string | null;
          assigned_at?: string;
          unassigned_at?: string | null;
          reason?: string | null;
        };
        Update: {
          id?: string;
          work_item_id?: string;
          profile_id?: string;
          role?: string;
          assigned_by?: string | null;
          assigned_at?: string;
          unassigned_at?: string | null;
          reason?: string | null;
        };
      };
      work_items: {
        Row: {
          id: string;
          organization_id: string;
          client_id: string;
          entity_id: string | null;
          section_id: string | null;
          type: string;
          parent_id: string | null;
          project_id: string | null;
          milestone_id: string | null;
          report_id: string | null;
          template_id: string | null;
          template_version_id: string | null;
          recurrence_instance_key: string | null;
          checklist_template_id: string | null;
          progress_percent: number;
          health_flag: string;
          is_rollup_parent: boolean;
          requires_explicit_delivery: boolean;
          approval_cycle: number;
          report_stage: string;
          delivery_confirmed_at: string | null;
          delivery_reference: string | null;
          title: string;
          description: string | null;
          acceptance_criteria: string | null;
          status: string;
          priority: string;
          risk_level: string;
          weight: number;
          is_optional: boolean;
          start_at: string | null;
          due_at: string | null;
          review_due_at: string | null;
          client_due_at: string | null;
          timezone: string;
          source_type: string;
          source_reference_id: string | null;
          source_metadata: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          client_id: string;
          entity_id?: string | null;
          section_id?: string | null;
          type?: string;
          parent_id?: string | null;
          project_id?: string | null;
          milestone_id?: string | null;
          report_id?: string | null;
          template_id?: string | null;
          template_version_id?: string | null;
          recurrence_instance_key?: string | null;
          checklist_template_id?: string | null;
          progress_percent?: number;
          health_flag?: string;
          is_rollup_parent?: boolean;
          requires_explicit_delivery?: boolean;
          approval_cycle?: number;
          report_stage?: string;
          delivery_confirmed_at?: string | null;
          delivery_reference?: string | null;
          title: string;
          description?: string | null;
          acceptance_criteria?: string | null;
          status?: string;
          priority?: string;
          risk_level?: string;
          weight?: number;
          is_optional?: boolean;
          start_at?: string | null;
          due_at?: string | null;
          review_due_at?: string | null;
          client_due_at?: string | null;
          timezone?: string;
          source_type?: string;
          source_reference_id?: string | null;
          source_metadata?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          client_id?: string;
          entity_id?: string | null;
          section_id?: string | null;
          type?: string;
          parent_id?: string | null;
          project_id?: string | null;
          milestone_id?: string | null;
          report_id?: string | null;
          template_id?: string | null;
          template_version_id?: string | null;
          recurrence_instance_key?: string | null;
          title?: string;
          description?: string | null;
          acceptance_criteria?: string | null;
          status?: string;
          priority?: string;
          risk_level?: string;
          weight?: number;
          is_optional?: boolean;
          start_at?: string | null;
          due_at?: string | null;
          review_due_at?: string | null;
          client_due_at?: string | null;
          timezone?: string;
          source_type?: string;
          source_reference_id?: string | null;
          source_metadata?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
          deleted_at?: string | null;
          report_stage?: string;
          delivery_confirmed_at?: string | null;
          delivery_reference?: string | null;
        };
      };
      whatsapp_retention_policies: {
        Row: {
          organization_id: string;
          retention_days: number;
          raw_payload_retention_days: number;
          is_active: boolean;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          retention_days?: number;
          raw_payload_retention_days?: number;
          is_active?: boolean;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          retention_days?: number;
          raw_payload_retention_days?: number;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      recurrence_rules: {
        Relationships: [];
        Row: {
          id: string;
          template_id: string;
          rrule: string;
          timezone: string;
          generation_lead_days: number;
          holiday_handling: string;
          skip_weekends: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          template_id: string;
          rrule: string;
          timezone?: string;
          generation_lead_days?: number;
          holiday_handling?: string;
          skip_weekends?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: Partial<Database["acct_ctrl"]["Tables"]["recurrence_rules"]["Insert"]>;
      };
      domain_events: {
        Relationships: [];
        Row: {
          id: string;
          organization_id: string;
          event_type: string;
          aggregate_type: string;
          aggregate_id: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          event_type: string;
          aggregate_type: string;
          aggregate_id: string;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          event_type?: string;
          aggregate_type?: string;
          aggregate_id?: string;
          payload?: Json;
          created_at?: string;
        };
      };
      outbox_events: {
        Relationships: [];
        Row: {
          id: string;
          organization_id: string;
          domain_event_id: string | null;
          event_type: string;
          payload: Json;
          status: string;
          retry_count: number;
          max_retries: number;
          next_retry_at: string | null;
          processed_at: string | null;
          claimed_at: string | null;
          claimed_by: string | null;
          lease_expires_at: string | null;
          claim_token: string | null;
          last_error: string | null;
          dead_letter_event_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          domain_event_id?: string | null;
          event_type: string;
          payload?: Json;
          status?: string;
          retry_count?: number;
          max_retries?: number;
          next_retry_at?: string | null;
          processed_at?: string | null;
          claimed_at?: string | null;
          claimed_by?: string | null;
          lease_expires_at?: string | null;
          last_error?: string | null;
          dead_letter_event_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          domain_event_id?: string | null;
          event_type?: string;
          payload?: Json;
          status?: string;
          retry_count?: number;
          max_retries?: number;
          next_retry_at?: string | null;
          processed_at?: string | null;
          claimed_at?: string | null;
          claimed_by?: string | null;
          lease_expires_at?: string | null;
          last_error?: string | null;
          dead_letter_event_id?: string | null;
          created_at?: string;
        };
      };
      notifications: {
        Relationships: [];
        Row: {
          id: string;
          profile_id: string;
          organization_id: string;
          event_type: string;
          title: string;
          body: string | null;
          data: Json;
          channel: string;
          dedup_key: string | null;
          read_at: string | null;
          sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          organization_id: string;
          event_type: string;
          title: string;
          body?: string | null;
          data?: Json;
          channel?: string;
          dedup_key?: string | null;
          read_at?: string | null;
          sent_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          organization_id?: string;
          event_type?: string;
          title?: string;
          body?: string | null;
          data?: Json;
          channel?: string;
          dedup_key?: string | null;
          read_at?: string | null;
          sent_at?: string | null;
          created_at?: string;
        };
      };
      notification_deliveries: {
        Relationships: [];
        Row: {
          id: string;
          notification_id: string;
          channel: string;
          status: string;
          provider_response: Json | null;
          delivered_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          notification_id: string;
          channel: string;
          status?: string;
          provider_response?: Json | null;
          delivered_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          notification_id?: string;
          channel?: string;
          status?: string;
          provider_response?: Json | null;
          delivered_at?: string | null;
          created_at?: string;
        };
      };
      [key: string]: unknown;
    };
    Views: Record<string, unknown>;
    Functions: {
      instantiate_template_instance: {
        Args: {
          p_template_id: string;
          p_template_version_id: string;
          p_instance_key: string;
          p_occurrence_date: string;
          p_due_at: string | null;
          p_start_at: string | null;
          p_created_by: string | null;
          p_entity_id?: string | null;
          p_section_id?: string | null;
          p_assignee_id?: string | null;
          p_source_metadata?: Json;
        };
        Returns: Json;
      };
      confirm_action_suggestion: {
        Args: { p_suggestion_id: string; p_organization_id: string; p_confirmed_by: string; p_client_id?: string | null };
        Returns: { suggestion_id: string; work_item_id: string }[];
      };
      create_work_item_with_assignment: {
        Args: {
          p_title: string;
          p_type: string;
          p_organization_id: string;
          p_client_id: string;
          p_description: string | null;
          p_acceptance_criteria: string | null;
          p_priority: string;
          p_risk_level: string;
          p_due_at: string | null;
          p_start_at: string | null;
          p_project_id: string | null;
          p_parent_id: string | null;
          p_entity_id: string | null;
          p_section_id: string | null;
          p_created_by: string;
          p_assignee_id: string;
          p_assignee_role: string;
        };
        Returns: Database["acct_ctrl"]["Tables"]["work_items"]["Row"][];
      };
      transition_work_item: {
        Args: {
          p_work_item_id: string;
          p_to_status: string;
          p_actor_id: string;
          p_reason?: string | null;
        };
        Returns: Json;
      };
      record_review_decision: {
        Args: {
          p_work_item_id: string;
          p_actor_id: string;
          p_kind: string;
          p_decision: string;
          p_comment?: string | null;
          p_checklist_template_id?: string | null;
          p_findings?: Json;
        };
        Returns: Json;
      };
      create_whatsapp_command_work_item: {
        Args: {
          p_organization_id: string;
          p_client_id: string;
          p_title: string;
          p_due_at: string | null;
          p_source_reference_id: string;
          p_source_metadata: Json;
          p_created_by: string;
          p_maker_id: string;
          p_checker_id?: string | null;
        };
        Returns: { id: string; title: string }[];
      };
      report_analytics: {
        Args: { p_organization_id: string; p_client_ids?: string[] | null };
        Returns: {
          total: number;
          completed: number;
          active: number;
          overdue: number;
          delivered: number;
          pending_delivery: number;
          on_time_rate: number;
          lifecycle: Json;
          versions: Json;
        }[];
      };
      enqueue_whatsapp_message: {
        Args: {
          p_connection_id: string;
          p_wa_group_id: string;
          p_organization_id: string;
          p_provider_message_id: string;
          p_sender_participant_id: string;
          p_content: string;
          p_message_type: string;
          p_media_metadata: Json | null;
          p_raw_payload: Json | null;
          p_received_at: string;
          p_event_type: string;
          p_event_payload: Json;
        };
        Returns: { message_id: string; duplicate: boolean }[];
      };
      enqueue_whatsapp_reply: {
        Args: { p_organization_id: string; p_message_id: string; p_chat_id: string; p_text: string };
        Returns: string;
      };
      cleanup_whatsapp_retention: {
        Args: { p_limit?: number };
        Returns: { raw_payloads_cleaned: number; messages_deleted: number }[];
      };
      claim_outbox_event: {
        Args: { p_worker_id: string; p_event_type?: string | null; p_lease_seconds?: number };
        Returns: Database["acct_ctrl"]["Tables"]["outbox_events"]["Row"][];
      };
    };
    Enums: Record<string, unknown>;
    CompositeTypes: Record<string, unknown>;
  };
}
