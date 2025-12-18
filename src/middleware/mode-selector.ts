/**
 * Mode selector middleware for Wayfinder Router
 * Determines whether to use proxy or route mode for the request
 */

import type { Context, Next } from "hono";
import type { RouterConfig, RouterMode } from "../types/index.js";

/**
 * Create mode selector middleware
 */
export function createModeSelectorMiddleware(config: RouterConfig) {
  return async (c: Context, next: Next) => {
    let mode: RouterMode = config.mode.default;

    // Check for mode override in query parameter
    if (config.mode.allowOverride) {
      const modeParam = c.req.query("mode");
      if (modeParam === "proxy" || modeParam === "route") {
        mode = modeParam;
      }
    }

    // Store selected mode in context
    c.set("routerMode", mode);

    await next();
  };
}
