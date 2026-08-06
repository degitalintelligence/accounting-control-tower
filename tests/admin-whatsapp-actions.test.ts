import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  admin: null as { from: ReturnType<typeof vi.fn> } | null,
  context: { organizationId: "org-1", clientIds: ["client-1"], isOrgWide: false, userId: "user-1", admin: null as unknown },
  audit: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({
  getAuthContext: vi.fn(async () => ({ context: state.context })),
  requirePermission: vi.fn(async () => null),
  canAccessOptionalClient: vi.fn((_, clientId) => clientId == null || clientId === "client-1"),
}));

vi.mock("@/lib/audit/logger", () => ({ logAudit: state.audit }));

import { POST } from "@/app/api/admin/whatsapp/route";

function chain(result: { data: unknown; error: unknown }) {
  const value = { select: vi.fn(), eq: vi.fn(), update: vi.fn(), maybeSingle: vi.fn(), single: vi.fn() };
  value.select.mockReturnValue(value);
  value.eq.mockReturnValue(value);
  value.update.mockReturnValue(value);
  value.maybeSingle.mockResolvedValue(result);
  value.single.mockResolvedValue(result);
  return value;
}

beforeEach(() => {
  state.admin = { from: vi.fn() };
  state.context.admin = state.admin;
  state.audit.mockReset();
});

describe("aksi admin WhatsApp", () => {
  it("menonaktifkan group dalam scope tenant dan mencatat audit", async () => {
    const existing = chain({ data: { id: "group-1", client_id: "client-1", provider_group_id: "provider-1", is_active: true, activated_by: "user-2", activated_at: "2026-08-06T00:00:00Z" }, error: null });
    const updated = chain({ data: { id: "group-1", client_id: "client-1", provider_group_id: "provider-1", is_active: false }, error: null });
    state.admin?.from.mockImplementationOnce(() => existing).mockImplementationOnce(() => updated);
    const response = await POST(new Request("http://localhost/api/admin/whatsapp", { method: "POST", body: JSON.stringify({ action: "deactivate-group", id: "group-1" }) }));
    expect(response.status).toBe(200);
    expect(updated.update).toHaveBeenCalledWith({ is_active: false, activated_by: null, activated_at: null });
    expect(state.audit).toHaveBeenCalledWith(state.admin, expect.objectContaining({ action: "whatsapp_group.deactivated", entityType: "wa_group" }));
  });

  it("menolak group di luar client scope", async () => {
    const existing = chain({ data: { id: "group-1", client_id: "client-2", is_active: true }, error: null });
    state.admin?.from.mockReturnValue(existing);
    const response = await POST(new Request("http://localhost/api/admin/whatsapp", { method: "POST", body: JSON.stringify({ action: "deactivate-group", id: "group-1" }) }));
    expect(response.status).toBe(403);
    expect(existing.update).not.toHaveBeenCalled();
  });

  it("membatalkan verifikasi mapping setelah validasi group scope", async () => {
    const mapping = chain({ data: { id: "mapping-1", wa_group_id: "group-1", profile_id: "profile-1", is_verified: true }, error: null });
    const group = chain({ data: { id: "group-1", organization_id: "org-1", client_id: "client-1", provider_group_id: "provider-1" }, error: null });
    const updated = chain({ data: { id: "mapping-1", wa_group_id: "group-1", is_verified: false }, error: null });
    state.admin?.from.mockImplementationOnce(() => mapping).mockImplementationOnce(() => group).mockImplementationOnce(() => updated);
    const response = await POST(new Request("http://localhost/api/admin/whatsapp", { method: "POST", body: JSON.stringify({ action: "unverify-mapping", id: "mapping-1" }) }));
    expect(response.status).toBe(200);
    expect(updated.update).toHaveBeenCalledWith({ is_verified: false });
    expect(state.audit).toHaveBeenCalledWith(state.admin, expect.objectContaining({ action: "whatsapp_mapping.unverified", entityType: "wa_participant_mapping" }));
  });

  it("menolak status group yang bukan boolean", async () => {
    const existing = chain({ data: { id: "group-1", client_id: "client-1", is_active: "true" }, error: null });
    state.admin?.from.mockReturnValue(existing);
    const response = await POST(new Request("http://localhost/api/admin/whatsapp", { method: "POST", body: JSON.stringify({ action: "deactivate-group", id: "group-1" }) }));
    expect(response.status).toBe(409);
    expect(existing.update).not.toHaveBeenCalled();
  });
});
