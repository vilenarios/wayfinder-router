/**
 * Arweave API Fetcher
 * Fetches Arweave node API data with caching and retry logic
 */

import type { Logger, RouterConfig } from "../types/index.js";
import type {
  ArweaveApiEndpoint,
  ArweaveApiCategory,
} from "../types/arweave-api.js";
import { constructArweaveApiPath } from "../types/arweave-api.js";
import { ArweaveApiCache } from "../cache/arweave-api-cache.js";
import { ArweaveNodeSelector } from "./arweave-node-selector.js";
import {
  createArweaveApiRequestHeaders,
  filterArweaveApiResponseHeaders,
} from "../utils/headers.js";

/**
 * Simple fetch function type compatible with both native fetch and HttpClient
 */
export type SimpleFetchFn = (
  url: string,
  options?: {
    method?: string;
    headers?: Headers | Record<string, string>;
    signal?: AbortSignal;
  },
) => Promise<Response>;

export interface ArweaveApiFetcherOptions {
  nodeSelector: ArweaveNodeSelector;
  cache: ArweaveApiCache | null;
  retryAttempts: number;
  retryDelayMs: number;
  timeoutMs: number;
  logger: Logger;
  /** Optional custom fetch function (for connection pooling) */
  fetchFn?: SimpleFetchFn;
}

export interface ArweaveApiFetchResult {
  /** Response data as Uint8Array */
  data: Uint8Array;
  /** Content-Type header */
  contentType: string;
  /** Filtered response headers */
  headers: Headers;
  /** The node that served the request */
  node: URL;
  /** Whether the result came from cache */
  cached: boolean;
  /** Endpoint category (immutable/dynamic) */
  category: ArweaveApiCategory;
}

export class ArweaveApiFetcher {
  private nodeSelector: ArweaveNodeSelector;
  private cache: ArweaveApiCache | null;
  private retryAttempts: number;
  private retryDelayMs: number;
  private timeoutMs: number;
  private logger: Logger;
  private fetchFn: SimpleFetchFn;

  constructor(options: ArweaveApiFetcherOptions) {
    this.nodeSelector = options.nodeSelector;
    this.cache = options.cache;
    this.retryAttempts = options.retryAttempts;
    this.retryDelayMs = options.retryDelayMs;
    this.timeoutMs = options.timeoutMs;
    this.logger = options.logger;
    this.fetchFn = options.fetchFn || ((url, opts) => fetch(url, opts));
  }

  /**
   * Fetch Arweave API data with caching and retry
   */
  async fetch(
    endpoint: ArweaveApiEndpoint,
    params: Record<string, string>,
    category: ArweaveApiCategory,
    traceId?: string,
    originalHeaders?: Headers,
  ): Promise<ArweaveApiFetchResult> {
    // Check cache first
    if (this.cache) {
      const cached = this.cache.get(endpoint, params);
      if (cached) {
        this.logger.debug("Arweave API cache hit", { endpoint, params });

        // Reconstruct headers from cached data
        const headers = new Headers();
        headers.set("content-type", cached.contentType);
        headers.set("content-length", String(cached.data.length));
        for (const [key, value] of Object.entries(cached.headers)) {
          headers.set(key, value);
        }

        return {
          data: cached.data,
          contentType: cached.contentType,
          headers,
          node: new URL("cache://local"), // Indicate it came from cache
          cached: true,
          category: cached.category,
        };
      }
    }

    // Build the API path
    const apiPath = constructArweaveApiPath(endpoint, params);

    // Create request headers
    const requestHeaders = createArweaveApiRequestHeaders({
      originalHeaders,
      traceId,
    });

    // Try fetching with retries
    const excludeNodes: URL[] = [];
    let lastError: Error | undefined;
    let lastNode: URL | undefined;

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      const startTime = Date.now();

      try {
        // Select a node
        const node = this.nodeSelector.select(excludeNodes);
        lastNode = node;

        // Build full URL
        const url = new URL(apiPath, node);

        this.logger.debug("Fetching from Arweave node", {
          endpoint,
          node: node.hostname,
          url: url.toString(),
          attempt: attempt + 1,
        });

        // Fetch with timeout
        const response = await this.fetchFn(url.toString(), {
          method: "GET",
          headers: requestHeaders,
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!response.ok) {
          throw new Error(
            `Arweave node returned ${response.status}: ${response.statusText}`,
          );
        }

        // Read response data
        const arrayBuffer = await response.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);

        // Record success
        const latencyMs = Date.now() - startTime;
        this.nodeSelector.markHealthy(node);

        this.logger.debug("Arweave API fetch success", {
          endpoint,
          node: node.hostname,
          latencyMs,
          size: data.length,
        });

        // Get content type
        const contentType =
          response.headers.get("content-type") || "application/octet-stream";

        // Filter response headers
        const filteredHeaders = filterArweaveApiResponseHeaders(
          response.headers,
        );

        // Cache the result
        if (this.cache) {
          const headersObj: Record<string, string> = {};
          filteredHeaders.forEach((value, key) => {
            headersObj[key] = value;
          });

          this.cache.set(endpoint, params, data, contentType, headersObj);
        }

        return {
          data,
          contentType,
          headers: filteredHeaders,
          node,
          cached: false,
          category,
        };
      } catch (error) {
        lastError = error as Error;
        const errorMsg = error instanceof Error ? error.message : String(error);

        this.logger.warn("Arweave API fetch failed", {
          endpoint,
          node: lastNode?.hostname,
          attempt: attempt + 1,
          error: errorMsg,
        });

        // Record failure and exclude this node from next attempt
        if (lastNode) {
          this.nodeSelector.recordFailure(lastNode);
          excludeNodes.push(lastNode);
        }

        // Wait before retry (exponential backoff)
        if (attempt < this.retryAttempts - 1) {
          await this.delay(this.retryDelayMs * (attempt + 1));
        }
      }
    }

    // All attempts failed
    throw new Error(
      `Arweave API fetch failed after ${this.retryAttempts} attempts: ${lastError?.message || "unknown error"}`,
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create ArweaveApiFetcher from config
 */
export function createArweaveApiFetcher(
  nodeSelector: ArweaveNodeSelector,
  cache: ArweaveApiCache | null,
  config: RouterConfig,
  logger: Logger,
  fetchFn?: SimpleFetchFn,
): ArweaveApiFetcher {
  return new ArweaveApiFetcher({
    nodeSelector,
    cache,
    retryAttempts: config.arweaveApi.retryAttempts,
    retryDelayMs: config.arweaveApi.retryDelayMs,
    timeoutMs: config.arweaveApi.timeoutMs,
    logger,
    fetchFn,
  });
}
