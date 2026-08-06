import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminMock, TEST_ORGANIZATION_ID, TEST_USER } from "./helpers/api-mocks";

const mocks = vi.hoisted(() => ({
  admin: null as ReturnType<typeof createAdminMock> | null,
}));

vi.mock("@/lib/authorization", () => ({
  getAuthContext: vi.fn(async () => ({
    context: {
      userId: TEST_USER.id,
      admin: mocks.admin,
      organizationId: TEST_ORGANIZATION_ID,
      memberships: [],
      clientIds: [],
      isOrgWide: true,
      locale: "id",
    },
  })),
  requirePermission: vi.fn(async () => null),
}));

import { GET } from "@/app/api/admin/job-health/route";

const staleDate = new Date(Date.now() - 16 * 60000).toISOString();

beforeEach(() => {
  mocks.admin = null;
});

describe("GET /api/admin/job-health", () => {
  it("tidak menganggap error dead-letter dan recurring sebagai empty atau healthy", async () => {
    mocks.admin = createAdminMock({
      outbox_events: { data: [], error: null },
      dead_letter_events: { data: null, error: { code: "PGRST205", message: "secret table detail" } },
      recurrence_job_runs: { data: null, error: { code: "42501", message: "sensitive database detail" } },
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.workers[0].status).toBe("healthy");
    expect(body.workers[1]).toMatchObject({ status: "unknown", data_source: "database", error: { code: "PGRST205" } });
    expect(body.workers[2]).toMatchObject({ status: "unknown", data_source: "database", error: { code: "42501" } });
    expect(JSON.stringify(body)).not.toContain("secret table detail");
    expect(JSON.stringify(body)).not.toContain("sensitive database detail");
  });

  it("menggunakan lease_expires_at untuk mendeteksi processing yang stale", async () => {
    mocks.admin = createAdminMock({
      outbox_events: {
        data: [{ status: "processing", created_at: new Date().toISOString(), claimed_at: new Date().toISOString(), lease_expires_at: staleDate }],
        error: null,
      },
      dead_letter_events: { data: [], error: null },
      recurrence_job_runs: { data: [], error: null },
    });

    const body = await (await GET()).json();

    expect(body.workers[0]).toMatchObject({ status: "degraded", processing: 1 });
  });

  it("menggunakan claimed_at saat lease tidak tersedia", async () => {
    mocks.admin = createAdminMock({
      outbox_events: {
        data: [{ status: "processing", created_at: new Date().toISOString(), claimed_at: staleDate, lease_expires_at: null }],
        error: null,
      },
      dead_letter_events: { data: [], error: null },
      recurrence_job_runs: { data: [], error: null },
    });

    const body = await (await GET()).json();

    expect(body.workers[0].status).toBe("degraded");
  });
});
