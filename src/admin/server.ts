/**
 * Admin UI Server
 * Runs on a separate port from the public router.
 * Bound to 127.0.0.1 by default (localhost-only access).
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Logger, RouterConfig } from "../types/index.js";
import type { RouterServices } from "../server.js";
import { createAdminRoutes } from "./handler.js";
import packageJson from "../../package.json" with { type: "json" };

const ROUTER_VERSION: string = packageJson.version;

export interface AdminServerOptions {
  config: RouterConfig;
  logger: Logger;
  services: RouterServices;
  startTime: number;
}

export function createAdminServer(options: AdminServerOptions) {
  const { config, logger, services } = options;

  const app = new Hono();

  // CORS for admin UI
  app.use("*", cors());

  // Token auth middleware (when ADMIN_TOKEN is set)
  if (config.admin.token) {
    app.use("/api/*", async (c, next) => {
      const authHeader = c.req.header("Authorization");
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;
      if (token !== config.admin.token) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      return next();
    });
  }

  // Mount admin routes
  const adminRoutes = createAdminRoutes({
    config,
    logger,
    version: ROUTER_VERSION,
    startTime: options.startTime,
    gatewaySelector: services.gatewaySelector,
    arnsResolver: services.arnsResolver,
    contentFetcher: services.contentFetcher,
    telemetryService: services.telemetryService,
    contentCache: services.contentCache,
    pingService: services.pingService,
    blocklistService: services.blocklistService,
    networkGatewayManager: services.networkGatewayManager,
    wayfinderServices: services.wayfinderServices,
  });

  app.route("/", adminRoutes);

  return { app };
}
