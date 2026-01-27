/**
 * Content Moderation API Handlers
 * Admin endpoints for managing the blocklist
 */

import type { Context } from "hono";
import type { Logger } from "../types/index.js";
import type { BlocklistService } from "./blocklist-service.js";
import type {
  BlockRequest,
  BlockedContentType,
  ModerationConfig,
} from "./blocklist-types.js";

export interface ModerationHandlerDeps {
  blocklistService: BlocklistService;
  config: ModerationConfig;
  logger: Logger;
}

/**
 * Middleware to verify admin token
 */
export function createModerationAuthMiddleware(config: ModerationConfig) {
  return async (
    c: Context,
    next: () => Promise<void>,
  ): Promise<Response | void> => {
    const authHeader = c.req.header("authorization");

    if (!authHeader) {
      return c.json({ error: "Authorization header required" }, 401);
    }

    const [type, token] = authHeader.split(" ");

    if (type !== "Bearer" || token !== config.adminToken) {
      return c.json({ error: "Invalid authorization token" }, 403);
    }

    await next();
  };
}

/**
 * GET /wayfinder/moderation/blocklist
 * List all blocked items
 */
export function createListBlocklistHandler(deps: ModerationHandlerDeps) {
  return async (c: Context) => {
    const entries = deps.blocklistService.getEntries();

    // Optional filtering
    const typeFilter = c.req.query("type") as BlockedContentType | undefined;

    const filteredEntries = typeFilter
      ? entries.filter((e) => e.type === typeFilter)
      : entries;

    return c.json({
      entries: filteredEntries,
      total: filteredEntries.length,
    });
  };
}

/**
 * POST /wayfinder/moderation/block
 * Block an ArNS name or transaction ID
 */
export function createBlockHandler(deps: ModerationHandlerDeps) {
  return async (c: Context) => {
    let body: BlockRequest;

    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    // Validate request
    if (!body.type || !["arns", "txid"].includes(body.type)) {
      return c.json({ error: "Invalid type. Must be 'arns' or 'txid'" }, 400);
    }

    if (!body.value || typeof body.value !== "string") {
      return c.json({ error: "Value is required" }, 400);
    }

    if (!body.reason || typeof body.reason !== "string") {
      return c.json({ error: "Reason is required" }, 400);
    }

    if (!body.blockedBy || typeof body.blockedBy !== "string") {
      return c.json({ error: "blockedBy is required" }, 400);
    }

    // Validate txId format if type is txid
    if (body.type === "txid" && !/^[A-Za-z0-9_-]{43}$/.test(body.value)) {
      return c.json(
        { error: "Invalid transaction ID format (must be 43 base64url chars)" },
        400,
      );
    }

    try {
      const result = await deps.blocklistService.block(
        body.type,
        body.value,
        body.reason,
        body.blockedBy,
      );

      deps.logger.info("Content blocked via API", {
        type: body.type,
        value: body.value,
        blockedBy: body.blockedBy,
      });

      return c.json({
        success: true,
        blocked: {
          type: body.type,
          value: body.value,
          resolvedTxId: result.resolvedTxId,
          purgedFromCache: result.purgedFromCache,
        },
      });
    } catch (error) {
      deps.logger.error("Failed to block content", {
        type: body.type,
        value: body.value,
        error: error instanceof Error ? error.message : String(error),
      });

      return c.json(
        {
          error: "Failed to block content",
          message: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  };
}

/**
 * DELETE /wayfinder/moderation/block/:type/:value
 * Unblock an ArNS name or transaction ID
 */
export function createUnblockHandler(deps: ModerationHandlerDeps) {
  return async (c: Context) => {
    const type = c.req.param("type") as BlockedContentType;
    const value = c.req.param("value");

    if (!type || !["arns", "txid"].includes(type)) {
      return c.json({ error: "Invalid type. Must be 'arns' or 'txid'" }, 400);
    }

    if (!value) {
      return c.json({ error: "Value is required" }, 400);
    }

    try {
      const success = await deps.blocklistService.unblock(type, value);

      if (!success) {
        return c.json({ error: "Content not found in blocklist" }, 404);
      }

      deps.logger.info("Content unblocked via API", {
        type,
        value,
      });

      return c.json({
        success: true,
        unblocked: {
          type,
          value,
        },
      });
    } catch (error) {
      deps.logger.error("Failed to unblock content", {
        type,
        value,
        error: error instanceof Error ? error.message : String(error),
      });

      return c.json(
        {
          error: "Failed to unblock content",
          message: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  };
}

/**
 * GET /wayfinder/moderation/stats
 * Get blocklist statistics
 */
export function createStatsHandler(deps: ModerationHandlerDeps) {
  return async (c: Context) => {
    const stats = deps.blocklistService.getStats();
    return c.json(stats);
  };
}

/**
 * POST /wayfinder/moderation/reload
 * Force reload blocklist from file
 */
export function createReloadHandler(deps: ModerationHandlerDeps) {
  return async (c: Context) => {
    try {
      await deps.blocklistService.reload();

      const stats = deps.blocklistService.getStats();

      deps.logger.info("Blocklist reloaded via API");

      return c.json({
        success: true,
        message: "Blocklist reloaded",
        stats,
      });
    } catch (error) {
      deps.logger.error("Failed to reload blocklist", {
        error: error instanceof Error ? error.message : String(error),
      });

      return c.json(
        {
          error: "Failed to reload blocklist",
          message: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  };
}

/**
 * GET /wayfinder/moderation/check/:type/:value
 * Check if a specific item is blocked
 */
export function createCheckHandler(deps: ModerationHandlerDeps) {
  return async (c: Context) => {
    const type = c.req.param("type") as BlockedContentType;
    const value = c.req.param("value");

    if (!type || !["arns", "txid"].includes(type)) {
      return c.json({ error: "Invalid type. Must be 'arns' or 'txid'" }, 400);
    }

    if (!value) {
      return c.json({ error: "Value is required" }, 400);
    }

    const isBlocked = deps.blocklistService.isBlocked(type, value);

    // Find entry for details if blocked
    let entry = null;
    if (isBlocked) {
      const entries = deps.blocklistService.getEntries();
      entry = entries.find(
        (e) =>
          e.type === type &&
          e.value === (type === "arns" ? value.toLowerCase() : value),
      );
    }

    return c.json({
      type,
      value,
      blocked: isBlocked,
      entry: entry || undefined,
    });
  };
}
