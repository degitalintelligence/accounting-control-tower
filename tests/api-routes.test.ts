import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAdminMock,
  createMalformedJsonRequest,
  createRequest,
  routeContext,
  TEST_ORGANIZATION_ID,
  TEST_USER,
  TEST_WORK_ITEM_ID,
} from "./helpers/api-mocks";

const mocks = vi.hoisted(() => ({
  user: null as typeof TEST_USER | null,
  admin: null as ReturnType<typeof createAdminMock> | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mocks.user } })) },
  })),
  createServiceRoleClient: vi.fn(() => mocks.admin),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined),
  })),
}));

vi.mock("@/lib/ai/locale", () => ({
  resolveOrganizationLocale: vi.fn(async () => "id-ID"),
}));

vi.mock("@/lib/audit/logger", () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/notification", () => ({ publishNotificationEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/notification/publisher", () => ({ publishNotificationEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/checklists", () => ({
  getIncompleteRequiredChecklist: vi.fn(async () => []),
}));
vi.mock("@/lib/work-engine/status-machine", async () => {
  const actual = await vi.importActual<typeof import("@/lib/work-engine/status-machine")>("@/lib/work-engine/status-machine");
  return { ...actual, transitionWorkItem: vi.fn(() => ({ success: true })) };
});

import { POST as transitionPost } from "@/app/api/work-items/[id]/transition/route";
import { POST as reviewPost } from "@/app/api/work-items/[id]/reviews/route";

const membership = [{ organization_id: TEST_ORGANIZATION_ID, client_id: null, role: "administrator", role_id: null }];
const transitionItem = {
  id: TEST_WORK_ITEM_ID,
  organization_id: TEST_ORGANIZATION_ID,
  status: "submitted",
  risk_level: "high",
  client_id: "44444444-4444-4444-8444-444444444444",
};

function setupTransition(overrides: Record<string, unknown> = {}) {
  mocks.admin = createAdminMock({
    memberships: { data: membership, error: null },
    organizations: { data: [{ id: TEST_ORGANIZATION_ID }], error: null },
    work_items: { data: { ...transitionItem, ...overrides }, error: null },
    assignments: { data: [{ role: "maker" }], error: null },
  });
}

function setupReview(role: string, membershipOrganizationId = TEST_ORGANIZATION_ID, itemOrganizationId = membershipOrganizationId) {
  mocks.admin = createAdminMock({
    memberships: { data: [{ organization_id: membershipOrganizationId, client_id: null, role: "administrator", role_id: null }], error: null },
    organizations: { data: [{ id: membershipOrganizationId }], error: null },
    work_items: {
      data: membershipOrganizationId === itemOrganizationId ? {
        id: TEST_WORK_ITEM_ID,
        organization_id: itemOrganizationId,
        client_id: null,
        status: "awaiting_approval",
        risk_level: "critical",
        checklist_template_id: null,
        assignments: [{ id: "assignment-1", profile_id: TEST_USER.id, role, unassigned_at: null }],
      } : null,
      error: null,
    },
  });
}

beforeEach(() => {
  mocks.user = TEST_USER;
  mocks.admin = null;
});

describe("API integration foundation", () => {
  it("menolak request transition tanpa autentikasi", async () => {
    mocks.user = null;
    const response = await transitionPost(createRequest({ to_status: "under_review" }) as never, routeContext());
    expect(response.status).toBe(401);
  });

  it("menolak payload transition yang malformed sebelum query work item", async () => {
    setupTransition();
    const response = await transitionPost(createMalformedJsonRequest() as never, routeContext());
    expect(response.status).toBe(400);
    expect(mocks.admin?.from).toHaveBeenCalledWith("memberships");
    expect(mocks.admin?.from).not.toHaveBeenCalledWith("work_items");
  });

  it("menolak transisi high-risk dari role assignment yang tidak berwenang", async () => {
    setupTransition();
    const response = await transitionPost(createRequest({ to_status: "under_review" }) as never, routeContext());
    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain("checker");
  });

  it("menolak review dari tenant lain sebagai not found", async () => {
    setupReview("checker", TEST_ORGANIZATION_ID, "55555555-5555-4555-8555-555555555555");
    const response = await reviewPost(createRequest({ kind: "approval", decision: "approved" }) as never, routeContext());
    expect(response.status).toBe(404);
  });

  it("menolak approval dari role checker", async () => {
    setupReview("checker");
    const response = await reviewPost(createRequest({ kind: "approval", decision: "approved" }) as never, routeContext());
    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain("approver");
  });

  it("menolak review payload yang tidak sesuai schema", async () => {
    setupReview("approver");
    const response = await reviewPost(createRequest({ kind: "invalid", decision: "approved" }) as never, routeContext());
    expect(response.status).toBe(400);
  });
});
