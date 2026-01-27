/**
 * Request parsing middleware for Wayfinder Router
 * Extracts ArNS names, transaction IDs, and sandbox subdomains from incoming requests
 */

import type { Context, Next } from "hono";
import type { RequestInfo, RouterConfig } from "../types/index.js";
import { isTxId, normalizePath, isValidSandbox } from "../utils/url.js";

// Reserved paths that should not be treated as transaction IDs or ArNS paths
// These are always handled by the router itself
const RESERVED_PATHS = new Set(["favicon.ico", "graphql"]);

// Reserved path prefixes - paths starting with these are always reserved
// All router endpoints are under /wayfinder/ (health, ready, metrics, stats, info)
const RESERVED_PREFIXES = ["wayfinder/"];

/**
 * Check if a path is reserved (should be handled by the router, not proxied)
 */
function isReservedPath(pathname: string): boolean {
  const pathWithoutLeadingSlash = pathname.startsWith("/")
    ? pathname.slice(1)
    : pathname;
  const firstSegment = pathWithoutLeadingSlash.split("/")[0]?.toLowerCase();

  // Check exact reserved paths
  if (firstSegment && RESERVED_PATHS.has(firstSegment)) {
    return true;
  }

  // Check reserved prefixes
  const lowerPath = pathWithoutLeadingSlash.toLowerCase();
  for (const prefix of RESERVED_PREFIXES) {
    if (lowerPath.startsWith(prefix) || lowerPath === prefix.slice(0, -1)) {
      return true;
    }
  }

  return false;
}

/**
 * Parse the incoming request to extract routing information
 * @param url - The request URL
 * @param hostname - The request hostname
 * @param baseDomain - The base domain for the router
 * @param rootHostContent - Optional content (ArNS name or txId) to serve at root domain
 * @param restrictToRootHost - When true, blocks subdomain and txId path requests
 */
export function parseRequest(
  url: URL,
  hostname: string,
  baseDomain: string,
  rootHostContent?: string,
  restrictToRootHost: boolean = false,
): RequestInfo {
  // Normalize the base domain (remove port if present in comparison)
  const baseHost = baseDomain.split(":")[0].toLowerCase();
  const requestHost = hostname.split(":")[0].toLowerCase();

  // Check for subdomain: {subdomain}.wayfinder-router.com
  if (requestHost !== baseHost && requestHost.endsWith(`.${baseHost}`)) {
    const subdomain = requestHost.slice(0, -(baseHost.length + 1));

    // Validate it's not empty and doesn't contain additional subdomains
    if (subdomain && !subdomain.includes(".")) {
      // If restriction mode is enabled, block all subdomain requests
      if (restrictToRootHost) {
        return {
          type: "blocked",
          reason: "subdomain_restricted",
          path: url.pathname,
        };
      }
      // Check if this is a sandbox subdomain (52 char base32)
      if (isValidSandbox(subdomain)) {
        // Sandbox request - extract txId from path
        const pathSegments = url.pathname.split("/").filter(Boolean);
        const firstSegment = pathSegments[0];

        // Check reserved paths first
        if (isReservedPath(url.pathname)) {
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

  // Check reserved paths first (health, ready, metrics, wayfinder/*, stats/*)
  if (isReservedPath(url.pathname)) {
    return {
      type: "reserved",
      path: url.pathname,
    };
  }

  // Check if first segment is a valid transaction ID (exactly 43 base64url chars)
  if (firstSegment && isTxId(firstSegment)) {
    // If restriction mode is enabled, block txId path requests
    if (restrictToRootHost) {
      return {
        type: "blocked",
        reason: "txid_path_restricted",
        path: url.pathname,
      };
    }

    const remainingPath = "/" + pathSegments.slice(1).join("/");
    return {
      type: "txid",
      txId: firstSegment,
      path: normalizePath(remainingPath + url.search),
      // No sandbox subdomain - will need redirect
    };
  }

  // No txId found - check if we should route to rootHostContent
  if (rootHostContent) {
    // Auto-detect: is it a txId or ArNS name?
    if (isTxId(rootHostContent)) {
      // It's a transaction ID - route as txid request
      return {
        type: "txid",
        txId: rootHostContent,
        path: normalizePath(url.pathname + url.search),
      };
    } else {
      // It's an ArNS name - route as arns request
      return {
        type: "arns",
        arnsName: rootHostContent.toLowerCase(),
        path: normalizePath(url.pathname + url.search),
      };
    }
  }

  // No root host content configured - treat as reserved (will show info page)
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

    const requestInfo = parseRequest(
      url,
      hostname,
      config.server.baseDomain,
      config.server.rootHostContent || undefined,
      config.server.restrictToRootHost,
    );

    // Store parsed info in context for handlers
    c.set("requestInfo", requestInfo);

    await next();
  };
}
