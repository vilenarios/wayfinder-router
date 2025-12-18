/**
 * Configuration management for Wayfinder Router
 */

import type {
  RouterConfig,
  RouterMode,
  RoutingStrategy,
  GatewaySource,
} from './types/index.js';

function getEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function getEnvFloat(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  // Use Number() to handle large values that parseInt can't
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseUrls(value: string): URL[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => new URL(s));
}

export function loadConfig(): RouterConfig {
  const trustedGatewaysStr = getEnv(
    'TRUSTED_GATEWAYS',
    'https://arweave.net,https://ar-io.dev',
  );
  const staticGatewaysStr = getEnv(
    'STATIC_GATEWAYS',
    'https://arweave.net,https://ar-io.dev',
  );
  const trustedPeerGatewayStr = getEnv(
    'TRUSTED_PEER_GATEWAY',
    'https://arweave.net',
  );

  return {
    server: {
      port: getEnvInt('PORT', 3000),
      host: getEnv('HOST', '0.0.0.0'),
      baseDomain: getEnv('BASE_DOMAIN', 'localhost'),
    },

    mode: {
      default: getEnv('DEFAULT_MODE', 'proxy') as RouterMode,
      allowOverride: getEnvBool('ALLOW_MODE_OVERRIDE', true),
    },

    verification: {
      enabled: getEnvBool('VERIFICATION_ENABLED', true),
      trustedGateways: parseUrls(trustedGatewaysStr),
      consensusThreshold: getEnvInt('ARNS_CONSENSUS_THRESHOLD', 2),
    },

    routing: {
      strategy: getEnv('ROUTING_STRATEGY', 'fastest') as RoutingStrategy,
      gatewaySource: getEnv('GATEWAY_SOURCE', 'network') as GatewaySource,
      trustedPeerGateway: new URL(trustedPeerGatewayStr),
      staticGateways: parseUrls(staticGatewaysStr),
      retryAttempts: getEnvInt('RETRY_ATTEMPTS', 3),
      retryDelayMs: getEnvInt('RETRY_DELAY_MS', 100),
    },

    networkGateways: {
      poolSize: getEnvInt('NETWORK_GATEWAY_POOL_SIZE', 10),
      refreshIntervalMs: getEnvInt('NETWORK_GATEWAY_REFRESH_MS', 24 * 60 * 60 * 1000), // 24 hours
    },

    resilience: {
      gatewayHealthTtlMs: getEnvInt('GATEWAY_HEALTH_TTL_MS', 300_000),
      circuitBreakerThreshold: getEnvInt('CIRCUIT_BREAKER_THRESHOLD', 3),
      circuitBreakerResetMs: getEnvInt('CIRCUIT_BREAKER_RESET_MS', 60_000),
    },

    cache: {
      arnsTtlMs: getEnvInt('ARNS_CACHE_TTL_MS', 300_000),
      contentEnabled: getEnvBool('CONTENT_CACHE_ENABLED', true), // Enable by default
      contentMaxSizeBytes: getEnvNumber(
        'CONTENT_CACHE_MAX_SIZE_BYTES',
        50 * 1024 * 1024 * 1024, // 50GB default
      ),
      contentMaxItemSizeBytes: getEnvNumber(
        'CONTENT_CACHE_MAX_ITEM_SIZE_BYTES',
        2 * 1024 * 1024 * 1024, // 2GB max per item
      ),
      contentPath: getEnv('CONTENT_CACHE_PATH', ''), // Empty = in-memory only
    },

    logging: {
      level: getEnv('LOG_LEVEL', 'info'),
    },

    telemetry: {
      enabled: getEnvBool('TELEMETRY_ENABLED', true),
      routerId: getEnv('TELEMETRY_ROUTER_ID', `router-${Date.now()}`),
      sampling: {
        successfulRequests: getEnvFloat('TELEMETRY_SAMPLE_SUCCESS', 0.1),
        errors: getEnvFloat('TELEMETRY_SAMPLE_ERRORS', 1.0),
        latencyMeasurements: getEnvFloat('TELEMETRY_SAMPLE_LATENCY', 0.1),
      },
      storage: {
        type: 'sqlite' as const,
        path: getEnv('TELEMETRY_DB_PATH', './data/telemetry.db'),
        retentionDays: getEnvInt('TELEMETRY_RETENTION_DAYS', 30),
      },
      export: {
        enabled: getEnvBool('TELEMETRY_EXPORT_ENABLED', false),
        intervalHours: getEnvInt('TELEMETRY_EXPORT_INTERVAL_HOURS', 24),
        path: getEnv('TELEMETRY_EXPORT_PATH', './data/telemetry-export.json'),
      },
    },

    rateLimit: {
      enabled: getEnvBool('RATE_LIMIT_ENABLED', false),
      windowMs: getEnvInt('RATE_LIMIT_WINDOW_MS', 60_000), // 1 minute default
      maxRequests: getEnvInt('RATE_LIMIT_MAX_REQUESTS', 1000),
    },
  };
}

export function validateConfig(config: RouterConfig): void {
  // Validate trusted gateways (only required if NOT using network source for verification)
  if (
    config.verification.enabled &&
    config.routing.gatewaySource !== 'network' &&
    config.verification.trustedGateways.length === 0
  ) {
    throw new Error(
      'VERIFICATION_ENABLED is true but no TRUSTED_GATEWAYS configured. ' +
      'Either set TRUSTED_GATEWAYS or use GATEWAY_SOURCE=network to fetch from ar.io registry.',
    );
  }

  // Validate consensus threshold (only when using static trusted gateways)
  if (
    config.routing.gatewaySource !== 'network' &&
    config.verification.consensusThreshold >
    config.verification.trustedGateways.length
  ) {
    throw new Error(
      `ARNS_CONSENSUS_THRESHOLD (${config.verification.consensusThreshold}) cannot be greater than number of TRUSTED_GATEWAYS (${config.verification.trustedGateways.length})`,
    );
  }

  // Validate network gateway pool size
  if (config.routing.gatewaySource === 'network') {
    if (config.networkGateways.poolSize < 1 || config.networkGateways.poolSize > 100) {
      throw new Error(
        `NETWORK_GATEWAY_POOL_SIZE must be between 1 and 100, got ${config.networkGateways.poolSize}`,
      );
    }
  }

  // Validate routing strategy
  const validStrategies = ['fastest', 'random', 'round-robin'];
  if (!validStrategies.includes(config.routing.strategy)) {
    throw new Error(
      `Invalid ROUTING_STRATEGY: ${config.routing.strategy}. Must be one of: ${validStrategies.join(', ')}`,
    );
  }

  // Validate gateway source
  const validSources = ['network', 'trusted-peers', 'static'];
  if (!validSources.includes(config.routing.gatewaySource)) {
    throw new Error(
      `Invalid GATEWAY_SOURCE: ${config.routing.gatewaySource}. Must be one of: ${validSources.join(', ')}`,
    );
  }

  // Validate static gateways if using static source
  if (
    config.routing.gatewaySource === 'static' &&
    config.routing.staticGateways.length === 0
  ) {
    throw new Error(
      'GATEWAY_SOURCE is static but no STATIC_GATEWAYS configured',
    );
  }
}
