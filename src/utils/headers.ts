/**
 * Header utilities for Wayfinder Router
 */

import type { ProxyMetadata } from "../types/index.js";

// Headers to strip from gateway responses (security)
const STRIPPED_HEADERS = new Set([
  "set-cookie",
  "x-powered-by",
]);

// Standard HTTP headers to pass through from gateway response
const PASSTHROUGH_HEADERS = new Set([
  "content-type",
  "content-length",
  "content-disposition",
  "content-encoding",
  "cache-control",
  "etag",
  "last-modified",
  "accept-ranges",
]);

/**
 * Create headers for outgoing gateway requests
 */
export function createGatewayRequestHeaders(params: {
  originalHeaders?: Headers;
  traceId?: string;
}): Headers {
  const headers = new Headers();

  // Add wayfinder identification
  headers.set("x-ar-io-component", "wayfinder-router");

  // Add trace ID if provided
  if (params.traceId) {
    headers.set("x-ar-io-trace-id", params.traceId);
  }

  // Forward relevant headers from original request
  if (params.originalHeaders) {
    const forwardHeaders = [
      "accept",
      "accept-encoding",
      "accept-language",
      "range",
      "if-none-match",
      "if-modified-since",
    ];

    for (const name of forwardHeaders) {
      const value = params.originalHeaders.get(name);
      if (value) {
        headers.set(name, value);
      }
    }
  }

  return headers;
}

/**
 * Filter and transform headers from gateway response
 * Passes through:
 * - Standard HTTP headers (content-type, cache-control, etc.)
 * - All ar.io gateway headers (x-ar-io-*, x-arns-*) except those explicitly stripped
 */
export function filterGatewayResponseHeaders(gatewayHeaders: Headers): Headers {
  const headers = new Headers();

  gatewayHeaders.forEach((value, name) => {
    const lowerName = name.toLowerCase();

    // Skip explicitly stripped headers (security/internal)
    if (STRIPPED_HEADERS.has(lowerName)) {
      return;
    }

    // Include standard passthrough headers
    if (PASSTHROUGH_HEADERS.has(lowerName)) {
      headers.set(name, value);
      return;
    }

    // Include all ar.io gateway headers (x-ar-io-* and x-arns-*)
    if (lowerName.startsWith("x-ar-io-") || lowerName.startsWith("x-arns-")) {
      headers.set(name, value);
    }
  });

  return headers;
}

/**
 * Add Wayfinder metadata headers to response
 */
export function addWayfinderHeaders(
  headers: Headers,
  metadata: ProxyMetadata,
): void {
  headers.set("x-wayfinder-mode", metadata.mode);
  headers.set("x-wayfinder-verified", String(metadata.verified));
  headers.set("x-wayfinder-routed-via", metadata.routedVia);
  headers.set("x-wayfinder-txid", metadata.txId);

  if (metadata.verifiedBy && metadata.verifiedBy.length > 0) {
    headers.set("x-wayfinder-verified-by", metadata.verifiedBy.join(", "));
  }

  if (metadata.verificationTimeMs !== undefined) {
    headers.set(
      "x-wayfinder-verification-time-ms",
      String(metadata.verificationTimeMs),
    );
  }

  if (metadata.cached) {
    headers.set("x-wayfinder-cached", "true");
  }
}

/**
 * Extract ArNS resolution info from gateway headers
 */
export function extractArnsInfo(headers: Headers): {
  txId: string | null;
  ttlSeconds: number | null;
  processId: string | null;
} {
  return {
    txId: headers.get("x-arns-resolved-id"),
    ttlSeconds: headers.get("x-arns-ttl-seconds")
      ? parseInt(headers.get("x-arns-ttl-seconds")!, 10)
      : null,
    processId: headers.get("x-arns-resolved-process-id"),
  };
}

/**
 * Extract digest from gateway headers
 */
export function extractDigest(headers: Headers): string | null {
  return headers.get("x-ar-io-digest");
}

/**
 * Extract the actual data txId from gateway headers
 * This is the txId of the content being returned (may differ from requested txId for manifests)
 */
export function extractDataId(headers: Headers): string | null {
  return headers.get("x-ar-io-data-id");
}

/**
 * Extract manifest-related information from gateway headers
 */
export interface ManifestHeaderInfo {
  /** The txId that was resolved (ArNS or manifest txId) - only present for ArNS requests */
  resolvedId: string | null;
  /** The actual data txId being served (content txId) */
  dataId: string | null;
}

export function extractManifestInfo(headers: Headers): ManifestHeaderInfo {
  const resolvedId = headers.get("x-arns-resolved-id");
  const dataId = headers.get("x-ar-io-data-id");

  return {
    resolvedId,
    dataId,
  };
}

/**
 * Determine if a response is from a manifest
 * Works for both ArNS and txId requests:
 * - For ArNS: manifest if resolvedId !== dataId
 * - For txId: manifest if dataId exists and differs from requested txId
 */
export function isManifestResponse(
  manifestInfo: ManifestHeaderInfo,
  requestedTxId: string,
): boolean {
  const { resolvedId, dataId } = manifestInfo;

  // If we have both resolvedId and dataId (ArNS request), compare them
  if (resolvedId && dataId) {
    return resolvedId !== dataId;
  }

  // For txId requests, check if dataId differs from the requested txId
  if (dataId && dataId !== requestedTxId) {
    return true;
  }

  return false;
}

/**
 * Get all verification-related headers as a record
 * Used when passing headers to verification functions
 */
export function extractVerificationHeaders(
  headers: Headers,
): Record<string, string> {
  const result: Record<string, string> = {};

  const verificationHeaders = [
    "x-ar-io-digest",
    "x-ar-io-data-id",
    "x-arns-resolved-id",
    "x-ar-io-verified",
    "content-length",
    "content-type",
  ];

  for (const name of verificationHeaders) {
    const value = headers.get(name);
    if (value) {
      result[name] = value;
    }
  }

  return result;
}
