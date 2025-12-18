/**
 * Request parsing middleware for Wayfinder Router
 * Extracts ArNS names, transaction IDs, and sandbox subdomains from incoming requests
 */

import type { Context, Next } from "hono";
import type { RequestInfo, RouterConfig } from "../types/index.js";
import { isTxId, normalizePath, isValidSandbox } from "../utils/url.js";

// Reserved paths that should not be treated as transaction IDs
const RESERVED_PATHS = new Set(["health", "ready", "metrics", "favicon.ico"]);

/**
 * Parse the incoming request to extract routing information
 */
export function parseRequest(
  url: URL,
  hostname: string,
  baseDomain: string,
): RequestInfo {
  // Normalize the base domain (remove port if present in comparison)
  const baseHost = baseDomain.split(":")[0].toLowerCase();
  const requestHost = hostname.split(":")[0].toLowerCase();

  // Check for subdomain: {subdomain}.wayfinder-router.com
  if (requestHost !== baseHost && requestHost.endsWith(`.${baseHost}`)) {
    const subdomain = requestHost.slice(0, -(baseHost.length + 1));

    // Validate it's not empty and doesn't contain additional subdomains
    if (subdomain && !subdomain.includes(".")) {
      // Check if this is a sandbox subdomain (52 char base32)
      if (isValidSandbox(subdomain)) {
        // Sandbox request - extract txId from path
        const pathSegments = url.pathname.split("/").filter(Boolean);
        const firstSegment = pathSegments[0];

        // Check reserved paths first
        if (firstSegment && RESERVED_PATHS.has(firstSegment.toLowerCase())) {
          return {
            type: "reserved",
            path: url.pathname,
          };
        }

        // Sandbox requests should have txId in path
        if (firstSegment && isTxId(firstSegment)) {
          const remainingPath = "/" + pathSegments.slice(1).join("/");
          return {
            type: "txid",
            txId: firstSegment,
            path: normalizePath(remainingPath + url.search),
            sandboxSubdomain: subdomain,
          };
        }

        // Sandbox without valid txId in path - treat as reserved
        return {
          type: "reserved",
          path: url.pathname,
        };
      }

      // Not a sandbox - treat as ArNS name
      return {
        type: "arns",
        arnsName: subdomain.toLowerCase(),
        path: normalizePath(url.pathname + url.search),
      };
    }
  }

  // No subdomain - check for transaction ID path: /{txId}/...
  const pathSegments = url.pathname.split("/").filter(Boolean);
  const firstSegment = pathSegments[0];

  // Check reserved paths first
  if (firstSegment && RESERVED_PATHS.has(firstSegment.toLowerCase())) {
    return {
      type: "reserved",
      path: url.pathname,
    };
  }

  // Check if first segment is a valid transaction ID (exactly 43 base64url chars)
  if (firstSegment && isTxId(firstSegment)) {
    const remainingPath = "/" + pathSegments.slice(1).join("/");
    return {
      type: "txid",
      txId: firstSegment,
      path: normalizePath(remainingPath + url.search),
      // No sandbox subdomain - will need redirect
    };
  }

  // No ArNS or txId found - reserved/unknown path
  return {
    type: "reserved",
    path: url.pathname,
  };
}

/**
 * Create request parser middleware
 */
export function createRequestParserMiddleware(config: RouterConfig) {
  return async (c: Context, next: Next) => {
    const url = new URL(c.req.url);
    const hostname = c.req.header("host") || url.hostname;

    const requestInfo = parseRequest(url, hostname, config.server.baseDomain);

    // Store parsed info in context for handlers
    c.set("requestInfo", requestInfo);

    await next();
  };
}
