/**
 * HTTP Client with Connection Pooling
 * Uses undici for efficient connection reuse to gateways
 */

import { Pool, type Dispatcher } from "undici";
import type { Logger } from "../types/index.js";

export interface HttpClientOptions {
  /** Maximum connections per host (default: 10) */
  connectionsPerHost: number;
  /** Connection timeout in ms (default: 30000) */
  connectTimeoutMs: number;
  /** Keep-alive timeout in ms (default: 60000) */
  keepAliveTimeoutMs: number;
  /** Maximum redirects to follow (default: 5) */
  maxRedirects?: number;
  /** Logger instance */
  logger?: Logger;
}

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string> | Headers;
  signal?: AbortSignal;
  redirect?: "follow" | "manual" | "error";
}

/** Status codes that indicate a redirect */
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

/**
 * HTTP client with connection pooling.
 * Maintains a pool of persistent connections per host for efficient reuse.
 */
export class HttpClient {
  private pools: Map<string, Pool> = new Map();
  private connectionsPerHost: number;
  private connectTimeoutMs: number;
  private keepAliveTimeoutMs: number;
  private maxRedirects: number;
  private logger?: Logger;

  constructor(options: HttpClientOptions) {
    this.connectionsPerHost = options.connectionsPerHost;
    this.connectTimeoutMs = options.connectTimeoutMs;
    this.keepAliveTimeoutMs = options.keepAliveTimeoutMs;
    this.maxRedirects = options.maxRedirects ?? 5;
    this.logger = options.logger;
  }

  /**
   * Get or create a pool for a given origin (protocol + host).
   */
  private getPool(origin: string): Pool {
    let pool = this.pools.get(origin);

    if (!pool) {
      this.logger?.debug("Creating connection pool", {
        origin,
        connections: this.connectionsPerHost,
      });

      pool = new Pool(origin, {
        connections: this.connectionsPerHost,
        keepAliveTimeout: this.keepAliveTimeoutMs,
        connect: {
          timeout: this.connectTimeoutMs,
        },
      });

      this.pools.set(origin, pool);
    }

    return pool;
  }

  /**
   * Fetch with connection pooling and redirect handling.
   * Returns a Response compatible with the standard fetch API.
   */
  async fetch(
    url: string | URL,
    options: FetchOptions = {},
  ): Promise<Response> {
    return this.fetchWithRedirects(url, options, 0);
  }

  /**
   * Internal fetch implementation with redirect tracking.
   */
  private async fetchWithRedirects(
    url: string | URL,
    options: FetchOptions,
    redirectCount: number,
  ): Promise<Response> {
    const urlObj = typeof url === "string" ? new URL(url) : url;
    const origin = `${urlObj.protocol}//${urlObj.host}`;
    const pool = this.getPool(origin);

    // Convert Headers to plain object if needed
    let headersObj: Record<string, string> = {};
    if (options.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => {
          headersObj[key] = value;
        });
      } else {
        headersObj = options.headers;
      }
    }

    // Build request options
    const requestOptions: Dispatcher.RequestOptions = {
      path: urlObj.pathname + urlObj.search,
      method: (options.method || "GET") as Dispatcher.HttpMethod,
      headers: headersObj,
      signal: options.signal,
    };

    try {
      const response = await pool.request(requestOptions);

      // Convert undici headers to standard Headers object
      const responseHeaders = new Headers();
      const rawHeaders = response.headers;

      // Handle both object and array header formats
      if (Array.isArray(rawHeaders)) {
        for (let i = 0; i < rawHeaders.length; i += 2) {
          const key = rawHeaders[i];
          const value = rawHeaders[i + 1];
          if (typeof key === "string" && typeof value === "string") {
            responseHeaders.append(key, value);
          }
        }
      } else if (rawHeaders !== null && rawHeaders !== undefined) {
        for (const [key, value] of Object.entries(rawHeaders)) {
          if (Array.isArray(value)) {
            value.forEach((v) => responseHeaders.append(key, v));
          } else if (typeof value === "string") {
            responseHeaders.append(key, value);
          }
        }
      }

      // Handle redirects
      const redirectMode = options.redirect ?? "follow";
      if (REDIRECT_STATUS_CODES.has(response.statusCode)) {
        const location = responseHeaders.get("location");

        if (redirectMode === "error") {
          // Consume the body to release the connection
          for await (const chunk of response.body) {
            void chunk;
          }
          throw new Error(
            `Redirect not allowed: ${response.statusCode} to ${location}`,
          );
        }

        if (redirectMode === "follow" && location) {
          // Check redirect limit
          if (redirectCount >= this.maxRedirects) {
            // Consume the body to release the connection
            for await (const chunk of response.body) {
              void chunk;
            }
            throw new Error(
              `Maximum redirects (${this.maxRedirects}) exceeded`,
            );
          }

          // Consume the body to release the connection before following redirect
          for await (const chunk of response.body) {
            void chunk;
          }

          // Resolve redirect URL (may be relative)
          const redirectUrl = new URL(location, urlObj);

          this.logger?.debug("Following redirect", {
            from: urlObj.toString(),
            to: redirectUrl.toString(),
            status: response.statusCode,
            redirectCount: redirectCount + 1,
          });

          // For 303, change method to GET
          // For 301/302, browsers change POST to GET (we follow this behavior)
          const newOptions = { ...options };
          if (
            response.statusCode === 303 ||
            ((response.statusCode === 301 || response.statusCode === 302) &&
              options.method?.toUpperCase() === "POST")
          ) {
            newOptions.method = "GET";
          }

          return this.fetchWithRedirects(
            redirectUrl,
            newOptions,
            redirectCount + 1,
          );
        }

        // redirect: "manual" - return the response as-is
      }

      // Create a Response object from undici response
      // Cast through unknown since undici's BodyReadable is compatible but different type
      return new Response(
        response.body as unknown as ReadableStream<Uint8Array>,
        {
          status: response.statusCode,
          headers: responseHeaders,
        },
      );
    } catch (error) {
      this.logger?.warn("Connection pool fetch failed", {
        origin,
        path: urlObj.pathname,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Close all connection pools.
   * Should be called during shutdown.
   */
  async close(): Promise<void> {
    this.logger?.info("Closing connection pools", {
      poolCount: this.pools.size,
    });

    const closePromises: Promise<void>[] = [];
    for (const [origin, pool] of this.pools) {
      this.logger?.debug("Closing pool", { origin });
      closePromises.push(pool.close());
    }

    await Promise.all(closePromises);
    this.pools.clear();
  }

  /**
   * Get statistics about the connection pools.
   */
  getStats(): {
    poolCount: number;
    pools: Array<{
      origin: string;
      connected: number;
      free: number;
      pending: number;
      running: number;
    }>;
  } {
    const pools: Array<{
      origin: string;
      connected: number;
      free: number;
      pending: number;
      running: number;
    }> = [];

    for (const [origin, pool] of this.pools) {
      const stats = pool.stats;
      pools.push({
        origin,
        connected: stats.connected,
        free: stats.free,
        pending: stats.pending,
        running: stats.running,
      });
    }

    return {
      poolCount: this.pools.size,
      pools,
    };
  }

  /**
   * Get Prometheus metrics for connection pools.
   */
  getPrometheusMetrics(): string {
    const stats = this.getStats();
    let metrics = "";

    // Pool count
    metrics +=
      "# HELP wayfinder_connection_pools_total Total number of connection pools\n";
    metrics += "# TYPE wayfinder_connection_pools_total gauge\n";
    metrics += `wayfinder_connection_pools_total ${stats.poolCount}\n\n`;

    // Per-pool metrics
    metrics +=
      "# HELP wayfinder_pool_connections_connected Number of connected sockets per pool\n";
    metrics += "# TYPE wayfinder_pool_connections_connected gauge\n";
    for (const pool of stats.pools) {
      const origin = pool.origin.replace(/"/g, '\\"');
      metrics += `wayfinder_pool_connections_connected{origin="${origin}"} ${pool.connected}\n`;
    }
    metrics += "\n";

    metrics +=
      "# HELP wayfinder_pool_connections_free Number of free sockets per pool\n";
    metrics += "# TYPE wayfinder_pool_connections_free gauge\n";
    for (const pool of stats.pools) {
      const origin = pool.origin.replace(/"/g, '\\"');
      metrics += `wayfinder_pool_connections_free{origin="${origin}"} ${pool.free}\n`;
    }
    metrics += "\n";

    metrics +=
      "# HELP wayfinder_pool_connections_pending Number of pending requests per pool\n";
    metrics += "# TYPE wayfinder_pool_connections_pending gauge\n";
    for (const pool of stats.pools) {
      const origin = pool.origin.replace(/"/g, '\\"');
      metrics += `wayfinder_pool_connections_pending{origin="${origin}"} ${pool.pending}\n`;
    }
    metrics += "\n";

    metrics +=
      "# HELP wayfinder_pool_connections_running Number of running requests per pool\n";
    metrics += "# TYPE wayfinder_pool_connections_running gauge\n";
    for (const pool of stats.pools) {
      const origin = pool.origin.replace(/"/g, '\\"');
      metrics += `wayfinder_pool_connections_running{origin="${origin}"} ${pool.running}\n`;
    }

    return metrics;
  }
}

// Singleton instance
let globalHttpClient: HttpClient | null = null;

/**
 * Get or create the global HTTP client.
 */
export function getHttpClient(options?: HttpClientOptions): HttpClient {
  if (!globalHttpClient && options) {
    globalHttpClient = new HttpClient(options);
  }
  if (!globalHttpClient) {
    throw new Error(
      "HttpClient not initialized. Call getHttpClient with options first.",
    );
  }
  return globalHttpClient;
}

/**
 * Create a new HTTP client with the given options.
 */
export function createHttpClient(options: HttpClientOptions): HttpClient {
  return new HttpClient(options);
}

/**
 * Close the global HTTP client.
 */
export async function closeHttpClient(): Promise<void> {
  if (globalHttpClient) {
    await globalHttpClient.close();
    globalHttpClient = null;
  }
}
