/**
 * Header utilities for Wayfinder Router
 */

import type { ProxyMetadata } from '../types/index.js';

// Headers to strip from gateway responses (security)
const STRIPPED_HEADERS = new Set([
  'x-ar-io-digest',
  'x-ar-io-verified',
  'x-ar-io-data-item-offset',
  'x-ar-io-data-item-data-offset',
  'x-ar-io-data-item-size',
  'x-ar-io-root-transaction-id',
  'set-cookie',
  'x-powered-by',
]);

// Headers to pass through from gateway response
const PASSTHROUGH_HEADERS = new Set([
  'content-type',
  'content-length',
  'content-disposition',
  'content-encoding',
  'cache-control',
  'etag',
  'last-modified',
  'accept-ranges',
  'x-arns-resolved-id',
  'x-arns-ttl-seconds',
  'x-arns-name',
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
  headers.set('x-ar-io-component', 'wayfinder-router');

  // Add trace ID if provided
  if (params.traceId) {
    headers.set('x-ar-io-trace-id', params.traceId);
  }

  // Forward relevant headers from original request
  if (params.originalHeaders) {
    const forwardHeaders = [
      'accept',
      'accept-encoding',
      'accept-language',
      'range',
      'if-none-match',
      'if-modified-since',
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
 */
export function filterGatewayResponseHeaders(
  gatewayHeaders: Headers,
): Headers {
  const headers = new Headers();

  gatewayHeaders.forEach((value, name) => {
    const lowerName = name.toLowerCase();

    // Skip stripped headers
    if (STRIPPED_HEADERS.has(lowerName)) {
      return;
    }

    // Include passthrough headers
    if (PASSTHROUGH_HEADERS.has(lowerName)) {
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
  headers.set('x-wayfinder-mode', metadata.mode);
  headers.set('x-wayfinder-verified', String(metadata.verified));
  headers.set('x-wayfinder-gateway', metadata.gateway);
  headers.set('x-wayfinder-txid', metadata.txId);

  if (metadata.verificationTimeMs !== undefined) {
    headers.set(
      'x-wayfinder-verification-time-ms',
      String(metadata.verificationTimeMs),
    );
  }

  if (metadata.cached) {
    headers.set('x-wayfinder-cached', 'true');
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
    txId: headers.get('x-arns-resolved-id'),
    ttlSeconds: headers.get('x-arns-ttl-seconds')
      ? parseInt(headers.get('x-arns-ttl-seconds')!, 10)
      : null,
    processId: headers.get('x-arns-resolved-process-id'),
  };
}

/**
 * Extract digest from gateway headers
 */
export function extractDigest(headers: Headers): string | null {
  return headers.get('x-ar-io-digest');
}
