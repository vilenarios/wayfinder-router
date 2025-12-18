/**
 * Wayfinder Router Types
 */

// Request types
export type RequestType = 'arns' | 'txid' | 'reserved';

export interface ArnsRequestInfo {
  type: 'arns';
  arnsName: string;
  path: string;
}

export interface TxIdRequestInfo {
  type: 'txid';
  txId: string;
  path: string;
}

export interface ReservedRequestInfo {
  type: 'reserved';
  path: string;
}

export type RequestInfo = ArnsRequestInfo | TxIdRequestInfo | ReservedRequestInfo;

// Router modes
export type RouterMode = 'proxy' | 'route';

// Routing strategies
export type RoutingStrategy = 'fastest' | 'random' | 'round-robin';

// Gateway sources
export type GatewaySource = 'network' | 'trusted-peers' | 'static';

// Configuration
export interface RouterConfig {
  server: {
    port: number;
    host: string;
    baseDomain: string;
  };

  mode: {
    default: RouterMode;
    allowOverride: boolean;
  };

  verification: {
    enabled: boolean;
    trustedGateways: URL[];
    consensusThreshold: number;
  };

  routing: {
    strategy: RoutingStrategy;
    gatewaySource: GatewaySource;
    trustedPeerGateway: URL;
    staticGateways: URL[];
    retryAttempts: number;
    retryDelayMs: number;
  };

  // Network gateway settings (when gatewaySource is 'network')
  networkGateways: {
    poolSize: number; // Number of top staked gateways to use
    refreshIntervalMs: number; // How often to refresh the gateway list
  };

  resilience: {
    gatewayHealthTtlMs: number;
    circuitBreakerThreshold: number;
    circuitBreakerResetMs: number;
  };

  cache: {
    arnsTtlMs: number;
    contentEnabled: boolean;
    contentMaxSizeBytes: number;
    contentMaxItemSizeBytes: number;
    contentPath: string; // Empty = in-memory only
  };

  logging: {
    level: string;
  };

  telemetry: {
    enabled: boolean;
    routerId: string;
    sampling: {
      successfulRequests: number;
      errors: number;
      latencyMeasurements: number;
    };
    storage: {
      type: 'sqlite';
      path: string;
      retentionDays: number;
    };
    export: {
      enabled: boolean;
      intervalHours: number;
      path?: string;
    };
  };

  rateLimit: {
    enabled: boolean;
    windowMs: number;
    maxRequests: number;
  };
}

// Gateway health tracking
export interface GatewayHealth {
  healthy: boolean;
  lastChecked: number;
  failures: number;
  circuitOpen: boolean;
  circuitOpenUntil: number;
}

// ArNS resolution
export interface ArnsResolution {
  txId: string;
  ttlMs: number;
  resolvedAt: number;
  processId?: string;
}

// Verification result
export interface VerificationResult {
  verified: boolean;
  txId: string;
  hash?: string;
  expectedHash?: string;
  durationMs: number;
  error?: string;
}

// Proxy response metadata
export interface ProxyMetadata {
  mode: RouterMode;
  verified: boolean;
  gateway: string;
  txId: string;
  verificationTimeMs?: number;
  cached?: boolean;
}

// Logger interface (compatible with pino)
export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  child(bindings: Record<string, unknown>): Logger;
}

// Re-export telemetry types
export type { TelemetryConfig } from './telemetry.js';
