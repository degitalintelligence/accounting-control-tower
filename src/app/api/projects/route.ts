import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/logger";
import { canAccessClient, getAuthContext, requirePermission } from "@/lib/authorization";

/**
 * GET /api/projects
 * List project untuk organization user, join work_items untuk info title/status.
 * Include milestone stats (total/completed count).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authContext = await getAuthContext();
    if (authContext.response) return authContext.response;
    const permissionDenied = await requirePermission(authContext.context, "work_items.view");
    if (permissionDenied) return permissionDenied;

    const { admin, organizationId, clientIds, isOrgWide } = authContext.context;

    const { searchParams } = request.nextUrl;
    if (searchParams.get("options") === "true") {
      const clientId = searchParams.get("client_id");
      if (!clientId) return NextResponse.json({ data: [] });
      if (!isOrgWide && !clientIds.includes(clientId)) return NextResponse.json({ error: "Client tidak berada dalam scope user." }, { status: 403 });
      const options = await admin.from("projects").select("id, objective, work_item_id, work_items!projects_work_item_id_fkey!inner(title, client_id, organization_id, deleted_at)").eq("work_items.organization_id", organizationId).eq("work_items.client_id", clientId).is("work_items.deleted_at", null).order("created_at", { ascending: false }).limit(100);
      const optionData = options as unknown as { data: Array<{ id: string; objective: string | null; work_item_id: string; work_items: { title: string; client_id: string; organization_id: string; deleted_at: string | null } }> | null; error: { message: string } | null };
      if (optionData.error) return NextResponse.json({ error: "Gagal memuat project." }, { status: 500 });
      return NextResponse.json({ data: (optionData.data ?? []).map((project) => ({ id: project.id, name: project.objective || project.work_items.title, client_id: project.work_items.client_id })) });
    }
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10))
    );
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const status = searchParams.get("status");
    const search = searchParams.get("search");

    // Query projects dengan join ke work_items
    let query = admin
      .from("projects")
      .select(
        `
        id,
        work_item_id,
        objective,
        success_criteria,
        start_date,
        target_date,
        budgeted_hours,
        created_at,
        updated_at,
        work_items!projects_work_item_id_fkey!inner(
          id,
          title,
          status,
          organization_id,
          client_id,
          deleted_at
        )
      `,
        { count: "exact" }
      )
      .eq("work_items.organization_id", organizationId)
      .is("work_items.deleted_at", null)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (!isOrgWide) query = query.in("work_items.client_id", clientIds);

    if (status) {
      query = query.eq("work_items.status", status);
    }
    if (search) {
      query = query.ilike("work_items.title", `%${search}%`);
    }

    const queryResult = await query;
    const { data, error, count } = queryResult as unknown as {
      data: Array<{
        id: string;
        work_item_id: string;
        objective: string | null;
        success_criteria: string | null;
        start_date: string | null;
        target_date: string | null;
        budgeted_hours: number | null;
        created_at: string;
        updated_at: string;
        work_items: {
          id: string;
          title: string;
          status: string;
          organization_id: string;
          client_id: string;
        };
      }> | null;
      error: { message: string; code: string; hint: string; details: string } | null;
      count: number | null;
    };

    if (error) {
      console.error("[GET /api/projects] Supabase error:", {
        message: error.message,
        code: error.code,
        hint: error.hint,
        details: error.details,
      });
      return NextResponse.json(
        { error: "Gagal mengambil data project." },
        { status: 500 }
      );
    }

    // Ambil milestone stats untuk setiap project
    const projects = data ?? [];
    const projectIds = projects.map((p) => p.id);

    const milestoneStats: Record<string, { total: number; completed: number }> = {};
    if (projectIds.length > 0) {
      const milestonesResult = await admin
        .from("milestones")
        .select("project_id, is_completed")
        .in("project_id", projectIds);

      const { data: milestones } = milestonesResult as unknown as {
        data: Array<{ project_id: string; is_completed: boolean }> | null;
      };

      if (milestones) {
        for (const m of milestones) {
          if (!milestoneStats[m.project_id]) {
            milestoneStats[m.project_id] = { total: 0, completed: 0 };
          }
          milestoneStats[m.project_id].total++;
          if (m.is_completed) {
            milestoneStats[m.project_id].completed++;
          }
        }
      }
    }

    const enriched = projects.map((p) => ({
      id: p.id,
      work_item_id: p.work_item_id,
      objective: p.objective,
      success_criteria: p.success_criteria,
      start_date: p.start_date,
      target_date: p.target_date,
      budgeted_hours: p.budgeted_hours,
      created_at: p.created_at,
      updated_at: p.updated_at,
      title: p.work_items.title,
      status: p.work_items.status,
      organization_id: p.work_items.organization_id,
      client_id: p.work_items.client_id,
      stats: {
        total_milestones: milestoneStats[p.id]?.total ?? 0,
        completed_milestones: milestoneStats[p.id]?.completed ?? 0,
      },
    }));

    return NextResponse.json({
      data: enriched,
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error("[GET /api/projects] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects
 * Buat project baru.
 * Option A: Link ke work_item yang sudah ada (provide work_item_id).
 * Option B: Buat work_item baru dulu (provide title, description, client_id).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authContext = await getAuthContext();
    if (authContext.response) return authContext.response;
    const permissionDenied = await requirePermission(authContext.context, "work_items.manage");
    if (permissionDenied) return permissionDenied;

    const { admin, organizationId, clientIds, isOrgWide } = authContext.context;

    const body = await request.json();
    const {
      work_item_id,
      title,
      description,
      client_id,
      objective,
      success_criteria,
      start_date,
      target_date,
      budgeted_hours,
    } = body as {
      work_item_id?: string;
      title?: string;
      description?: string;
      client_id?: string;
      objective?: string;
      success_criteria?: string;
      start_date?: string;
      target_date?: string;
      budgeted_hours?: number;
    };

    let targetWorkItemId = work_item_id;

    // Option B: Buat work_item baru jika work_item_id tidak diberikan
    if (!targetWorkItemId) {
      if (!title || !client_id) {
        return NextResponse.json(
          { error: "Field wajib: title dan client_id (atau berikan work_item_id)." },
          { status: 400 }
        );
      }
      if (!canAccessClient(authContext.context, client_id)) return NextResponse.json({ error: "Client tidak berada dalam scope akses user." }, { status: 403 });

      const clientResult = await admin.from("clients").select("id").eq("id", client_id).eq("organization_id", organizationId).is("deleted_at", null).maybeSingle();
      const client = clientResult as unknown as { data: { id: string } | null; error: unknown };
      if (client.error || !client.data) return NextResponse.json({ error: "Client tidak ditemukan dalam organisasi ini." }, { status: 400 });

      const insertWiResult = await admin
        .from("work_items")
        .insert({
          title,
          description: description ?? null,
          type: "project",
          organization_id: organizationId,
          client_id,
          status: "draft",
          created_by: user.id,
        } as never)
        .select("id")
        .single();

      const { data: newWorkItem, error: wiError } = insertWiResult as unknown as {
        data: { id: string } | null;
        error: { message: string; code: string; hint: string; details: string } | null;
      };

      if (wiError || !newWorkItem) {
        console.error("[POST /api/projects] Gagal buat work_item:", {
          message: wiError?.message,
          code: wiError?.code,
          hint: wiError?.hint,
          details: wiError?.details,
        });
        return NextResponse.json(
          { error: "Gagal membuat work item untuk project." },
          { status: 500 }
        );
      }

      targetWorkItemId = newWorkItem.id;
    } else {
      // Option A: Validasi work_item exists dan milik org yang sama
      const wiResult = await admin
        .from("work_items")
        .select("id, organization_id, client_id")
        .eq("id", targetWorkItemId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .single();

      const { data: existingWi, error: wiError } = wiResult as unknown as {
        data: { id: string; organization_id: string; client_id: string } | null;
        error: { message: string } | null;
      };

      if (wiError || !existingWi || (!isOrgWide && !clientIds.includes(existingWi.client_id))) {
        return NextResponse.json(
          { error: "Work item tidak ditemukan atau bukan milik organisasi ini." },
          { status: 404 }
        );
      }
      if (!canAccessClient(authContext.context, existingWi.client_id)) return NextResponse.json({ error: "Project tidak berada dalam scope akses user." }, { status: 404 });
      if (client_id) {
        const clientResult = await admin.from("clients").select("id").eq("id", client_id).eq("organization_id", organizationId).is("deleted_at", null).maybeSingle();
        const client = clientResult as unknown as { data: { id: string } | null; error: unknown };
        if (client.error || !client.data) return NextResponse.json({ error: "Client tidak ditemukan dalam organisasi ini." }, { status: 400 });
      }
    }

    // Insert project
    const insertResult = await admin
      .from("projects")
      .insert({
        work_item_id: targetWorkItemId,
        objective: objective ?? null,
        success_criteria: success_criteria ?? null,
        start_date: start_date ?? null,
        target_date: target_date ?? null,
        budgeted_hours: budgeted_hours ?? null,
      } as never)
      .select("id, work_item_id, objective, success_criteria, start_date, target_date, budgeted_hours, created_at, updated_at")
      .single();

    const { data: project, error: insertError } = insertResult as unknown as {
      data: {
        id: string;
        work_item_id: string;
        objective: string | null;
        success_criteria: string | null;
        start_date: string | null;
        target_date: string | null;
        budgeted_hours: number | null;
        created_at: string;
        updated_at: string;
      } | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (insertError) {
      console.error("[POST /api/projects] Supabase error:", {
        message: insertError.message,
        code: insertError.code,
        hint: insertError.hint,
        details: insertError.details,
      });
      return NextResponse.json(
        { error: "Gagal membuat project." },
        { status: 500 }
      );
    }

    // Audit log
    await logAudit(admin, {
      organizationId,
      actorId: user.id,
      action: "project.created",
      entityType: "project",
      entityId: project!.id,
      newValue: project,
    });

    return NextResponse.json({ data: project }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/projects] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}
