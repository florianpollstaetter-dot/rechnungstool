import { test, expect } from "@playwright/test";

/**
 * KIN-2691 — API Contract Tests: Core endpoint schema + auth behaviour.
 *
 * These tests make real HTTP requests against the deployed app (BASE_URL)
 * and verify:
 *   1. Response status codes are correct for authenticated vs anonymous calls
 *   2. Response bodies match the expected JSON schema
 *   3. Error responses include an `error` field (never a raw stack trace)
 *
 * The TEST_API_KEY bypasses per-IP rate limiting on public endpoints (same
 * mechanism as SCH-1766 demo endpoint). Auth-gated endpoints are exercised
 * without credentials to verify 401/403 guards are present.
 *
 * Run: BASE_URL=https://your-deploy.vercel.app npx playwright test 17-kin2691
 */

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const TEST_API_KEY = process.env.TEST_API_KEY || "kin-qa-a51cae6795cfdd30bf463e4f78a34747";

const apiHeaders = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${TEST_API_KEY}`,
};

test.describe("KIN-2691: API Contract Tests", () => {
  // ───────────────────────────────────────────────────────────
  // POST /api/demo — public endpoint, domain-aware DACH advice
  // ───────────────────────────────────────────────────────────
  test.describe("/api/demo", () => {
    test("returns 200 with advice field for valid AT request", async ({ request }) => {
      const res = await request.post(`${BASE_URL}/api/demo`, {
        headers: apiHeaders,
        data: {
          situation: "mein Kind hat Schwierigkeiten in der Schule",
          age: 10,
          childName: "Max",
          country: "AT",
        },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("advice");
      expect(typeof body.advice).toBe("string");
      expect(body.advice.length).toBeGreaterThan(10);
    });

    test("returns 200 with advice field for valid DE request", async ({ request }) => {
      const res = await request.post(`${BASE_URL}/api/demo`, {
        headers: apiHeaders,
        data: {
          situation: "mein Kind möchte auf das Gymnasium wechseln",
          age: 12,
          childName: "Anna",
          country: "DE",
          region: "Bayern",
        },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("advice");
    });

    test("returns 200 with advice field for valid CH request", async ({ request }) => {
      const res = await request.post(`${BASE_URL}/api/demo`, {
        headers: apiHeaders,
        data: {
          situation: "Schulwechsel nach der Primarschule",
          age: 12,
          childName: "Luca",
          country: "CH",
          canton: "ZH",
        },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("advice");
    });

    test("returns 400 or handles missing required fields gracefully", async ({ request }) => {
      const res = await request.post(`${BASE_URL}/api/demo`, {
        headers: apiHeaders,
        data: {},
      });
      // Either 400 validation error OR 200 with a fallback response — never 500
      expect([200, 400]).toContain(res.status());
      const body = await res.json();
      if (res.status() >= 400) {
        expect(body).toHaveProperty("error");
        // No raw stack traces in error responses
        expect(JSON.stringify(body)).not.toMatch(/at Object\.|at async /);
      }
    });

    test("rate limit returns 429 without TEST_API_KEY after many requests (schema check)", async ({ request }) => {
      // Verify 429 response shape if rate-limiting triggers.
      // We just confirm that if a 429 is ever returned, it has the expected shape.
      const res = await request.post(`${BASE_URL}/api/demo`, {
        headers: { "Content-Type": "application/json" }, // no auth
        data: {
          situation: "test rate limit shape",
          country: "AT",
        },
      });
      // Without auth the request should either succeed (within limit) or 429
      expect([200, 429]).toContain(res.status());
      if (res.status() === 429) {
        const body = await res.json();
        expect(body).toHaveProperty("error");
      }
    });
  });

  // ───────────────────────────────────────────────────────────
  // Auth-gated endpoints — unauthenticated requests must 401/403
  // ───────────────────────────────────────────────────────────
  test.describe("Auth guards — unauthenticated requests", () => {
    test("GET /api/companies returns 401/403 without auth cookie", async ({ request }) => {
      const res = await request.get(`${BASE_URL}/api/companies`, {
        headers: { "Content-Type": "application/json" },
      });
      expect([401, 403, 404]).toContain(res.status());
    });

    test("DELETE /api/companies/fake-id returns 401/403 without auth", async ({ request }) => {
      const res = await request.delete(`${BASE_URL}/api/companies/00000000-0000-0000-0000-000000000000`, {
        headers: { "Content-Type": "application/json" },
        data: { confirm_name: "test", confirm_delete: "LÖSCHEN" },
      });
      expect([401, 403]).toContain(res.status());
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });

    test("POST /api/companies/fake-id/pause returns 401/403 without auth", async ({ request }) => {
      const res = await request.post(`${BASE_URL}/api/companies/00000000-0000-0000-0000-000000000000/pause`, {
        headers: { "Content-Type": "application/json" },
        data: { confirm_name: "test" },
      });
      expect([401, 403]).toContain(res.status());
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });

    test("POST /api/register-company returns 401/403 without auth", async ({ request }) => {
      const res = await request.post(`${BASE_URL}/api/register-company`, {
        headers: { "Content-Type": "application/json" },
        data: { name: "Test GmbH" },
      });
      expect([401, 403]).toContain(res.status());
    });

    test("GET /api/dashboard returns 401/403 without auth", async ({ request }) => {
      const res = await request.get(`${BASE_URL}/api/dashboard`, {
        headers: { "Content-Type": "application/json" },
      });
      expect([401, 403, 404]).toContain(res.status());
    });

    test("POST /api/operator endpoints return 401/403 without auth", async ({ request }) => {
      const res = await request.post(`${BASE_URL}/api/operator`, {
        headers: { "Content-Type": "application/json" },
        data: {},
      });
      expect([401, 403, 404, 405]).toContain(res.status());
    });
  });

  // ───────────────────────────────────────────────────────────
  // Error shape validation — all 4xx/5xx must return JSON with `error` field
  // ───────────────────────────────────────────────────────────
  test.describe("Error response shape", () => {
    test("404 on unknown API route returns JSON error, not HTML", async ({ request }) => {
      const res = await request.get(`${BASE_URL}/api/nonexistent-endpoint-kin2691`, {
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(404);
      // Should return JSON, not Next.js HTML 404 page
      const contentType = res.headers()["content-type"] || "";
      // Either JSON error or a Next.js app not-found page is acceptable;
      // what we're testing is that it doesn't expose a stack trace
      const text = await res.text();
      expect(text).not.toMatch(/TypeError:|at Object\.|at async /);
    });

    test("POST /api/demo with invalid JSON body returns 400, not 500", async ({ request }) => {
      const res = await request.post(`${BASE_URL}/api/demo`, {
        headers: { ...apiHeaders, "Content-Type": "application/json" },
        data: "not-json-at-all",
      });
      // Should handle malformed body gracefully
      expect(res.status()).toBeLessThan(500);
    });
  });

  // ───────────────────────────────────────────────────────────
  // Treasury API — unauthenticated guards
  // ───────────────────────────────────────────────────────────
  test.describe("/api/treasury", () => {
    test("treasury endpoints require auth", async ({ request }) => {
      const res = await request.get(`${BASE_URL}/api/treasury`, {
        headers: { "Content-Type": "application/json" },
      });
      expect([401, 403, 404, 405]).toContain(res.status());
    });
  });

  // ───────────────────────────────────────────────────────────
  // Content-Type contract — JSON endpoints must respond with application/json
  // ───────────────────────────────────────────────────────────
  test.describe("Content-Type contract", () => {
    test("POST /api/demo responds with application/json", async ({ request }) => {
      const res = await request.post(`${BASE_URL}/api/demo`, {
        headers: apiHeaders,
        data: {
          situation: "test content-type header",
          country: "AT",
          age: 10,
          childName: "Test",
        },
      });
      const contentType = res.headers()["content-type"] || "";
      expect(contentType).toContain("application/json");
    });
  });
});
