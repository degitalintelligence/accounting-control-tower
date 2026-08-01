import type { createServiceRoleClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createServiceRoleClient>;

export async function getUserOrganizationId(admin: AdminClient, userId: string) {
  const result = await admin
    .from("memberships")
    .select("organization_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .single();
  const data = result as unknown as {
    data: { organization_id: string } | null;
    error: { message: string } | null;
  };
  return data.data?.organization_id ?? null;
}

export async function ensureChecklistResponses(
  admin: AdminClient,
  workItemId: string,
  profileId: string,
  role: string
) {
  const itemResult = await admin
    .from("work_items")
    .select("checklist_template_id")
    .eq("id", workItemId)
    .single();
  const item = itemResult as unknown as {
    data: { checklist_template_id: string | null } | null;
    error: { message: string } | null;
  };
  if (item.error || !item.data?.checklist_template_id) return;

  const templateResult = await admin
    .from("checklist_templates")
    .select("target_role")
    .eq("id", item.data.checklist_template_id)
    .eq("target_role", role)
    .eq("is_active", true)
    .single();
  const template = templateResult as unknown as {
    data: { target_role: string } | null;
    error: { message: string } | null;
  };
  if (template.error || !template.data) return;

  const itemsResult = await admin
    .from("checklist_items")
    .select("id")
    .eq("checklist_template_id", item.data.checklist_template_id);
  const items = itemsResult as unknown as {
    data: { id: string }[] | null;
    error: { message: string } | null;
  };
  if (items.error || !items.data?.length) return;

  await admin.from("checklist_responses").upsert(
    items.data.map((checklistItem) => ({
      work_item_id: workItemId,
      checklist_item_id: checklistItem.id,
      profile_id: profileId,
    })) as never,
    { onConflict: "work_item_id,checklist_item_id,profile_id", ignoreDuplicates: true }
  );
}

export async function getIncompleteRequiredChecklist(admin: AdminClient, workItemId: string) {
  const workItemResult = await admin.from("work_items").select("checklist_template_id").eq("id", workItemId).single();
  const workItem = workItemResult as unknown as { data: { checklist_template_id: string | null } | null; error: { message: string; code: string; hint: string; details: string } | null };
  if (workItem.error) throw workItem.error;
  if (!workItem.data?.checklist_template_id) return [];
  const itemsResult = await admin
    .from("checklist_items")
    .select("id, label, is_required")
    .eq("checklist_template_id", workItem.data.checklist_template_id)
    .eq("is_required", true)
    .is("deleted_at", null);
  const items = itemsResult as unknown as { data: { id: string; label: string }[] | null; error: { message: string; code: string; hint: string; details: string } | null };
  if (items.error) throw items.error;
  const responseResult = await admin.from("checklist_responses").select("checklist_item_id, value, file_id").eq("work_item_id", workItemId);
  const responses = responseResult as unknown as { data: { checklist_item_id: string; value: string | null; file_id: string | null }[] | null; error: { message: string; code: string; hint: string; details: string } | null };
  if (responses.error) throw responses.error;
  const byItem = new Map((responses.data ?? []).map((response) => [response.checklist_item_id, response]));
  return (items.data ?? []).filter((item) => {
    const response = byItem.get(item.id);
    return !response?.value?.trim() && !response?.file_id;
  }).map((item) => ({ id: item.id, value: null, file_id: null, checklist_items: { label: item.label } }));
}
