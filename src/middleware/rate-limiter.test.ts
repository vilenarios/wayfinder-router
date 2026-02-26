import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { createRateLimitMiddleware } from "./rate-limiter.js";
import type { RouterConfig } from "../types/index.js";

function createTestConfig(overrides?: Partial<RouterConfig["rateLimit"]>) {
  return {
    rateLimit: {
      enabled: true,
      windowMs: 60_000,
      maxRequests: 3,
      ...overrides,
    },
  } as RouterConfig;
}

function createApp(config: RouterConfig) {
  const app = new Hono();
  app.use("*", createRateLimitMiddleware(config));
  app.get("/test", (c) => c.text("ok"));
  app.get("/health", (c) => c.text("healthy"));
  app.get("/ready", (c) => c.text("ready"));
  app.get("/metrics", (c) => c.text("metrics"));
  return app;
}

describe("rate limiter middleware", () => {
  it("passes requests through when disabled", async () => {
    const config = createTestConfig({ enabled: false });
    const app = createApp(config);

    for (let i = 0; i < 10; i++) {
      const res = await app.request("/test");
      expect(res.status).toBe(200);
    }
  });

  it("allows requests within the limit", async () => {
    const config = createTestConfig({ maxRequests: 5 });
    const app = createApp(config);

    for (let i = 0; i < 5; i++) {
      const res = await app.request("/test", {
        headers: { "x-forwarded-for": "unique-ip-" + Math.random() },
      });
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 when limit is exceeded", async () => {
    const config = createTestConfig({ maxRequests: 2 });
    const app = createApp(config);
    const clientIp = "192.168.1.100";

    // First 2 requests should pass
    for (let i = 0; i < 2; i++) {
      const res = await app.request("/test", {
        headers: { "x-forwarded-for": clientIp },
      });
      expect(res.status).toBe(200);
    }

    // Third request should be rate limited
    const res = await app.request("/test", {
      headers: { "x-forwarded-for": clientIp },
    });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("RATE_LIMITED");
  });

  it("adds rate limit headers", async () => {
    const config = createTestConfig({ maxRequests: 10 });
    const app = createApp(config);

    const res = await app.request("/test", {
      headers: { "x-forwarded-for": "10.0.0.1" },
    });
    expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(res.headers.get("X-RateLimit-Remaining")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
  });

  it("includes Retry-After header on 429", async () => {
    const config = createTestConfig({ maxRequests: 1 });
    const app = createApp(config);
    const ip = "10.0.0.2";

    await app.request("/test", {
      headers: { "x-forwarded-for": ip },
    });
    const res = await app.request("/test", {
      headers: { "x-forwarded-for": ip },
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("tracks IPs independently", async () => {
    const config = createTestConfig({ maxRequests: 1 });
    const app = createApp(config);

    const res1 = await app.request("/test", {
      headers: { "x-forwarded-for": "1.1.1.1" },
    });
    expect(res1.status).toBe(200);

    const res2 = await app.request("/test", {
      headers: { "x-forwarded-for": "2.2.2.2" },
    });
    expect(res2.status).toBe(200);
  });

  it("uses x-real-ip as fallback", async () => {
    const config = createTestConfig({ maxRequests: 1 });
    const app = createApp(config);

    const res1 = await app.request("/test", {
      headers: { "x-real-ip": "3.3.3.3" },
    });
    expect(res1.status).toBe(200);

    const res2 = await app.request("/test", {
      headers: { "x-real-ip": "3.3.3.3" },
    });
    expect(res2.status).toBe(429);
  });
});
