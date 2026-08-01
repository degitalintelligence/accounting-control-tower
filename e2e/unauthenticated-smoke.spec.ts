import { expect, test } from "@playwright/test";

test("health endpoint responds without authentication", async ({ request }) => {
  const response = await request.get("/api/health");

  expect([200, 503].includes(response.status())).toBe(true);
  const body = await response.json();
  expect(/^(ok|degraded)$/.test(body.status)).toBe(true);
});
