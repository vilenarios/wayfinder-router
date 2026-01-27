/**
 * Arweave HTTP API Types
 * Types for proxying/routing Arweave node HTTP API requests
 */

/**
 * Arweave API endpoint types
 * Each endpoint maps to a specific Arweave node HTTP API route
 */
export type ArweaveApiEndpoint =
  | "info"
  | "peers"
  | "tx"
  | "tx-status"
  | "tx-field"
  | "tx-data"
  | "tx-offset"
  | "wallet-balance"
  | "wallet-last-tx"
  | "price"
  | "price-target"
  | "block-hash"
  | "block-height";

/**
 * Category for caching purposes
 * - immutable: Data that never changes (transactions, blocks) - long TTL
 * - dynamic: Data that changes frequently (info, balances, status) - short TTL
 */
export type ArweaveApiCategory = "immutable" | "dynamic";

/**
 * Request info for Arweave API requests
 */
export interface ArweaveApiRequestInfo {
  type: "arweave-api";
  /** The specific API endpoint being requested */
  endpoint: ArweaveApiEndpoint;
  /** Cache category for TTL decisions */
  category: ArweaveApiCategory;
  /** Extracted path parameters (id, address, bytes, target, height, field) */
  params: Record<string, string>;
  /** Original request path */
  path: string;
}

/**
 * Valid transaction fields that can be requested via /tx/{id}/{field}
 */
export const VALID_TX_FIELDS = new Set([
  "id",
  "last_tx",
  "owner",
  "tags",
  "target",
  "quantity",
  "data",
  "data_size",
  "data_root",
  "signature",
  "reward",
]);

/**
 * Mapping of endpoints to their cache category
 */
export const ENDPOINT_CATEGORIES: Record<
  ArweaveApiEndpoint,
  ArweaveApiCategory
> = {
  // Dynamic endpoints - data changes frequently
  info: "dynamic",
  peers: "dynamic",
  "tx-status": "dynamic",
  "wallet-balance": "dynamic",
  "wallet-last-tx": "dynamic",
  price: "dynamic",
  "price-target": "dynamic",

  // Immutable endpoints - data never changes once confirmed
  tx: "immutable",
  "tx-field": "immutable",
  "tx-data": "immutable",
  "tx-offset": "immutable",
  "block-hash": "immutable",
  "block-height": "immutable",
};

/**
 * Get the cache category for an endpoint
 */
export function getEndpointCategory(
  endpoint: ArweaveApiEndpoint,
): ArweaveApiCategory {
  return ENDPOINT_CATEGORIES[endpoint];
}

/**
 * Construct the path to fetch from an Arweave node
 */
export function constructArweaveApiPath(
  endpoint: ArweaveApiEndpoint,
  params: Record<string, string>,
): string {
  switch (endpoint) {
    case "info":
      return "/info";
    case "peers":
      return "/peers";
    case "tx":
      return `/tx/${params.id}`;
    case "tx-status":
      return `/tx/${params.id}/status`;
    case "tx-field":
      return `/tx/${params.id}/${params.field}`;
    case "tx-data":
      return params.extension
        ? `/tx/${params.id}/data.${params.extension}`
        : `/tx/${params.id}/data`;
    case "tx-offset":
      return `/tx/${params.id}/offset`;
    case "wallet-balance":
      return `/wallet/${params.address}/balance`;
    case "wallet-last-tx":
      return `/wallet/${params.address}/last_tx`;
    case "price":
      return `/price/${params.bytes}`;
    case "price-target":
      return `/price/${params.bytes}/${params.target}`;
    case "block-hash":
      return `/block/hash/${params.hash}`;
    case "block-height":
      return `/block/height/${params.height}`;
    default:
      throw new Error(`Unknown Arweave API endpoint: ${endpoint}`);
  }
}
