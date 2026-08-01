import { vi } from "vitest";

export const TEST_USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "tester@example.test",
};

export const TEST_ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";
export const TEST_WORK_ITEM_ID = "33333333-3333-4333-8333-333333333333";

type QueryResult = { data: unknown; error: unknown };

export function createQueryMock(result: QueryResult) {
  const query = {
    eq: vi.fn(),
    is: vi.fn(),
    limit: vi.fn(),
    select: vi.fn(),
    single: vi.fn(),
    then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(resolve(result)),
  };

  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.single.mockReturnValue(query);
  return query;
}

export function createAdminMock(results: Record<string, QueryResult>) {
  const from = vi.fn((table: string) => createQueryMock(results[table] ?? { data: [], error: null }));
  return { from };
}

export function createRequest(body: unknown, headers?: HeadersInit) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

export function createMalformedJsonRequest() {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{malformed",
  });
}

export function routeContext(id = TEST_WORK_ITEM_ID) {
  return { params: Promise.resolve({ id }) };
}
