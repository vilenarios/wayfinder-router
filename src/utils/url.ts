/**
 * URL utilities for Wayfinder Router
 */

import { createHash } from "node:crypto";

// Transaction ID regex - exactly 43 base64url characters
const TX_ID_REGEX = /^[A-Za-z0-9_-]{43}$/;

// ArNS name regex - 1-51 characters, lowercase alphanumeric with hyphens/underscores
// Note: ArNS names are case-insensitive, we normalize to lowercase
const ARNS_NAME_REGEX = /^[a-z0-9_-]{1,51}$/i;

/**
 * Check if a string is a valid Arweave transaction ID
 */
export function isTxId(value: string): boolean {
  return TX_ID_REGEX.test(value);
}

/**
 * Check if a string is a valid ArNS name
 */
export function isArnsName(value: string): boolean {
  // ArNS names are 1-51 chars but exclude 43-char strings (those are txIds)
  if (value.length === 43 && TX_ID_REGEX.test(value)) {
    return false;
  }
  return ARNS_NAME_REGEX.test(value);
}

/**
 * Generate sandbox subdomain from transaction ID
 * This creates a unique subdomain for each transaction
 */
export function sandboxFromTxId(txId: string): string {
  // Use base32 encoding of first 32 bytes of SHA-256 hash
  // This matches the ar.io gateway sandbox format
  const hash = createHash("sha256").update(txId).digest();
  return base32Encode(hash.subarray(0, 20)).toLowerCase();
}

/**
 * Base32 encode (RFC 4648, no padding)
 */
function base32Encode(data: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let result = "";
  let bits = 0;
  let value = 0;

  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(value >> bits) & 0x1f];
    }
  }

  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 0x1f];
  }

  return result;
}

/**
 * Construct gateway URL for a transaction
 */
export function constructGatewayUrl(params: {
  gateway: URL;
  txId: string;
  path: string;
  useSubdomain?: boolean;
}): URL {
  const { gateway, txId, path, useSubdomain = true } = params;

  // For localhost, always use path-based routing
  if (gateway.hostname === "localhost" || gateway.hostname === "127.0.0.1") {
    const url = new URL(gateway);
    url.pathname = `/${txId}${path}`;
    return url;
  }

  if (useSubdomain) {
    // Use sandbox subdomain for transaction isolation
    const sandbox = sandboxFromTxId(txId);
    const url = new URL(gateway);
    url.hostname = `${sandbox}.${url.hostname}`;
    url.pathname = path || "/";
    return url;
  }

  // Path-based routing
  const url = new URL(gateway);
  url.pathname = `/${txId}${path}`;
  return url;
}

/**
 * Construct gateway URL for ArNS name
 */
export function constructArnsGatewayUrl(params: {
  gateway: URL;
  arnsName: string;
  path: string;
}): URL {
  const { gateway, arnsName, path } = params;

  // For localhost, use path-based routing
  if (gateway.hostname === "localhost" || gateway.hostname === "127.0.0.1") {
    const url = new URL(gateway);
    url.pathname = `/${arnsName}${path}`;
    return url;
  }

  // Use ArNS name as subdomain
  const url = new URL(gateway);
  url.hostname = `${arnsName.toLowerCase()}.${url.hostname}`;
  url.pathname = path || "/";
  return url;
}

/**
 * Normalize a path (ensure leading slash, handle empty)
 */
export function normalizePath(path: string): string {
  if (!path || path === "/") return "/";
  return path.startsWith("/") ? path : `/${path}`;
}
