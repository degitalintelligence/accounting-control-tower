import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  admin: null as { from: ReturnType<typeof vi.fn> } | null,
  context: {
    organizationId: "org-1",
    clientIds: ["client-1"],
    isOrgWide: false,
    admin: null as unknown,
  },
}));

vi.mock("@/lib/authorization", () => ({
  getAuthContext: vi.fn(async () => ({ context: state.context })),
  requirePermission: vi.fn(async () => null),
  canAccessClient: vi.fn(() => true),
}));

import { GET as getAudits } from "@/app/api/admin/audits/route";
import { GET as getDeadLetters } from "@/app/api/admin/dead-letters/route";

function query(data: unknown, error: unknown = null) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data, error })),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  state.admin = { from: vi.fn() };
  state.context.admin = state.admin;
});

describe("security routes administrasi", () => {
  it("membatasi audit GET ke client yang dapat diakses", async () => {
    const workItems = query([{ id: "item-1", client_id: "client-1" }]);
    const samples = query([{ id: "sample-1", work_item_id: "item-1" }]);
    const findings = query([{ id: "finding-1", client_id: "client-1" }]);
    state.admin?.from.mockImplementation((table: string) => ({ "work_items": workItems, "audit_samples": samples, "audit_findings": findings }[table]));

    const response = await getAudits();
    expect(response.status).toBe(200);
    expect(workItems.in).toHaveBeenCalledWith("client_id", ["client-1"]);
    expect(await response.json()).toEqual({ samples: [{ id: "sample-1", work_item_id: "item-1" }], findings: [{ id: "finding-1", client_id: "client-1" }] });
  });

  it("tidak mengirim payload dan error dead-letter ke browser", async () => {
    const deadLetters = query([{ id: "dead-1", event_type: "job.failed", payload: { secret: "value" }, error_message: "private error", last_error: "private detail", status: "pending", retry_count: 2, created_at: "2026-08-06T00:00:00.000Z" }]);
    state.admin?.from.mockReturnValue(deadLetters);

    const response = await getDeadLetters();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: "dead-1", event_type: "job.failed", status: "pending", retry_count: 2, last_retry_at: undefined, replayed_at: undefined, created_at: "2026-08-06T00:00:00.000Z" }]);
    expect(deadLetters.select).toHaveBeenCalledWith("id, event_type, status, retry_count, last_retry_at, replayed_at, created_at");
  });
});
