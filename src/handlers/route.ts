/**
 * Route Handler
 * Redirects requests to gateway URLs without proxying
 */

import type { Context } from "hono";
import type {
  Logger,
  RouterConfig,
  RequestInfo,
  TxIdRequestInfo,
} from "../types/index.js";
import type { ArnsResolver } from "../services/arns-resolver.js";
import type { GatewaySelector } from "../services/gateway-selector.js";
import type { TelemetryService } from "../telemetry/service.js";
import {
  constructGatewayUrl,
  constructArnsGatewayUrl,
  sandboxFromTxId,
  validateSandboxForTxId,
} from "../utils/url.js";

export interface RouteHandlerDeps {
  arnsResolver: ArnsResolver;
  gatewaySelector: GatewaySelector;
  config: RouterConfig;
  logger: Logger;
  telemetryService?: TelemetryService | null;
}

/**
 * Create route handler
 */
export function createRouteHandler(deps: RouteHandlerDeps) {
  const { arnsResolver, gatewaySelector, logger, telemetryService } = deps;

  return async (c: Context): Promise<Response> => {
    const requestInfo = c.get("requestInfo") as RequestInfo;
    const traceId = crypto.randomUUID();

    logger.debug("Route handler invoked", {
      requestInfo,
      traceId,
    });

    // Handle based on request type
    if (requestInfo.type === "arns") {
      return handleArnsRoute(c, requestInfo, traceId);
    } else if (requestInfo.type === "txid") {
      return handleTxIdRoute(c, requestInfo, traceId);
    } else {
      // Reserved path - should not reach route handler
      return c.json({ error: "Not Found" }, 404);
    }
  };

  /**
   * Handle ArNS subdomain redirect
   */
  async function handleArnsRoute(
    c: Context,
    requestInfo: { type: "arns"; arnsName: string; path: string },
    traceId: string,
  ): Promise<Response> {
    const { arnsName, path } = requestInfo;
    const startTime = Date.now();

    logger.info("Processing ArNS route request", {
      arnsName,
      path,
      traceId,
    });

    // Resolve ArNS to txId (still need consensus for security)
    const resolution = await arnsResolver.resolve(arnsName);

    logger.debug("ArNS resolved for routing", {
      arnsName,
      txId: resolution.txId,
      traceId,
    });

    // Select a gateway
    const gateway = await gatewaySelector.selectForArns(arnsName, path);

    // Construct redirect URL using ArNS subdomain
    const redirectUrl = constructArnsGatewayUrl({
      gateway,
      arnsName,
      path,
    });

    logger.info("ArNS route redirect", {
      arnsName,
      txId: resolution.txId,
      gateway: gateway.toString(),
      redirectUrl: redirectUrl.toString(),
      durationMs: Date.now() - startTime,
      traceId,
    });

    // Record telemetry for route (redirect)
    if (telemetryService) {
      telemetryService.recordRequest({
        traceId,
        timestamp: startTime,
        gateway: gateway.toString(),
        requestType: "arns",
        identifier: arnsName,
        path,
        mode: "route",
        outcome: "success",
        httpStatus: 302,
        latency: {
          totalMs: Date.now() - startTime,
        },
      });
    }

    // Return 302 redirect
    return c.redirect(redirectUrl.toString(), 302);
  }

  /**
   * Handle transaction ID path redirect
   */
  async function handleTxIdRoute(
    c: Context,
    requestInfo: TxIdRequestInfo,
    traceId: string,
  ): Promise<Response> {
    const { txId, path, sandboxSubdomain } = requestInfo;
    const startTime = Date.now();

    logger.info("Processing txId route request", {
      txId,
      path,
      sandboxSubdomain,
      traceId,
    });

    // Check if we need to redirect to sandbox subdomain first
    if (!sandboxSubdomain) {
      // No sandbox subdomain - redirect to router with sandbox
      const sandbox = sandboxFromTxId(txId);
      const { config } = deps;
      const protocol = c.req.url.startsWith("https") ? "https" : "http";
      const redirectUrl = `${protocol}://${sandbox}.${config.server.baseDomain}/${txId}${path}`;

      logger.info("Redirecting to sandbox subdomain", {
        txId,
        sandbox,
        redirectUrl,
        traceId,
      });

      return c.redirect(redirectUrl, 302);
    }

    // Validate sandbox matches txId (security check)
    if (!validateSandboxForTxId(sandboxSubdomain, txId)) {
      logger.warn("Sandbox subdomain mismatch", {
        txId,
        sandboxSubdomain,
        expectedSandbox: sandboxFromTxId(txId),
        traceId,
      });
      return c.json(
        {
          error: "Bad Request",
          message: "Sandbox subdomain does not match transaction ID",
        },
        400,
      );
    }

    // Select a gateway
    const gateway = await gatewaySelector.selectForTransaction(txId, path);

    // Construct redirect URL using sandbox subdomain
    const redirectUrl = constructGatewayUrl({
      gateway,
      txId,
      path,
      useSubdomain: true,
    });

    logger.info("TxId route redirect", {
      txId,
      gateway: gateway.toString(),
      redirectUrl: redirectUrl.toString(),
      sandbox: sandboxFromTxId(txId),
      durationMs: Date.now() - startTime,
      traceId,
    });

    // Record telemetry for route (redirect)
    if (telemetryService) {
      telemetryService.recordRequest({
        traceId,
        timestamp: startTime,
        gateway: gateway.toString(),
        requestType: "txid",
        identifier: txId,
        path,
        mode: "route",
        outcome: "success",
        httpStatus: 302,
        latency: {
          totalMs: Date.now() - startTime,
        },
      });
    }

    // Return 302 redirect
    return c.redirect(redirectUrl.toString(), 302);
  }
}
