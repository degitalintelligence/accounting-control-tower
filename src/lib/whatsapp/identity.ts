import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

type IdentityClient = Pick<SupabaseClient, "from">;

export type IdentityResolution = {
  status: "resolved" | "ambiguous" | "unresolved";
  profileId: string | null;
  candidates: string[];
};

export async function resolveParticipant(
  admin: IdentityClient,
  groupId: string,
  participantId: string | null,
): Promise<IdentityResolution> {
  if (!participantId) return { status: "unresolved", profileId: null, candidates: [] };
  const result = await admin
    .from("wa_participant_mappings")
    .select("profile_id, is_verified")
    .eq("wa_group_id", groupId)
    .eq("provider_participant_id", participantId);
  const resolved = result as unknown as { data: { profile_id: string | null; is_verified: boolean }[] | null; error: { message: string } | null };
  if (resolved.error) throw new Error(resolved.error.message);
  const verified = (resolved.data ?? []).filter((row) => row.is_verified && row.profile_id).map((row) => row.profile_id as string);
  const unique = [...new Set(verified)];
  if (unique.length === 1) return { status: "resolved", profileId: unique[0], candidates: unique };
  if (unique.length > 1) return { status: "ambiguous", profileId: null, candidates: unique };
  return { status: "unresolved", profileId: null, candidates: [] };
}
