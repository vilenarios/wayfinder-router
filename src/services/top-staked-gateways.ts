/**
 * Top Staked Gateways Provider
 * Fetches gateways from the ar.io network registry, sorted by total stake (operator + delegated)
 *
 * This provider fetches the full gateway list and calculates true total stake,
 * matching the behavior of the wayfinder-app.
 */

import { ARIO } from '@ar.io/sdk';
import type { GatewaysProvider } from '@ar.io/wayfinder-core';
import type { Logger } from '../types/index.js';

export interface GatewayWithStake {
  url: URL;
  operatorStake: number;
  delegatedStake: number;
  totalStake: number;
}

export interface TopStakedGatewaysProviderOptions {
  /** Number of top gateways to use (default: 10) */
  poolSize?: number;
  /** Cache TTL in milliseconds (default: 24 hours) */
  cacheTtlMs?: number;
  /** Logger instance */
  logger: Logger;
  /** Fallback gateways if network fetch fails */
  fallbackGateways?: URL[];
}

interface GatewayCache {
  gateways: GatewayWithStake[];
  fetchedAt: number;
}

export class TopStakedGatewaysProvider implements GatewaysProvider {
  private poolSize: number;
  private cacheTtlMs: number;
  private logger: Logger;
  private fallbackGateways: URL[];
  private cache: GatewayCache | null = null;
  private fetchPromise: Promise<GatewayWithStake[]> | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(options: TopStakedGatewaysProviderOptions) {
    this.poolSize = options.poolSize ?? 10;
    this.cacheTtlMs = options.cacheTtlMs ?? 24 * 60 * 60 * 1000; // 24 hours
    this.logger = options.logger;
    this.fallbackGateways = options.fallbackGateways ?? [
      new URL('https://arweave.net'),
      new URL('https://ar-io.dev'),
    ];
  }

  /**
   * Initialize the provider by fetching gateways immediately
   * Call this on startup to ensure gateways are ready
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing top staked gateways provider');

    try {
      await this.fetchTopStakedGateways();
      this.scheduleRefresh();
      this.logger.info('Top staked gateways provider initialized', {
        gatewayCount: this.cache?.gateways.length ?? 0,
        topGateway: this.cache?.gateways[0]?.url.toString(),
        refreshIntervalMs: this.cacheTtlMs,
      });
    } catch (error) {
      this.logger.error('Failed to initialize gateways, using fallbacks', {
        error: error instanceof Error ? error.message : String(error),
        fallbackCount: this.fallbackGateways.length,
      });
      // Continue with fallbacks - don't throw
    }
  }

  /**
   * Get gateways for routing (implements GatewaysProvider interface)
   */
  async getGateways(): Promise<URL[]> {
    const gateways = await this.getTopStakedGateways();
    return gateways.map((g) => g.url);
  }

  /**
   * Get top staked gateways with stake info
   */
  async getTopStakedGateways(): Promise<GatewayWithStake[]> {
    // Check cache
    if (this.cache && !this.isCacheExpired()) {
      return this.cache.gateways;
    }

    // Fetch fresh (deduplicated)
    try {
      return await this.fetchTopStakedGateways();
    } catch (error) {
      // If we have stale cache, use it
      if (this.cache) {
        this.logger.warn('Using stale gateway cache due to fetch error', {
          cacheAge: Date.now() - this.cache.fetchedAt,
          error: error instanceof Error ? error.message : String(error),
        });
        return this.cache.gateways;
      }

      // Return fallbacks as GatewayWithStake
      this.logger.warn('Using fallback gateways', {
        count: this.fallbackGateways.length,
      });
      return this.fallbackGateways.map((url) => ({
        url,
        operatorStake: 0,
        delegatedStake: 0,
        totalStake: 0,
      }));
    }
  }

  /**
   * Get gateways as URLs for verification strategy
   */
  async getGatewayUrls(): Promise<URL[]> {
    const gateways = await this.getTopStakedGateways();
    return gateways.map((g) => g.url);
  }

  /**
   * Fetch top staked gateways from the ar.io network
   */
  private async fetchTopStakedGateways(): Promise<GatewayWithStake[]> {
    // Deduplicate concurrent fetches
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    this.fetchPromise = this.doFetch();

    try {
      const result = await this.fetchPromise;
      return result;
    } finally {
      this.fetchPromise = null;
    }
  }

  private async doFetch(): Promise<GatewayWithStake[]> {
    this.logger.debug('Fetching gateways from ar.io network');

    const ario = ARIO.mainnet();

    // Fetch ALL gateways since the SDK can't sort by total stake (operator + delegated)
    const result = await ario.getGateways({
      limit: 1000,
    });

    if (!result.items || result.items.length === 0) {
      throw new Error('No gateways returned from ar.io network');
    }

    this.logger.debug('Fetched gateways from network', {
      totalCount: result.items.length,
    });

    // Filter active gateways and calculate total stake
    const gatewaysWithStake: GatewayWithStake[] = [];

    for (const gateway of result.items) {
      // Only include joined gateways with a valid FQDN
      if (gateway.status !== 'joined' || !gateway.settings?.fqdn) {
        continue;
      }

      const operatorStake = gateway.operatorStake || 0;
      const delegatedStake = gateway.totalDelegatedStake || 0;

      try {
        gatewaysWithStake.push({
          url: new URL(`https://${gateway.settings.fqdn}`),
          operatorStake,
          delegatedStake,
          totalStake: operatorStake + delegatedStake,
        });
      } catch {
        // Skip gateways with invalid URLs
        this.logger.debug('Skipping gateway with invalid FQDN', {
          fqdn: gateway.settings.fqdn,
        });
      }
    }

    if (gatewaysWithStake.length === 0) {
      throw new Error('No active staked gateways found');
    }

    // Sort by TOTAL stake descending
    gatewaysWithStake.sort((a, b) => b.totalStake - a.totalStake);

    // Take top N by total stake
    const topGateways = gatewaysWithStake.slice(0, this.poolSize);

    // Cache the result
    this.cache = {
      gateways: topGateways,
      fetchedAt: Date.now(),
    };

    this.logger.info('Updated top staked gateways cache', {
      poolSize: topGateways.length,
      totalActive: gatewaysWithStake.length,
      topGateway: topGateways[0]?.url.toString(),
      topStake: topGateways[0]?.totalStake,
    });

    return topGateways;
  }

  private isCacheExpired(): boolean {
    if (!this.cache) return true;
    return Date.now() - this.cache.fetchedAt > this.cacheTtlMs;
  }

  /**
   * Schedule periodic refresh of gateway list
   */
  private scheduleRefresh(): void {
    // Clear any existing timer
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    // Schedule refresh slightly before cache expires
    const refreshInterval = Math.max(this.cacheTtlMs - 60_000, 60_000); // At least 1 minute

    this.refreshTimer = setInterval(async () => {
      try {
        this.logger.debug('Refreshing top staked gateways');
        await this.fetchTopStakedGateways();
      } catch (error) {
        this.logger.warn('Failed to refresh gateways, will retry', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, refreshInterval);

    // Don't prevent process exit
    this.refreshTimer.unref();
  }

  /**
   * Stop the refresh timer (for cleanup)
   */
  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    cached: boolean;
    gatewayCount: number;
    cacheAge: number | null;
    nextRefresh: number | null;
  } {
    return {
      cached: this.cache !== null,
      gatewayCount: this.cache?.gateways.length ?? 0,
      cacheAge: this.cache ? Date.now() - this.cache.fetchedAt : null,
      nextRefresh: this.cache
        ? Math.max(0, this.cacheTtlMs - (Date.now() - this.cache.fetchedAt))
        : null,
    };
  }
}
