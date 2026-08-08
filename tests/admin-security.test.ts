import { NextResponse } from "next/server";
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
import { GET as getDeadLetters, POST as postDeadLetters } from "@/app/api/admin/dead-letters/route";

function query(data: unknown, error: unknown = null, count: number | null = null) {
  const chain = {
    count,
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data, error, count })),
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

  it("mengembalikan pagination dan tidak mengirim field private dead-letter", async () => {
    const deadLetters = query([{ id: "dead-1", event_type: "job.failed", payload: { secret: "value" }, error_message: "private error", last_error: "private detail", status: "pending", retry_count: 2, created_at: "2026-08-06T00:00:00.000Z" }], null, 2);
    state.admin?.from.mockReturnValue(deadLetters);

    const response = await getDeadLetters();
    expect(response.status).toBe(200);
    const responseText = await response.text();
    expect(JSON.parse(responseText)).toEqual({ items: [{ id: "dead-1", event_type: "job.failed", status: "pending", retry_count: 2, last_retry_at: null, replayed_at: null, created_at: "2026-08-06T00:00:00.000Z" }], total: 2, has_more: true });
    const body = responseText;
    expect(body).not.toContain("payload");
    expect(body).not.toContain("error_message");
    expect(body).not.toContain("last_error");
    expect(deadLetters.select).toHaveBeenCalledWith("id, event_type, status, retry_count, last_retry_at, replayed_at, created_at", { count: "exact" });
  });

  it("mengirim response generik saat GET gagal dan melog structured error", async () => {
    const error = { message: "raw db error", code: "PGRST205", hint: "private hint", details: "private details" };
    const deadLetters = query(null, error);
    state.admin?.from.mockReturnValue(deadLetters);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await getDeadLetters();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Operasi dead-letter gagal diproses." });
    expect(log).toHaveBeenCalledWith("Dead-letter operation failed", error);
    log.mockRestore();
  });

  it("tidak membocorkan raw RPC error pada replay tunggal", async () => {
    const error = { message: "raw rpc error", code: "P0001", hint: "private hint", details: "private details" };
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    state.context.admin = { from: vi.fn(), rpc };
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await postDeadLetters(new Request("http://localhost/api/admin/dead-letters", { method: "POST", body: JSON.stringify({ id: "dead-1" }) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Replay gagal diproses." });
    expect(log).toHaveBeenCalledWith("Dead-letter replay failed", error);
    log.mockRestore();
  });

  it("menyaring raw RPC error pada batch dan menangani exception", async () => {
    const error = { message: "raw batch rpc error", code: "P0001" };
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error })
      .mockRejectedValueOnce(new Error("raw batch exception"));
    const pending = query([{ id: "dead-1" }, { id: "dead-2" }]);
    state.context.admin = { from: vi.fn().mockReturnValue(pending), rpc };
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await postDeadLetters(new Request("http://localhost/api/admin/dead-letters", { method: "POST", body: JSON.stringify({ all: true, limit: 2 }) }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ processed: 0, failed: 2, results: [{ id: "dead-1", success: false, error: "Replay gagal diproses." }, { id: "dead-2", success: false, error: "Replay gagal diproses." }] });
    expect(JSON.stringify(body)).not.toContain("raw");
    expect(log).toHaveBeenCalledTimes(2);
    expect(pending.eq).toHaveBeenCalledWith("organization_id", "org-1");
    log.mockRestore();
  });

  it("menghormati permission dan organization scope dead-letter", async () => {
    const permission = vi.mocked((await import("@/lib/authorization")).requirePermission);
    permission.mockResolvedValueOnce(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const response = await getDeadLetters();
    expect(response.status).toBe(403);
    permission.mockResolvedValue(null);
  });
});
