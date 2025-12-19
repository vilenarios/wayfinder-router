/**
 * Wayfinder Router Server
 * Main Hono server setup with all middleware and handlers
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";

import type {
  RouterConfig,
  Logger,
  RequestInfo,
  RouterMode,
} from "./types/index.js";
import { createRequestParserMiddleware } from "./middleware/request-parser.js";
import { createModeSelectorMiddleware } from "./middleware/mode-selector.js";
import { createRateLimitMiddleware } from "./middleware/rate-limiter.js";
import { createErrorResponse } from "./middleware/error-handler.js";

import {
  createWayfinderServices,
  createNetworkManager,
  type WayfinderServices,
} from "./services/wayfinder-client.js";
import type { NetworkGatewayManager } from "./services/network-gateway-manager.js";
import {
  createArnsResolver,
  type ArnsResolver,
} from "./services/arns-resolver.js";
import {
  createGatewaySelector,
  type GatewaySelector,
} from "./services/gateway-selector.js";
import { createVerifier, type Verifier } from "./services/verifier.js";
import {
  createContentFetcher,
  type ContentFetcher,
} from "./services/content-fetcher.js";
import {
  createManifestResolver,
  type ManifestResolver,
} from "./services/manifest-resolver.js";

import { createProxyHandler } from "./handlers/proxy.js";
import { createRouteHandler } from "./handlers/route.js";
import {
  createHealthHandler,
  createReadyHandler,
  createMetricsHandler,
} from "./handlers/health.js";
import {
  createGatewayStatsHandler,
  createGatewayDetailHandler,
  createGatewayListHandler,
  createRewardExportHandler,
} from "./handlers/stats.js";
import {
  TelemetryService,
  createDisabledTelemetryService,
} from "./telemetry/service.js";
import { ContentCache } from "./cache/content-cache.js";

// Extend Hono context with our custom variables
declare module "hono" {
  interface ContextVariableMap {
    requestInfo: RequestInfo;
    routerMode: RouterMode;
  }
}

export interface RouterServices {
  arnsResolver: ArnsResolver;
  gatewaySelector: GatewaySelector;
  verifier: Verifier;
  contentFetcher: ContentFetcher;
  manifestResolver: ManifestResolver;
  telemetryService: TelemetryService | null;
  contentCache: ContentCache;
  wayfinderServices: WayfinderServices;
  networkGatewayManager: NetworkGatewayManager | null;
}

export interface CreateServerOptions {
  config: RouterConfig;
  logger: Logger;
}

/**
 * Create and configure the Hono server
 */
export function createServer(options: CreateServerOptions) {
  const { config, logger } = options;
  const startTime = Date.now();

  // Create network gateway manager if needed (for network/top-staked sources)
  const networkGatewayManager = createNetworkManager(config, logger);

  // Initialize Wayfinder SDK services (network manager must be initialized later)
  const wayfinderServices = createWayfinderServices(
    config,
    logger,
    networkGatewayManager,
  );

  // Initialize application services
  // ArNS resolver uses verification gateways for consensus
  const arnsResolver = createArnsResolver(
    config,
    logger,
    wayfinderServices.verificationGatewaysProvider,
  );

  const gatewaySelector = createGatewaySelector(
    wayfinderServices.routingStrategy,
    wayfinderServices.routingGatewaysProvider,
    config,
    logger,
  );

  const verifier = createVerifier(
    wayfinderServices.verificationStrategy,
    wayfinderServices.verificationGatewaysProvider,
    config,
    logger,
  );

  const contentFetcher = createContentFetcher(gatewaySelector, config, logger);

  // Initialize manifest resolver for verifying path manifests
  // Uses the same verification gateways as ArNS resolver for trust
  const manifestResolver = createManifestResolver(
    config,
    logger,
    wayfinderServices.verificationGatewaysProvider,
  );

  // Initialize verified content cache
  const contentCache = new ContentCache({
    enabled: config.cache.contentEnabled,
    maxSizeBytes: config.cache.contentMaxSizeBytes,
    maxItemSizeBytes: config.cache.contentMaxItemSizeBytes,
    ttlMs: 0, // No TTL - Arweave content is immutable
    logger,
  });

  // Initialize telemetry service
  let telemetryService: TelemetryService | null = null;
  if (config.telemetry.enabled) {
    telemetryService = new TelemetryService({
      config: config.telemetry,
      logger,
      routerId: config.telemetry.routerId,
      routerVersion: process.env.npm_package_version || "0.1.0",
      baseDomain: config.server.baseDomain,
    });
    logger.info("Telemetry service initialized", {
      routerId: config.telemetry.routerId,
      samplingRate: config.telemetry.sampling.successfulRequests,
    });
  } else {
    createDisabledTelemetryService(logger);
  }

  const services: RouterServices = {
    arnsResolver,
    gatewaySelector,
    verifier,
    contentFetcher,
    manifestResolver,
    telemetryService,
    contentCache,
    wayfinderServices,
    networkGatewayManager,
  };

  // Create Hono app
  const app = new Hono();

  // Global middleware
  app.use("*", cors());

  // Rate limiting (applied early, but skips health endpoints internally)
  app.use("*", createRateLimitMiddleware(config));

  // Request logging (only in development)
  if (config.logging.level === "debug") {
    app.use("*", honoLogger());
  }

  // Request parsing middleware
  app.use("*", createRequestParserMiddleware(config));

  // Mode selection middleware
  app.use("*", createModeSelectorMiddleware(config));

  // Health check endpoints (before main routing)
  const healthDeps = {
    gatewaySelector,
    arnsResolver,
    config,
    logger,
    startTime,
  };

  app.get("/health", createHealthHandler(healthDeps));
  app.get("/ready", createReadyHandler(healthDeps));

  // Metrics endpoint (enhanced with telemetry and cache metrics)
  const baseMetricsHandler = createMetricsHandler(healthDeps);
  app.get("/metrics", async (c) => {
    const baseResponse = await baseMetricsHandler(c);
    let metrics = await baseResponse.text();

    // Add content cache metrics
    if (contentCache.isEnabled()) {
      metrics += contentCache.getPrometheusMetrics();
    }

    // Add telemetry metrics if enabled
    if (telemetryService) {
      metrics += telemetryService.getPrometheusMetrics();
    }

    return new Response(metrics, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; version=0.0.4",
      },
    });
  });

  // Stats API endpoints (only when telemetry enabled)
  const statsDeps = { telemetryService, logger };
  app.get("/stats/gateways", createGatewayStatsHandler(statsDeps));
  app.get("/stats/gateways/list", createGatewayListHandler(statsDeps));
  app.get("/stats/gateways/:gateway", createGatewayDetailHandler(statsDeps));
  app.get("/stats/export", createRewardExportHandler(statsDeps));

  // Main request handler
  app.all("*", async (c) => {
    const requestInfo = c.get("requestInfo");
    const routerMode = c.get("routerMode");

    // Skip reserved paths
    if (requestInfo.type === "reserved") {
      // Check for specific reserved paths
      if (
        requestInfo.path === "/health" ||
        requestInfo.path === "/ready" ||
        requestInfo.path === "/metrics"
      ) {
        // Already handled above, this shouldn't happen
        return c.json({ error: "Not Found" }, 404);
      }

      // Root path without txId
      if (requestInfo.path === "/" || requestInfo.path === "") {
        return c.json({
          name: "Wayfinder Router",
          version: process.env.npm_package_version || "0.1.0",
          description: "Lightweight proxy router for ar.io network gateways",
          endpoints: {
            arns: "https://{arnsName}." + config.server.baseDomain,
            txid: "https://" + config.server.baseDomain + "/{txId}",
            health: "/health",
            ready: "/ready",
            metrics: "/metrics",
          },
          mode: config.mode.default,
          verification: {
            enabled: config.verification.enabled,
          },
        });
      }

      return c.json({ error: "Not Found", path: requestInfo.path }, 404);
    }

    // Route to appropriate handler based on mode
    try {
      if (routerMode === "route") {
        const routeHandler = createRouteHandler({
          arnsResolver,
          gatewaySelector,
          config,
          logger,
          telemetryService,
        });
        return await routeHandler(c);
      } else {
        const proxyHandler = createProxyHandler({
          arnsResolver,
          contentFetcher,
          verifier,
          manifestResolver,
          config,
          logger,
          telemetryService,
          contentCache,
        });
        return await proxyHandler(c);
      }
    } catch (error) {
      return createErrorResponse(
        c,
        error instanceof Error ? error : new Error(String(error)),
        logger,
      );
    }
  });

  // Global error handler
  app.onError((err, c) => {
    return createErrorResponse(c, err, logger);
  });

  logger.info("Server created", {
    baseDomain: config.server.baseDomain,
    mode: config.mode.default,
    verificationEnabled: config.verification.enabled,
    routingStrategy: config.routing.strategy,
    rateLimitEnabled: config.rateLimit.enabled,
  });

  return { app, services };
}
