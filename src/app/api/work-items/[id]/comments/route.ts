import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/logger";
import { publishNotificationEvent } from "@/lib/notification";
import { canAccessClient, getAuthContext } from "@/lib/authorization";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Helper: ambil organization_id dari membership user.
 */
async function getUserOrganizationId(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string
): Promise<{ organizationId: string | null; error: string | null }> {
  const result = await admin
    .from("memberships")
    .select("organization_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .single();

  const membership = result as unknown as {
    data: { organization_id: string } | null;
    error: { message: string; code: string; hint: string; details: string } | null;
  };

  if (membership.error || !membership.data) {
    return {
      organizationId: null,
      error: membership.error?.message ?? "User tidak memiliki membership aktif.",
    };
  }

  return { organizationId: membership.data.organization_id, error: null };
}

/**
 * GET /api/work-items/[id]/comments
 * List komentar untuk work item, join author name dari profiles.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const { id } = await context.params;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createServiceRoleClient();

    const { organizationId, error: orgError } = await getUserOrganizationId(admin, user.id);
    if (orgError || !organizationId) {
      return NextResponse.json(
        { error: "Organisasi tidak ditemukan untuk user ini." },
        { status: 403 }
      );
    }

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10))
    );
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Verifikasi work item exists dan milik org yang sama
    const wiResult = await admin
      .from("work_items")
      .select("id, client_id")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .single();

    const { data: workItem, error: wiError } = wiResult as unknown as {
      data: { id: string; client_id: string | null } | null;
      error: { message: string } | null;
    };

    const authContext = await getAuthContext();
    if (authContext.response) return authContext.response;
    if (wiError || !workItem || !canAccessClient(authContext.context, workItem.client_id)) {
      return NextResponse.json(
        { error: "Work item tidak ditemukan." },
        { status: 404 }
      );
    }

    const commentsResult = await admin
      .from("comments")
      .select(
        `
        id,
        work_item_id,
        author_id,
        content,
        parent_comment_id,
        mentions,
        created_at,
        updated_at
      `,
        { count: "exact" }
      )
      .eq("work_item_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .range(from, to);

    const { data, error, count } = commentsResult as unknown as {
      data: Array<{
        id: string;
        work_item_id: string;
        author_id: string;
        content: string;
        parent_comment_id: string | null;
        mentions: string[] | null;
        created_at: string;
        updated_at: string;
      }> | null;
      error: { message: string; code: string; hint: string; details: string } | null;
      count: number | null;
    };

    if (error) {
      console.error("[GET /comments] Supabase error:", {
        message: error.message,
        code: error.code,
        hint: error.hint,
        details: error.details,
      });
      return NextResponse.json(
        { error: "Gagal mengambil komentar." },
        { status: 500 }
      );
    }

    // Join author name dari profiles untuk setiap comment
    const comments = data ?? [];
    const authorIds = [...new Set(comments.map((c) => c.author_id).filter(Boolean))];

    let authorMap: Record<string, string> = {};
    if (authorIds.length > 0) {
      const profilesResult = await admin
        .from("profiles")
        .select("id, display_name")
        .in("id", authorIds);

      const { data: profiles } = profilesResult as unknown as {
        data: Array<{ id: string; display_name: string | null }> | null;
      };

      if (profiles) {
        authorMap = Object.fromEntries(
          profiles.map((p) => [p.id, p.display_name ?? "Unknown"])
        );
      }
    }

    const enrichedComments = comments.map((c) => ({
      ...c,
      author_name: authorMap[c.author_id] ?? null,
    }));

    return NextResponse.json({
      data: enrichedComments,
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error("[GET /comments] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/work-items/[id]/comments
 * Tambah komentar baru ke work item.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const { id } = await context.params;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createServiceRoleClient();

    const { organizationId, error: orgError } = await getUserOrganizationId(admin, user.id);
    if (orgError || !organizationId) {
      return NextResponse.json(
        { error: "Organisasi tidak ditemukan untuk user ini." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { content, parent_comment_id, mentions } = body as {
      content?: string;
      parent_comment_id?: string;
      mentions?: string[];
    };

    if (!content || content.trim().length === 0) {
      return NextResponse.json(
        { error: "Konten komentar tidak boleh kosong." },
        { status: 400 }
      );
    }

    // Verifikasi work item exists & milik org yang sama
    const wiResult = await admin
      .from("work_items")
      .select("id, organization_id, client_id")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .single();

    const { data: workItem, error: wiError } = wiResult as unknown as {
      data: { id: string; organization_id: string; client_id: string | null } | null;
      error: { message: string } | null;
    };

    const authContext = await getAuthContext();
    if (authContext.response) return authContext.response;
    if (wiError || !workItem || !canAccessClient(authContext.context, workItem.client_id)) {
      return NextResponse.json(
        { error: "Work item tidak ditemukan." },
        { status: 404 }
      );
    }

    if (parent_comment_id) {
      const parent = await admin.from("comments").select("id").eq("id", parent_comment_id).eq("work_item_id", id).is("deleted_at", null).maybeSingle();
      if (parent.error || !parent.data) return NextResponse.json({ error: "Komentar induk tidak valid." }, { status: 400 });
    }

    const insertResult = await admin
      .from("comments")
      .insert({
        work_item_id: id,
        author_id: user.id,
        content: content.trim(),
        parent_comment_id: parent_comment_id ?? null,
        mentions: mentions ?? null,
      } as never)
      .select()
      .single();

    const { data: comment, error: insertError } = insertResult as unknown as {
      data: { id: string } | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (insertError) {
      console.error("[POST /comments] Supabase error:", {
        message: insertError.message,
        code: insertError.code,
        hint: insertError.hint,
        details: insertError.details,
      });
      return NextResponse.json(
        { error: "Gagal menambahkan komentar." },
        { status: 500 }
      );
    }

    // Audit log
    await logAudit(admin, {
      organizationId,
      actorId: user.id,
      action: "comment.created",
      entityType: "comment",
      entityId: comment!.id,
      newValue: { work_item_id: id, content_length: content.trim().length },
    });

    const recipientsResult = await admin
      .from("assignments")
      .select("profile_id")
      .eq("work_item_id", id)
      .is("unassigned_at", null);
    const recipients = recipientsResult as unknown as {
      data: { profile_id: string }[] | null;
      error: { message: string } | null;
    };

    if (recipients.error) {
      console.error("[POST /comments] Gagal mengambil penerima notifikasi:", recipients.error.message);
    } else {
      try {
        await publishNotificationEvent(admin, {
          eventType: "comment_added",
          organizationId,
          aggregateType: "work_item",
          aggregateId: id,
          profileIds: (recipients.data ?? [])
            .map((recipient) => recipient.profile_id)
            .filter((profileId) => profileId !== user.id),
          title: "Komentar baru pada work item",
          body: "Ada komentar baru yang perlu diperiksa.",
          data: {
            work_item_id: id,
            comment_id: comment!.id,
          },
          dedupKey: `comment_added:${comment!.id}`,
        });
      } catch (notificationError) {
        console.error("[POST /comments] Gagal mempublikasikan event notifikasi:", notificationError);
      }
    }

    return NextResponse.json({ data: comment }, { status: 201 });
  } catch (err) {
    console.error("[POST /comments] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}
