/**
 * Wayfinder SDK client wrapper
 * Provides a configured instance of the Wayfinder Core SDK
 */

import {
  HashVerificationStrategy,
  TrustedPeersGatewaysProvider,
  SimpleCacheGatewaysProvider,
  FastestPingRoutingStrategy,
  RandomRoutingStrategy,
  RoundRobinRoutingStrategy,
  type GatewaysProvider,
  type RoutingStrategy as SdkRoutingStrategy,
  type VerificationStrategy as SdkVerificationStrategy,
} from '@ar.io/wayfinder-core';

import type { RouterConfig, Logger, RoutingStrategy } from '../types/index.js';
import { TopStakedGatewaysProvider } from './top-staked-gateways.js';

export interface WayfinderServices {
  gatewaysProvider: GatewaysProvider;
  routingStrategy: SdkRoutingStrategy;
  verificationStrategy: SdkVerificationStrategy | null;
  /** Top staked gateways provider (only set when using network source) */
  topStakedProvider: TopStakedGatewaysProvider | null;
}

/**
 * Create a logger adapter for the Wayfinder SDK
 */
function createSdkLogger(logger: Logger) {
  return {
    debug: (msg: string, ...args: unknown[]) => logger.debug(msg, ...args),
    info: (msg: string, ...args: unknown[]) => logger.info(msg, ...args),
    warn: (msg: string, ...args: unknown[]) => logger.warn(msg, ...args),
    error: (msg: string, ...args: unknown[]) => logger.error(msg, ...args),
  };
}

/**
 * Create gateways provider based on configuration
 */
function createGatewaysProvider(
  config: RouterConfig,
  logger: Logger,
): { provider: GatewaysProvider; topStakedProvider: TopStakedGatewaysProvider | null } {
  const sdkLogger = createSdkLogger(logger);

  switch (config.routing.gatewaySource) {
    case 'network': {
      // Use top staked gateways from ar.io network registry
      const topStakedProvider = new TopStakedGatewaysProvider({
        poolSize: config.networkGateways.poolSize,
        cacheTtlMs: config.networkGateways.refreshIntervalMs,
        logger,
        fallbackGateways: config.verification.trustedGateways.length > 0
          ? config.verification.trustedGateways
          : [new URL('https://arweave.net'), new URL('https://ar-io.dev')],
      });

      return { provider: topStakedProvider, topStakedProvider };
    }

    case 'trusted-peers': {
      const baseProvider = new TrustedPeersGatewaysProvider({
        trustedGateway: config.routing.trustedPeerGateway,
        logger: sdkLogger,
      });

      // Wrap with caching (convert ms to seconds)
      const provider = new SimpleCacheGatewaysProvider({
        gatewaysProvider: baseProvider,
        ttlSeconds: Math.floor(config.resilience.gatewayHealthTtlMs / 1000),
        logger: sdkLogger,
      });

      return { provider, topStakedProvider: null };
    }

    case 'static': {
      const provider: GatewaysProvider = {
        getGateways: async () => config.routing.staticGateways,
      };

      return { provider, topStakedProvider: null };
    }

    default:
      throw new Error(`Unknown gateway source: ${config.routing.gatewaySource}`);
  }
}

/**
 * Create routing strategy based on configuration
 */
function createRoutingStrategy(
  strategy: RoutingStrategy,
  gatewaysProvider: GatewaysProvider,
  logger: Logger,
): SdkRoutingStrategy {
  const sdkLogger = createSdkLogger(logger);

  switch (strategy) {
    case 'fastest':
      return new FastestPingRoutingStrategy({
        gatewaysProvider,
        logger: sdkLogger,
        timeoutMs: 1000,
        maxConcurrency: 10,
      });

    case 'random':
      return new RandomRoutingStrategy({
        gatewaysProvider,
        logger: sdkLogger,
      });

    case 'round-robin':
      return new RoundRobinRoutingStrategy({
        gatewaysProvider,
      });

    default:
      throw new Error(`Unknown routing strategy: ${strategy}`);
  }
}

/**
 * Create verification strategy based on configuration
 *
 * When using network gateway source, the trusted gateways for verification
 * will be provided dynamically from the TopStakedGatewaysProvider.
 * Otherwise, uses the static TRUSTED_GATEWAYS config.
 */
function createVerificationStrategy(
  config: RouterConfig,
  topStakedProvider: TopStakedGatewaysProvider | null,
  logger: Logger,
): SdkVerificationStrategy | null {
  if (!config.verification.enabled) {
    return null;
  }

  const sdkLogger = createSdkLogger(logger);

  // When using network source, use the same top-staked gateways for verification
  if (config.routing.gatewaySource === 'network' && topStakedProvider) {
    // Create a dynamic verification strategy that uses top staked gateways
    return new DynamicHashVerificationStrategy({
      gatewaysProvider: topStakedProvider,
      maxConcurrency: 2,
      logger: sdkLogger,
    });
  }

  // Use static trusted gateways from config
  return new HashVerificationStrategy({
    trustedGateways: config.verification.trustedGateways,
    maxConcurrency: 2,
    logger: sdkLogger,
  });
}

/**
 * Dynamic hash verification strategy that fetches trusted gateways from a provider
 * This allows using the same top-staked gateways for both routing and verification
 */
class DynamicHashVerificationStrategy implements SdkVerificationStrategy {
  private gatewaysProvider: GatewaysProvider;
  private maxConcurrency: number;
  private logger: ReturnType<typeof createSdkLogger>;
  private _cachedGateways: URL[] = [];

  // Required by VerificationStrategy interface - returns cached gateways
  get trustedGateways(): URL[] {
    return this._cachedGateways;
  }

  constructor(options: {
    gatewaysProvider: GatewaysProvider;
    maxConcurrency: number;
    logger: ReturnType<typeof createSdkLogger>;
  }) {
    this.gatewaysProvider = options.gatewaysProvider;
    this.maxConcurrency = options.maxConcurrency;
    this.logger = options.logger;
  }

  async verifyData(params: {
    data: ReadableStream<Uint8Array>;
    txId: string;
    headers: Record<string, string>;
  }): Promise<void> {
    // Get current trusted gateways from the provider
    const gateways = await this.gatewaysProvider.getGateways();

    if (gateways.length === 0) {
      throw new Error('No trusted gateways available for verification');
    }

    // Cache gateways for the trustedGateways getter
    this._cachedGateways = gateways;

    // Create a HashVerificationStrategy with the current gateways
    const strategy = new HashVerificationStrategy({
      trustedGateways: gateways,
      maxConcurrency: this.maxConcurrency,
      logger: this.logger,
    });

    // Delegate to the HashVerificationStrategy
    return strategy.verifyData(params);
  }
}

/**
 * Initialize Wayfinder SDK services
 */
export function createWayfinderServices(
  config: RouterConfig,
  logger: Logger,
): WayfinderServices {
  const { provider: gatewaysProvider, topStakedProvider } = createGatewaysProvider(config, logger);

  const routingStrategy = createRoutingStrategy(
    config.routing.strategy,
    gatewaysProvider,
    logger,
  );

  const verificationStrategy = createVerificationStrategy(config, topStakedProvider, logger);

  logger.info('Wayfinder services initialized', {
    gatewaySource: config.routing.gatewaySource,
    routingStrategy: config.routing.strategy,
    verificationEnabled: config.verification.enabled,
    networkPoolSize: config.routing.gatewaySource === 'network'
      ? config.networkGateways.poolSize
      : undefined,
    staticTrustedGateways: config.routing.gatewaySource !== 'network'
      ? config.verification.trustedGateways.map((g) => g.toString())
      : undefined,
  });

  return {
    gatewaysProvider,
    routingStrategy,
    verificationStrategy,
    topStakedProvider,
  };
}
