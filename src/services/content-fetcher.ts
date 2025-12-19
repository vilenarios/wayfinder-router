/**
 * Content Fetcher Service
 * Resilient fetch with retry logic and gateway failover
 */

import type { Logger, RouterConfig } from "../types/index.js";
import type { GatewaySelector } from "./gateway-selector.js";
import type { GatewayTemperatureCache } from "../cache/gateway-temperature.js";
import { constructGatewayUrl, constructArnsGatewayUrl } from "../utils/url.js";
import {
  createGatewayRequestHeaders,
  filterGatewayResponseHeaders,
} from "../utils/headers.js";
import { GatewayError } from "../middleware/error-handler.js";

export interface ContentFetcherOptions {
  gatewaySelector: GatewaySelector;
  retryAttempts: number;
  retryDelayMs: number;
  logger: Logger;
  /** Optional temperature cache for performance tracking */
  temperatureCache?: GatewayTemperatureCache;
}

export interface FetchResult {
  response: Response;
  gateway: URL;
  headers: Headers;
}

export interface FetchParams {
  txId: string;
  path: string;
  originalHeaders?: Headers;
  traceId?: string;
}

export interface FetchArnsParams {
  arnsName: string;
  resolvedTxId: string;
  path: string;
  originalHeaders?: Headers;
  traceId?: string;
}

export class ContentFetcher {
  private gatewaySelector: GatewaySelector;
  private retryAttempts: number;
  private retryDelayMs: number;
  private logger: Logger;
  private temperatureCache?: GatewayTemperatureCache;

  constructor(options: ContentFetcherOptions) {
    this.gatewaySelector = options.gatewaySelector;
    this.retryAttempts = options.retryAttempts;
    this.retryDelayMs = options.retryDelayMs;
    this.logger = options.logger;
    this.temperatureCache = options.temperatureCache;
  }

  /**
   * Fetch content for a transaction ID
   */
  async fetchByTxId(params: FetchParams): Promise<FetchResult> {
    const { txId, path, originalHeaders, traceId } = params;

    let lastError: Error | undefined;
    let lastGateway: URL | undefined;

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      const startTime = Date.now();

      try {
        // Select a gateway
        const gateway = await this.gatewaySelector.selectForTransaction(
          txId,
          path,
        );
        lastGateway = gateway;

        // Construct the gateway URL
        const gatewayUrl = constructGatewayUrl({
          gateway,
          txId,
          path,
          useSubdomain: true,
        });

        this.logger.debug("Fetching from gateway", {
          gateway: gateway.toString(),
          gatewayUrl: gatewayUrl.toString(),
          txId,
          attempt: attempt + 1,
        });

        // Create request headers
        const requestHeaders = createGatewayRequestHeaders({
          originalHeaders,
          traceId,
        });

        // Fetch from gateway with timeout
        const response = await fetch(gatewayUrl.toString(), {
          method: "GET",
          headers: requestHeaders,
          redirect: "follow",
          signal: AbortSignal.timeout(30000), // 30 second timeout
        });

        if (!response.ok) {
          throw new GatewayError(
            gateway.toString(),
            `Gateway returned ${response.status}: ${response.statusText}`,
            response.status,
          );
        }

        // Calculate latency and record success
        const latencyMs = Date.now() - startTime;

        // Mark gateway as healthy
        this.gatewaySelector.markHealthy(gateway);

        // Record temperature (latency) for performance tracking
        this.temperatureCache?.recordSuccess(gateway.toString(), latencyMs);

        // Filter response headers
        const filteredHeaders = filterGatewayResponseHeaders(response.headers);

        this.logger.debug("Content fetched successfully", {
          gateway: gateway.toString(),
          txId,
          latencyMs,
          contentType: response.headers.get("content-type"),
          contentLength: response.headers.get("content-length"),
        });

        return {
          response,
          gateway,
          headers: filteredHeaders,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Record failure for the gateway
        if (lastGateway) {
          this.gatewaySelector.recordFailure(lastGateway);
          this.temperatureCache?.recordFailure(lastGateway.toString());
        }

        this.logger.warn("Fetch attempt failed", {
          txId,
          gateway: lastGateway?.toString(),
          attempt: attempt + 1,
          maxAttempts: this.retryAttempts,
          error: lastError.message,
        });

        // Wait before retry
        if (attempt < this.retryAttempts - 1) {
          await this.delay(this.retryDelayMs * (attempt + 1));
        }
      }
    }

    // All attempts failed
    throw (
      lastError ||
      new GatewayError(
        lastGateway?.toString() || "unknown",
        "All fetch attempts failed",
      )
    );
  }

  /**
   * Fetch content for an ArNS name (using resolved txId)
   */
  async fetchByArns(params: FetchArnsParams): Promise<FetchResult> {
    const { arnsName, resolvedTxId, path, originalHeaders, traceId } = params;

    let lastError: Error | undefined;
    let lastGateway: URL | undefined;

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      const startTime = Date.now();

      try {
        // Select a gateway
        const gateway = await this.gatewaySelector.selectForArns(
          arnsName,
          path,
        );
        lastGateway = gateway;

        // For ArNS, we use the arnsName as subdomain
        const gatewayUrl = constructArnsGatewayUrl({
          gateway,
          arnsName,
          path,
        });

        this.logger.debug("Fetching ArNS content from gateway", {
          gateway: gateway.toString(),
          gatewayUrl: gatewayUrl.toString(),
          arnsName,
          resolvedTxId,
          attempt: attempt + 1,
        });

        // Create request headers
        const requestHeaders = createGatewayRequestHeaders({
          originalHeaders,
          traceId,
        });

        // Fetch from gateway with timeout
        const response = await fetch(gatewayUrl.toString(), {
          method: "GET",
          headers: requestHeaders,
          redirect: "follow",
          signal: AbortSignal.timeout(30000), // 30 second timeout
        });

        if (!response.ok) {
          throw new GatewayError(
            gateway.toString(),
            `Gateway returned ${response.status}: ${response.statusText}`,
            response.status,
          );
        }

        // Calculate latency and record success
        const latencyMs = Date.now() - startTime;

        // Mark gateway as healthy
        this.gatewaySelector.markHealthy(gateway);

        // Record temperature (latency) for performance tracking
        this.temperatureCache?.recordSuccess(gateway.toString(), latencyMs);

        // Filter response headers
        const filteredHeaders = filterGatewayResponseHeaders(response.headers);

        this.logger.debug("ArNS content fetched successfully", {
          gateway: gateway.toString(),
          arnsName,
          resolvedTxId,
          latencyMs,
          contentType: response.headers.get("content-type"),
        });

        return {
          response,
          gateway,
          headers: filteredHeaders,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Record failure for the gateway
        if (lastGateway) {
          this.gatewaySelector.recordFailure(lastGateway);
          this.temperatureCache?.recordFailure(lastGateway.toString());
        }

        this.logger.warn("ArNS fetch attempt failed", {
          arnsName,
          gateway: lastGateway?.toString(),
          attempt: attempt + 1,
          maxAttempts: this.retryAttempts,
          error: lastError.message,
        });

        // Wait before retry
        if (attempt < this.retryAttempts - 1) {
          await this.delay(this.retryDelayMs * (attempt + 1));
        }
      }
    }

    // All attempts failed
    throw (
      lastError ||
      new GatewayError(
        lastGateway?.toString() || "unknown",
        "All ArNS fetch attempts failed",
      )
    );
  }

  /**
   * Helper to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create content fetcher from configuration
 */
export function createContentFetcher(
  gatewaySelector: GatewaySelector,
  config: RouterConfig,
  logger: Logger,
  temperatureCache?: GatewayTemperatureCache,
): ContentFetcher {
  return new ContentFetcher({
    gatewaySelector,
    retryAttempts: config.routing.retryAttempts,
    retryDelayMs: config.routing.retryDelayMs,
    logger,
    temperatureCache,
  });
}
