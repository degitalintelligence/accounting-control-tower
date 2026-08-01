import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getUserOrganizationId } from "@/lib/checklists";
import { getRequiredServerEnv } from "@/lib/server-env";

type Context = { params: Promise<{ id: string }> };

type WorkItemAccess = {
  admin: ReturnType<typeof createServiceRoleClient>;
  id: string;
  userId: string;
  organizationId: string;
  clientId: string | null;
};

async function authorize(context: Context): Promise<WorkItemAccess | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createServiceRoleClient();
  const organizationId = await getUserOrganizationId(admin, user.id);
  if (!organizationId) return NextResponse.json({ error: "Organisasi tidak ditemukan." }, { status: 403 });

  const { id } = await context.params;
  const itemResult = await admin
    .from("work_items")
    .select("id, organization_id, client_id")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .single();
  const item = itemResult as unknown as { data: { id: string; organization_id: string; client_id: string | null } | null; error: { message: string } | null };
  if (item.error || !item.data) return NextResponse.json({ error: "Work item tidak ditemukan." }, { status: 404 });

  const memberships = await admin
    .from("memberships")
    .select("client_id")
    .eq("profile_id", user.id)
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  const membershipData = memberships as unknown as { data: { client_id: string | null }[] | null };
  if (!membershipData.data?.some((membership) => membership.client_id === null || membership.client_id === item.data!.client_id)) {
    return NextResponse.json({ error: "Work item tidak ditemukan." }, { status: 404 });
  }

  return { admin, id, userId: user.id, organizationId, clientId: item.data.client_id };
}

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

async function getRequirements(access: WorkItemAccess) {
  const result = await access.admin
    .from("evidence_requirements")
    .select("id, work_item_id, name, description, file_types, max_size_mb, is_required, sort_order")
    .eq("work_item_id", access.id)
    .order("sort_order", { ascending: true });
  return result as unknown as { data: Record<string, unknown>[] | null; error: { message: string; code: string; hint: string; details: string } | null };
}

export async function GET(_request: NextRequest, context: Context) {
  const auth = await authorize(context);
  if (auth instanceof NextResponse) return auth;

  const [filesResult, requirementsResult] = await Promise.all([
    auth.admin
      .from("work_item_files")
      .select("id, work_item_id, file_id, evidence_requirement_id, purpose, created_at, files(id, filename, mime_type, size_bytes, storage_path, uploaded_by, created_at), evidence_requirements(id, name, is_required)")
      .eq("work_item_id", auth.id)
      .order("created_at", { ascending: false }),
    getRequirements(auth),
  ]);
  const files = filesResult as unknown as { data: Record<string, unknown>[] | null; error: { message: string; code: string; hint: string; details: string } | null };
  if (files.error || requirementsResult.error) {
    return errorResponse("Gagal mengambil evidence.");
  }

  const rows = files.data ?? [];
  const required = (requirementsResult.data ?? []).filter((requirement) => requirement.is_required);
  const linkedRequiredIds = new Set(rows.map((row) => row.evidence_requirement_id).filter(Boolean));
  return NextResponse.json({
    data: {
      files: rows.map((row) => {
        const file = row.files as Record<string, unknown> | null;
        const requirement = row.evidence_requirements as Record<string, unknown> | null;
        return { ...row, files: file ? { id: file.id, filename: file.filename, mime_type: file.mime_type, size_bytes: file.size_bytes, created_at: file.created_at } : null, evidence_requirement: requirement };
      }),
      requirements: requirementsResult.data ?? [],
      required_total: required.length,
      required_completed: required.filter((requirement) => linkedRequiredIds.has(requirement.id)).length,
    },
  });
}

export async function POST(request: NextRequest, context: Context) {
  const auth = await authorize(context);
  if (auth instanceof NextResponse) return auth;

  const body = await request.formData();
  const file = body.get("file");
  const evidenceRequirementId = body.get("evidence_requirement_id")?.toString() || null;
  const purpose = body.get("purpose")?.toString() || "evidence";
  const linkPath = body.get("storage_path")?.toString() || null;
  const linkFilename = body.get("filename")?.toString() || null;
  const linkMimeType = body.get("mime_type")?.toString() || null;
  const linkSize = body.get("size_bytes")?.toString();

  if (evidenceRequirementId) {
    const requirement = await auth.admin.from("evidence_requirements").select("id, file_types, max_size_mb").eq("id", evidenceRequirementId).eq("work_item_id", auth.id).single();
    const requirementData = requirement as unknown as { data: { id: string; file_types: string[] | null; max_size_mb: number | null } | null; error: { message: string } | null };
    if (requirementData.error || !requirementData.data) return errorResponse("Evidence requirement tidak valid.", 400);
  }

  let storagePath = linkPath;
  let filename = linkFilename;
  let mimeType = linkMimeType;
  let sizeBytes = linkSize ? Number(linkSize) : null;
  let uploaded = false;
  const bucket = getRequiredServerEnv("SUPABASE_STORAGE_BUCKET");

  if (file instanceof File && file.size > 0) {
    if (file.size > 50 * 1024 * 1024) return errorResponse("Ukuran file maksimal 50 MB.", 400);
    filename = file.name;
    mimeType = file.type || null;
    sizeBytes = file.size;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
    storagePath = `${auth.organizationId}/${auth.id}/${crypto.randomUUID()}-${safeName}`;
    const uploadResult = await auth.admin.storage.from(bucket).upload(storagePath, file, { contentType: mimeType ?? undefined, upsert: false });
    if (uploadResult.error) return errorResponse("Gagal mengunggah file.", 500);
    uploaded = true;
  }

  if (!storagePath || !filename || !sizeBytes || !Number.isFinite(sizeBytes) || sizeBytes <= 0) return errorResponse("File atau metadata link wajib diisi.", 400);
  if (sizeBytes > 50 * 1024 * 1024) return errorResponse("Ukuran file maksimal 50 MB.", 400);

  const fileResult = await auth.admin.from("files").insert({ organization_id: auth.organizationId, storage_path: storagePath, filename, mime_type: mimeType, size_bytes: sizeBytes, uploaded_by: auth.userId } as never).select("id, filename, mime_type, size_bytes, created_at").single();
  const insertedFile = fileResult as unknown as { data: Record<string, unknown> | null; error: { message: string; code: string; hint: string; details: string } | null };
  if (insertedFile.error || !insertedFile.data) {
    if (uploaded) await auth.admin.storage.from(bucket).remove([storagePath]);
    return errorResponse("Gagal menyimpan metadata file.");
  }

  const linkResult = await auth.admin.from("work_item_files").insert({ work_item_id: auth.id, file_id: insertedFile.data.id, evidence_requirement_id: evidenceRequirementId, purpose } as never).select("id, work_item_id, file_id, evidence_requirement_id, purpose, created_at").single();
  const linked = linkResult as unknown as { data: Record<string, unknown> | null; error: { message: string } | null };
  if (linked.error || !linked.data) {
    await auth.admin.from("files").delete().eq("id", insertedFile.data.id as string);
    if (uploaded) await auth.admin.storage.from(bucket).remove([storagePath]);
    return errorResponse("Gagal menautkan file ke work item.");
  }
  return NextResponse.json({ data: { ...linked.data, file: insertedFile.data } }, { status: 201 });
}
