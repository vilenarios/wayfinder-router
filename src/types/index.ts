/**
 * Wayfinder Router Types
 */

// Request types
export type RequestType = "arns" | "txid" | "reserved";

export interface ArnsRequestInfo {
  type: "arns";
  arnsName: string;
  path: string;
}

export interface TxIdRequestInfo {
  type: "txid";
  txId: string;
  path: string;
}

export interface ReservedRequestInfo {
  type: "reserved";
  path: string;
}

export type RequestInfo =
  | ArnsRequestInfo
  | TxIdRequestInfo
  | ReservedRequestInfo;

// Router modes
export type RouterMode = "proxy" | "route";

// Routing strategies
export type RoutingStrategy = "fastest" | "random" | "round-robin";

// Gateway sources for ROUTING (where to fetch data - trust not required)
export type RoutingGatewaySource = "network" | "trusted-peers" | "static";

// Gateway sources for VERIFICATION (who to ask for hashes - trust required)
export type VerificationGatewaySource = "top-staked" | "static";

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

  // Verification settings - determines how we verify data integrity
  verification: {
    enabled: boolean;
    // Where to get trusted gateways for hash verification
    gatewaySource: VerificationGatewaySource;
    // Number of top staked gateways to use (when source is 'top-staked')
    gatewayCount: number;
    // Static trusted gateways (fallback or when source is 'static')
    staticGateways: URL[];
    // ArNS consensus threshold
    consensusThreshold: number;
  };

  // Routing settings - determines where we fetch data from
  routing: {
    // How to select a gateway from the pool
    strategy: RoutingStrategy;
    // Where to get the list of gateways for routing
    gatewaySource: RoutingGatewaySource;
    // Gateway to query for trusted peers (when source is 'trusted-peers')
    trustedPeerGateway: URL;
    // Static gateways (when source is 'static')
    staticGateways: URL[];
    // Retry settings
    retryAttempts: number;
    retryDelayMs: number;
  };

  // Network gateway settings (shared by routing and verification when using network sources)
  networkGateways: {
    // How often to refresh gateway lists from the network
    refreshIntervalMs: number;
    // Minimum gateways required to operate (fail-safe)
    minGateways: number;
    // Fallback gateways if network fetch fails
    fallbackGateways: URL[];
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
      type: "sqlite";
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
export type { TelemetryConfig } from "./telemetry.js";

// Re-export manifest types
export type {
  ArweaveManifest,
  ManifestPathEntry,
  VerifiedManifest,
  ManifestPathResolution,
} from "./manifest.js";
export { isArweaveManifest, normalizeManifestPath } from "./manifest.js";
