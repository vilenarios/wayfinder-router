/**
 * ArNS Consensus Resolver
 * Resolves ArNS names to transaction IDs with multi-gateway consensus
 */

import type { Logger, ArnsResolution, RouterConfig } from '../types/index.js';
import { ArnsCache } from '../cache/arns-cache.js';
import {
  ArnsResolutionError,
  ArnsConsensusMismatchError,
} from '../middleware/error-handler.js';
import { extractArnsInfo } from '../utils/headers.js';

export interface ArnsResolverOptions {
  trustedGateways: URL[];
  consensusThreshold: number;
  cacheTtlMs: number;
  logger: Logger;
}

interface GatewayResolution {
  gateway: string;
  txId: string | null;
  ttlSeconds: number | null;
  processId: string | null;
  error?: string;
}

export class ArnsResolver {
  private trustedGateways: URL[];
  private consensusThreshold: number;
  private cache: ArnsCache;
  private logger: Logger;

  constructor(options: ArnsResolverOptions) {
    this.trustedGateways = options.trustedGateways;
    this.consensusThreshold = Math.min(
      options.consensusThreshold,
      options.trustedGateways.length,
    );
    this.logger = options.logger;

    this.cache = new ArnsCache({
      defaultTtlMs: options.cacheTtlMs,
      logger: options.logger,
    });
  }

  /**
   * Resolve ArNS name to transaction ID with consensus verification
   */
  async resolve(arnsName: string): Promise<ArnsResolution> {
    const normalized = arnsName.toLowerCase();

    // Check cache first
    const cached = this.cache.get(normalized);
    if (cached) {
      this.logger.debug('ArNS resolved from cache', {
        arnsName: normalized,
        txId: cached.txId,
      });
      return cached;
    }

    // Query trusted gateways in parallel
    const resolutions = await this.queryGateways(normalized);

    // Check for consensus
    const resolution = this.checkConsensus(normalized, resolutions);

    // Cache the resolution
    this.cache.set(normalized, resolution);

    return resolution;
  }

  /**
   * Query all trusted gateways for ArNS resolution
   */
  private async queryGateways(arnsName: string): Promise<GatewayResolution[]> {
    this.logger.debug('Querying gateways for ArNS resolution', {
      arnsName,
      gateways: this.trustedGateways.map((g) => g.toString()),
    });

    const promises = this.trustedGateways.map(async (gateway) => {
      try {
        return await this.queryGateway(gateway, arnsName);
      } catch (error) {
        this.logger.warn('Gateway ArNS query failed', {
          gateway: gateway.toString(),
          arnsName,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          gateway: gateway.toString(),
          txId: null,
          ttlSeconds: null,
          processId: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    return Promise.all(promises);
  }

  /**
   * Query a single gateway for ArNS resolution
   */
  private async queryGateway(
    gateway: URL,
    arnsName: string,
  ): Promise<GatewayResolution> {
    // Construct ArNS subdomain URL
    const url = new URL(gateway);
    url.hostname = `${arnsName}.${url.hostname}`;

    this.logger.debug('Querying gateway for ArNS', {
      url: url.toString(),
      arnsName,
    });

    const response = await fetch(url.toString(), {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`Gateway returned ${response.status}`);
    }

    const { txId, ttlSeconds, processId } = extractArnsInfo(response.headers);

    if (!txId) {
      throw new Error('Gateway did not return x-arns-resolved-id header');
    }

    return {
      gateway: gateway.toString(),
      txId,
      ttlSeconds,
      processId,
    };
  }

  /**
   * Check consensus among gateway resolutions
   */
  private checkConsensus(
    arnsName: string,
    resolutions: GatewayResolution[],
  ): ArnsResolution {
    // Filter successful resolutions
    const successful = resolutions.filter(
      (r) => r.txId !== null && !r.error,
    ) as Array<GatewayResolution & { txId: string }>;

    this.logger.debug('ArNS resolution results', {
      arnsName,
      total: resolutions.length,
      successful: successful.length,
      threshold: this.consensusThreshold,
    });

    // Check if we have enough successful resolutions
    if (successful.length < this.consensusThreshold) {
      throw new ArnsResolutionError(
        arnsName,
        `Failed to resolve ArNS name: only ${successful.length} of ${this.consensusThreshold} required gateways responded`,
      );
    }

    // Check if all successful resolutions agree
    const txIds = new Set(successful.map((r) => r.txId));

    if (txIds.size > 1) {
      // Consensus mismatch - security concern
      this.logger.error('ArNS consensus mismatch detected', {
        arnsName,
        resolutions: successful.map((r) => ({
          gateway: r.gateway,
          txId: r.txId,
        })),
      });

      throw new ArnsConsensusMismatchError(
        arnsName,
        successful.map((r) => r.txId),
      );
    }

    // All gateways agree
    const txId = successful[0].txId;
    const minTtl = Math.min(
      ...successful
        .filter((r) => r.ttlSeconds !== null)
        .map((r) => r.ttlSeconds as number),
    );

    const resolution: ArnsResolution = {
      txId,
      ttlMs: (minTtl || 300) * 1000, // Default 5 minutes
      resolvedAt: Date.now(),
      processId: successful.find((r) => r.processId)?.processId ?? undefined,
    };

    this.logger.info('ArNS resolved with consensus', {
      arnsName,
      txId,
      consensusCount: successful.length,
      ttlMs: resolution.ttlMs,
    });

    return resolution;
  }

  /**
   * Invalidate cached resolution
   */
  invalidate(arnsName: string): void {
    this.cache.invalidate(arnsName);
  }

  /**
   * Clear all cached resolutions
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; maxSize: number } {
    return this.cache.stats();
  }
}

/**
 * Create ArNS resolver from router configuration
 */
export function createArnsResolver(
  config: RouterConfig,
  logger: Logger,
): ArnsResolver {
  return new ArnsResolver({
    trustedGateways: config.verification.trustedGateways,
    consensusThreshold: config.verification.consensusThreshold,
    cacheTtlMs: config.cache.arnsTtlMs,
    logger,
  });
}
