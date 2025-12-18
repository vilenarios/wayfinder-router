/**
 * Error handling middleware for Wayfinder Router
 */

import type { Context } from "hono";
import type { Logger } from "../types/index.js";

/**
 * Custom error classes
 */
export class WayfinderError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = "WayfinderError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ArnsResolutionError extends WayfinderError {
  public readonly arnsName: string;

  constructor(arnsName: string, message: string) {
    super(message, 404, "ARNS_RESOLUTION_FAILED");
    this.name = "ArnsResolutionError";
    this.arnsName = arnsName;
  }
}

export class ArnsConsensusMismatchError extends WayfinderError {
  public readonly arnsName: string;
  public readonly resolvedTxIds: string[];

  constructor(arnsName: string, resolvedTxIds: string[]) {
    super(
      `ArNS resolution mismatch for "${arnsName}": gateways returned different transaction IDs`,
      502,
      "ARNS_CONSENSUS_MISMATCH",
    );
    this.name = "ArnsConsensusMismatchError";
    this.arnsName = arnsName;
    this.resolvedTxIds = resolvedTxIds;
  }
}

export class VerificationError extends WayfinderError {
  public readonly txId: string;
  public readonly expectedHash?: string;
  public readonly computedHash?: string;

  constructor(
    txId: string,
    message: string,
    expectedHash?: string,
    computedHash?: string,
  ) {
    super(message, 502, "VERIFICATION_FAILED");
    this.name = "VerificationError";
    this.txId = txId;
    this.expectedHash = expectedHash;
    this.computedHash = computedHash;
  }
}

export class GatewayError extends WayfinderError {
  public readonly gateway: string;

  constructor(gateway: string, message: string, statusCode: number = 502) {
    super(message, statusCode, "GATEWAY_ERROR");
    this.name = "GatewayError";
    this.gateway = gateway;
  }
}

export class NoHealthyGatewaysError extends WayfinderError {
  constructor() {
    super("No healthy gateways available", 503, "NO_HEALTHY_GATEWAYS");
    this.name = "NoHealthyGatewaysError";
  }
}

/**
 * Create error response
 */
export function createErrorResponse(
  c: Context,
  error: Error,
  logger: Logger,
): Response {
  // Log the error
  if (error instanceof WayfinderError) {
    logger.warn("Request failed", {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
    });
  } else {
    logger.error("Unexpected error", {
      message: error.message,
      stack: error.stack,
    });
  }

  // Determine status code and response body
  let statusCode = 500;
  let body: Record<string, unknown> = {
    error: "Internal Server Error",
    message: "An unexpected error occurred",
  };

  if (error instanceof WayfinderError) {
    statusCode = error.statusCode;
    body = {
      error: error.code,
      message: error.message,
    };

    // Add additional context for specific errors
    if (error instanceof ArnsConsensusMismatchError) {
      body.arnsName = error.arnsName;
      body.hint =
        "Multiple trusted gateways returned different transaction IDs. This may indicate a security issue.";
    } else if (error instanceof VerificationError) {
      body.txId = error.txId;
      body.hint =
        "Data verification failed. The content may have been tampered with.";
    } else if (error instanceof NoHealthyGatewaysError) {
      body.hint =
        "All configured gateways are currently unavailable. Please try again later.";
    }
  }

  return c.json(body, statusCode as 500);
}

/**
 * Create error handler middleware
 */
export function createErrorHandlerMiddleware(logger: Logger) {
  return async (err: Error, c: Context): Promise<Response> => {
    return createErrorResponse(c, err, logger);
  };
}
