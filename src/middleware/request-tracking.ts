/**
 * Request Tracking Middleware
 * Tracks in-flight requests for graceful shutdown
 */

import type { Context, Next } from "hono";
import { RequestTracker } from "../utils/request-tracker.js";

/**
 * Create middleware that tracks in-flight requests.
 * When draining, returns 503 Service Unavailable for new requests.
 */
export function requestTrackingMiddleware(requestTracker: RequestTracker) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    // Try to accept the request
    if (!requestTracker.increment()) {
      // We're draining - reject new requests
      return c.json(
        {
          error: "Service Unavailable",
          message: "Server is shutting down",
        },
        503,
        {
          "Retry-After": "30",
          Connection: "close",
        },
      );
    }

    try {
      // Process the request
      await next();
    } finally {
      // Always decrement, even on errors
      requestTracker.decrement();
    }
  };
}
