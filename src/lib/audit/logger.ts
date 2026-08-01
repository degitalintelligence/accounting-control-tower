import type { SupabaseClient } from "@supabase/supabase-js";
import { structuredSupabaseError } from "@/lib/supabase/error";

type AnySupabaseClient = Pick<SupabaseClient, "from">;

/**
 * Catat entri audit log ke tabel `acct_ctrl.audit_logs`.
 * Immutable — tidak boleh diupdate/dihapus dari app.
 */
export async function logAudit(
  supabase: AnySupabaseClient,
  params: {
    organizationId: string;
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    oldValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
    metadata?: Record<string, unknown>;
  }
) {
  const result = await supabase.from("audit_logs").insert({
    organization_id: params.organizationId,
    actor_id: params.actorId ?? null,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    old_value: params.oldValue ?? null,
    new_value: params.newValue ?? null,
    metadata: params.metadata ?? {},
  });

  // Type cast karena Supabase generic inference issue
  const { error } = result as unknown as {
    error: { message: string; code: string; hint: string; details: string } | null;
  };

  if (error) {
    // Audit logging tidak boleh meledak ke caller — log ke server console
    console.error("[audit-log] Gagal mencatat audit:", {
      message: error.message,
      code: error.code,
      hint: error.hint,
      details: error.details,
    });
  }
}

/**
 * Ambil audit trail untuk satu entity.
 */
export async function getAuditTrail(
  supabase: AnySupabaseClient,
  entityType: string,
  entityId: string,
  limit = 50
) {
  const result = await supabase
    .from("audit_logs")
    .select("id, organization_id, actor_id, action, entity_type, entity_id, old_value, new_value, metadata, created_at")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data, error } = result as unknown as {
    data: Array<{
      id: string;
      organization_id: string;
      actor_id: string | null;
      action: string;
      entity_type: string;
      entity_id: string;
      old_value: unknown;
      new_value: unknown;
      metadata: unknown;
      created_at: string;
    }> | null;
    error: { message: string } | null;
  };

  if (error) {
    console.error("[audit-trail] Gagal query audit trail:", structuredSupabaseError(error));
    throw new Error("Gagal mengambil audit trail.");
  }

  return data ?? [];
}
