/**
 * Admin UI Handler
 * Serves the embedded SPA and provides JSON API endpoints
 */

import type { Context } from "hono";
import { Hono } from "hono";
import type { AdminDeps } from "./types.js";
import { renderAdminPage } from "./ui.js";

function getTimeRange(range: string): { startHour: string; endHour: string } {
  const now = new Date();
  const end = new Date(now);
  end.setMinutes(0, 0, 0);

  const start = new Date(end);
  switch (range) {
    case "1h":
      start.setHours(start.getHours() - 1);
      break;
    case "6h":
      start.setHours(start.getHours() - 6);
      break;
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    default: // 24h
      start.setDate(start.getDate() - 1);
      break;
  }

  return {
    startHour: start.toISOString().slice(0, 13) + ":00:00.000Z",
    endHour: end.toISOString().slice(0, 13) + ":00:00.000Z",
  };
}

export function createAdminRoutes(deps: AdminDeps): Hono {
  const admin = new Hono();
  const html = renderAdminPage(deps.version);

  // Serve the SPA HTML
  admin.get("/", (c: Context) => {
    return c.html(html);
  });

  // Status API - aggregated dashboard data
  admin.get("/api/status", (c: Context) => {
    const uptimeMs = Date.now() - deps.startTime;
    const gatewayHealth = deps.gatewaySelector.healthStats();
    const cacheStats = deps.contentCache.stats();
    const pingStats = deps.pingService?.getStats() ?? null;
    const needsSetup = deps.config.server.baseDomain === "localhost";

    return c.json({
      uptimeMs,
      version: deps.version,
      mode: deps.config.mode.default,
      verificationEnabled: deps.config.verification.enabled,
      verificationSource: deps.config.verification.gatewaySource,
      verificationCount: deps.config.verification.gatewayCount,
      routingStrategy: deps.config.routing.strategy,
      gateways: gatewayHealth,
      cache: cacheStats,
      ping: pingStats,
      needsSetup,
    });
  });

  // Gateways API - list with scores and telemetry
  admin.get("/api/gateways", (c: Context) => {
    const tempCache = deps.wayfinderServices.temperatureCache;

    // Get temperature scores if available
    const scores: Map<
      string,
      {
        score: number;
        avgLatencyMs: number | null;
        successRate: number | null;
      }
    > = new Map();
    if (tempCache) {
      const tempStats = tempCache.getAllScores();
      for (const s of tempStats) {
        scores.set(s.gateway, {
          score: s.score,
          avgLatencyMs: s.avgLatencyMs,
          successRate: s.successRate,
        });
      }
    }

    // Get telemetry stats if available
    const telemetryStats: Map<
      string,
      { totalRequests: number; bytesServed: number; successRate: number }
    > = new Map();
    if (deps.telemetryService) {
      const range = getTimeRange("24h");
      const stats = deps.telemetryService.getGatewayStats(
        range.startHour,
        range.endHour,
      );
      for (const s of stats) {
        telemetryStats.set(s.gateway, {
          totalRequests: s.totalRequests,
          bytesServed: s.bytesServed,
          successRate: s.successRate,
        });
      }
    }

    // Merge data sources into a unified gateway list
    const allGateways = new Set<string>();
    for (const k of scores.keys()) allGateways.add(k);
    for (const k of telemetryStats.keys()) allGateways.add(k);

    // Also add known gateways from telemetry
    if (deps.telemetryService) {
      for (const gw of deps.telemetryService.getKnownGateways()) {
        allGateways.add(gw);
      }
    }

    const gateways = Array.from(allGateways).map((gw) => {
      const scoreInfo = scores.get(gw);
      const telemetry = telemetryStats.get(gw);

      return {
        gateway: gw,
        health: scoreInfo
          ? scoreInfo.successRate !== null && scoreInfo.successRate > 0.5
            ? "healthy"
            : "unhealthy"
          : "unknown",
        score: scoreInfo?.score ?? null,
        latencyMs: scoreInfo?.avgLatencyMs ?? null,
        successRate: telemetry?.successRate ?? scoreInfo?.successRate ?? null,
        requests: telemetry?.totalRequests ?? 0,
        bytesServed: telemetry?.bytesServed ?? 0,
      };
    });

    return c.json({ gateways, total: gateways.length });
  });

  // Telemetry API
  admin.get("/api/telemetry", (c: Context) => {
    if (!deps.telemetryService) {
      return c.json({ enabled: false });
    }

    const range = getTimeRange((c.req.query("range") as string) || "24h");
    const stats = deps.telemetryService.getGatewayStats(
      range.startHour,
      range.endHour,
    );

    let totalRequests = 0;
    let successfulRequests = 0;
    let totalBytesServed = 0;
    const activeGateways = stats.length;

    for (const s of stats) {
      totalRequests += s.totalRequests;
      successfulRequests += s.successfulRequests;
      totalBytesServed += s.bytesServed;
    }

    return c.json({
      enabled: true,
      gateways: stats,
      totals: {
        totalRequests,
        successfulRequests,
        totalBytesServed,
        activeGateways,
      },
    });
  });

  // Config API - sanitized config (no tokens)
  admin.get("/api/config", (c: Context) => {
    const cfg = deps.config;
    return c.json({
      server: {
        port: cfg.server.port,
        host: cfg.server.host,
        baseDomain: cfg.server.baseDomain,
        rootHostContent: cfg.server.rootHostContent,
        restrictToRootHost: cfg.server.restrictToRootHost,
        graphqlProxyUrl: cfg.server.graphqlProxyUrl || null,
      },
      mode: cfg.mode,
      routing: {
        strategy: cfg.routing.strategy,
        gatewaySource: cfg.routing.gatewaySource,
        retryAttempts: cfg.routing.retryAttempts,
      },
      verification: {
        enabled: cfg.verification.enabled,
        gatewaySource: cfg.verification.gatewaySource,
        gatewayCount: cfg.verification.gatewayCount,
        consensusThreshold: cfg.verification.consensusThreshold,
        retryAttempts: cfg.verification.retryAttempts,
      },
      cache: {
        contentEnabled: cfg.cache.contentEnabled,
        contentMaxSizeBytes: cfg.cache.contentMaxSizeBytes,
        contentPath: cfg.cache.contentPath || null,
        arnsTtlMs: cfg.cache.arnsTtlMs,
      },
      telemetry: {
        enabled: cfg.telemetry.enabled,
        routerId: cfg.telemetry.routerId,
        retentionDays: cfg.telemetry.storage.retentionDays,
        sampling: cfg.telemetry.sampling,
      },
      rateLimit: cfg.rateLimit,
      http: {
        connectionsPerHost: cfg.http.connectionsPerHost,
        connectTimeoutMs: cfg.http.connectTimeoutMs,
        requestTimeoutMs: cfg.http.requestTimeoutMs,
      },
      shutdown: cfg.shutdown,
    });
  });

  // Moderation API (proxied for admin UI)
  admin.get("/api/moderation", (c: Context) => {
    if (!deps.config.moderation.enabled || !deps.blocklistService) {
      return c.json({ enabled: false });
    }

    const stats = deps.blocklistService.getStats();
    const entries = deps.blocklistService.getEntries();

    return c.json({ enabled: true, stats, entries });
  });

  admin.post("/api/moderation/block", async (c: Context) => {
    if (!deps.blocklistService) {
      return c.json({ error: "Moderation not enabled" }, 400);
    }

    const body = await c.req.json();
    const { type, value, reason } = body;

    if (!type || !value) {
      return c.json({ error: "type and value are required" }, 400);
    }

    const result = await deps.blocklistService.block(
      type,
      value,
      reason || "Blocked via admin UI",
      "admin-ui",
    );

    return c.json({ ok: true, ...result });
  });

  admin.post("/api/moderation/unblock", async (c: Context) => {
    if (!deps.blocklistService) {
      return c.json({ error: "Moderation not enabled" }, 400);
    }

    const body = await c.req.json();
    const { type, value } = body;

    if (!type || !value) {
      return c.json({ error: "type and value are required" }, 400);
    }

    const removed = await deps.blocklistService.unblock(type, value);
    return c.json({ ok: true, removed });
  });

  // Save .env file
  admin.post("/api/config/save", async (c: Context) => {
    const body = await c.req.json();
    const envContent = body.env;

    if (typeof envContent !== "string") {
      return c.json({ error: "env string required" }, 400);
    }

    try {
      const fs = await import("fs");
      fs.writeFileSync(".env", envContent, "utf-8");
      deps.logger.info("Admin UI: .env file saved");
      return c.json({ ok: true });
    } catch (err) {
      deps.logger.error("Admin UI: Failed to save .env", {
        error: err instanceof Error ? err.message : String(err),
      });
      return c.json({ error: "Failed to write .env file" }, 500);
    }
  });

  return admin;
}
