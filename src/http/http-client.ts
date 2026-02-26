/**
 * HTTP Client
 * Uses native fetch for HTTP requests (Bun runtime)
 */

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

/**
 * HTTP client using native fetch.
 * Provides a consistent interface for HTTP requests with timeout support.
 */
export class HttpClient {
  private connectTimeoutMs: number;
  private logger?: Logger;
  private isClosed: boolean = false;
  private activeRequests: number = 0;

  constructor(options: HttpClientOptions) {
    this.connectTimeoutMs = options.connectTimeoutMs;
    this.logger = options.logger;
  }

  /**
   * Fetch with timeout and redirect handling.
   * Returns a standard Response.
   */
  async fetch(
    url: string | URL,
    options: FetchOptions = {},
  ): Promise<Response> {
    if (this.isClosed) {
      throw new Error("HttpClient is closed");
    }

    this.activeRequests++;
    try {
      return await this.fetchWithTimeout(url, options);
    } finally {
      this.activeRequests--;
    }
  }

  /**
   * Internal fetch with timeout support.
   */
  private async fetchWithTimeout(
    url: string | URL,
    options: FetchOptions,
  ): Promise<Response> {
    const urlStr = typeof url === "string" ? url : url.toString();

    // Build combined abort signal: caller's signal + timeout
    const timeoutSignal = AbortSignal.timeout(this.connectTimeoutMs);
    const signals: AbortSignal[] = [timeoutSignal];
    if (options.signal) {
      signals.push(options.signal);
    }
    const combinedSignal = AbortSignal.any(signals);

    // Convert Headers to plain object if needed
    const headersInit: Record<string, string> | Headers | undefined =
      options.headers;

    try {
      const response = await globalThis.fetch(urlStr, {
        method: options.method || "GET",
        headers: headersInit,
        signal: combinedSignal,
        redirect: options.redirect ?? "follow",
      });

      return response;
    } catch (error) {
      this.logger?.warn("Fetch failed", {
        url: urlStr,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Close the HTTP client.
   * Should be called during shutdown.
   */
  async close(): Promise<void> {
    this.logger?.info("Closing HTTP client", {
      activeRequests: this.activeRequests,
    });
    this.isClosed = true;
  }

  /**
   * Get statistics about the HTTP client.
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
    return {
      poolCount: 0,
      pools: [],
    };
  }

  /**
   * Get Prometheus metrics for the HTTP client.
   */
  getPrometheusMetrics(): string {
    let metrics = "";

    metrics +=
      "# HELP wayfinder_connection_pools_total Total number of connection pools\n";
    metrics += "# TYPE wayfinder_connection_pools_total gauge\n";
    metrics += `wayfinder_connection_pools_total 0\n\n`;

    metrics +=
      "# HELP wayfinder_http_active_requests Number of active HTTP requests\n";
    metrics += "# TYPE wayfinder_http_active_requests gauge\n";
    metrics += `wayfinder_http_active_requests ${this.activeRequests}\n`;

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
