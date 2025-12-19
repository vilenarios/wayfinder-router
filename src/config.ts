/**
 * Configuration management for Wayfinder Router
 */

import type {
  RouterConfig,
  RouterMode,
  RoutingStrategy,
  RoutingGatewaySource,
  VerificationGatewaySource,
} from "./types/index.js";

function getEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
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
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => new URL(s));
}

export function loadConfig(): RouterConfig {
  // Verification gateways (static, used when VERIFICATION_GATEWAY_SOURCE=static)
  const verificationStaticGatewaysStr = getEnv(
    "VERIFICATION_STATIC_GATEWAYS",
    "https://turbo-gateway.com,https://ardrive.net,https://permagate.io",
  );

  // Routing gateways (static, used when ROUTING_GATEWAY_SOURCE=static)
  const routingStaticGatewaysStr = getEnv(
    "ROUTING_STATIC_GATEWAYS",
    "https://turbo-gateway.com,https://ardrive.net,https://permagate.io",
  );

  // Trusted peer gateway (used when ROUTING_GATEWAY_SOURCE=trusted-peers)
  const trustedPeerGatewayStr = getEnv(
    "TRUSTED_PEER_GATEWAY",
    "https://turbo-gateway.com",
  );

  // Fallback gateways (used when network fetch fails)
  const fallbackGatewaysStr = getEnv(
    "NETWORK_FALLBACK_GATEWAYS",
    "https://turbo-gateway.com,https://ardrive.net,https://permagate.io",
  );

  return {
    server: {
      port: getEnvInt("PORT", 3000),
      host: getEnv("HOST", "0.0.0.0"),
      baseDomain: getEnv("BASE_DOMAIN", "localhost"),
      // ArNS name to serve at root domain (empty = show info page at root)
      arnsRootHost: getEnv("ARNS_ROOT_HOST", ""),
    },

    mode: {
      default: getEnv("DEFAULT_MODE", "proxy") as RouterMode,
      allowOverride: getEnvBool("ALLOW_MODE_OVERRIDE", true),
    },

    // Verification settings - determines how we verify data integrity
    verification: {
      enabled: getEnvBool("VERIFICATION_ENABLED", true),
      // Where to get trusted gateways for hash verification
      gatewaySource: getEnv(
        "VERIFICATION_GATEWAY_SOURCE",
        "top-staked",
      ) as VerificationGatewaySource,
      // Number of top staked gateways to use (when source is 'top-staked')
      gatewayCount: getEnvInt("VERIFICATION_GATEWAY_COUNT", 3),
      // Static trusted gateways (fallback or when source is 'static')
      staticGateways: parseUrls(verificationStaticGatewaysStr),
      // ArNS consensus threshold
      consensusThreshold: getEnvInt("ARNS_CONSENSUS_THRESHOLD", 2),
    },

    // Routing settings - determines where we fetch data from
    routing: {
      // How to select a gateway from the pool
      strategy: getEnv("ROUTING_STRATEGY", "fastest") as RoutingStrategy,
      // Where to get the list of gateways for routing
      gatewaySource: getEnv(
        "ROUTING_GATEWAY_SOURCE",
        "network",
      ) as RoutingGatewaySource,
      // Gateway to query for trusted peers (when source is 'trusted-peers')
      trustedPeerGateway: new URL(trustedPeerGatewayStr),
      // Static gateways (when source is 'static')
      staticGateways: parseUrls(routingStaticGatewaysStr),
      // Retry settings
      retryAttempts: getEnvInt("RETRY_ATTEMPTS", 3),
      retryDelayMs: getEnvInt("RETRY_DELAY_MS", 100),
      // Temperature strategy settings
      temperatureWindowMs: getEnvInt("TEMPERATURE_WINDOW_MS", 5 * 60 * 1000), // 5 minutes
      temperatureMaxSamples: getEnvInt("TEMPERATURE_MAX_SAMPLES", 100),
    },

    // Network gateway settings (shared by routing and verification when using network sources)
    networkGateways: {
      // How often to refresh gateway lists from the network
      refreshIntervalMs: getEnvInt(
        "NETWORK_GATEWAY_REFRESH_MS",
        24 * 60 * 60 * 1000,
      ), // 24 hours
      // Minimum gateways required to operate (fail-safe)
      minGateways: getEnvInt("NETWORK_MIN_GATEWAYS", 3),
      // Fallback gateways if network fetch fails
      fallbackGateways: parseUrls(fallbackGatewaysStr),
    },

    resilience: {
      gatewayHealthTtlMs: getEnvInt("GATEWAY_HEALTH_TTL_MS", 300_000),
      circuitBreakerThreshold: getEnvInt("CIRCUIT_BREAKER_THRESHOLD", 3),
      circuitBreakerResetMs: getEnvInt("CIRCUIT_BREAKER_RESET_MS", 60_000),
      gatewayHealthMaxEntries: getEnvInt("GATEWAY_HEALTH_MAX_ENTRIES", 1000),
    },

    cache: {
      arnsTtlMs: getEnvInt("ARNS_CACHE_TTL_MS", 300_000),
      contentEnabled: getEnvBool("CONTENT_CACHE_ENABLED", true), // Enable by default
      contentMaxSizeBytes: getEnvNumber(
        "CONTENT_CACHE_MAX_SIZE_BYTES",
        50 * 1024 * 1024 * 1024, // 50GB default
      ),
      contentMaxItemSizeBytes: getEnvNumber(
        "CONTENT_CACHE_MAX_ITEM_SIZE_BYTES",
        2 * 1024 * 1024 * 1024, // 2GB max per item
      ),
      contentPath: getEnv("CONTENT_CACHE_PATH", ""), // Empty = in-memory only
    },

    logging: {
      level: getEnv("LOG_LEVEL", "info"),
    },

    telemetry: {
      enabled: getEnvBool("TELEMETRY_ENABLED", true),
      routerId: getEnv("TELEMETRY_ROUTER_ID", `router-${Date.now()}`),
      sampling: {
        successfulRequests: getEnvFloat("TELEMETRY_SAMPLE_SUCCESS", 0.1),
        errors: getEnvFloat("TELEMETRY_SAMPLE_ERRORS", 1.0),
        latencyMeasurements: getEnvFloat("TELEMETRY_SAMPLE_LATENCY", 0.1),
      },
      storage: {
        type: "sqlite" as const,
        path: getEnv("TELEMETRY_DB_PATH", "./data/telemetry.db"),
        retentionDays: getEnvInt("TELEMETRY_RETENTION_DAYS", 30),
      },
      export: {
        enabled: getEnvBool("TELEMETRY_EXPORT_ENABLED", false),
        intervalHours: getEnvInt("TELEMETRY_EXPORT_INTERVAL_HOURS", 24),
        path: getEnv("TELEMETRY_EXPORT_PATH", "./data/telemetry-export.json"),
      },
    },

    rateLimit: {
      enabled: getEnvBool("RATE_LIMIT_ENABLED", false),
      windowMs: getEnvInt("RATE_LIMIT_WINDOW_MS", 60_000), // 1 minute default
      maxRequests: getEnvInt("RATE_LIMIT_MAX_REQUESTS", 1000),
    },

    // Gateway ping settings (for temperature strategy)
    ping: {
      enabled: getEnvBool("PING_ENABLED", true),
      intervalHours: getEnvInt("PING_INTERVAL_HOURS", 4),
      gatewayCount: getEnvInt("PING_GATEWAY_COUNT", 50),
      timeoutMs: getEnvInt("PING_TIMEOUT_MS", 5000),
      concurrency: getEnvInt("PING_CONCURRENCY", 10),
    },

    // Error handling settings
    errorHandling: {
      exitOnUnhandledRejection: getEnvBool("EXIT_ON_UNHANDLED_REJECTION", true),
      exitOnUncaughtException: getEnvBool("EXIT_ON_UNCAUGHT_EXCEPTION", true),
      exitGracePeriodMs: getEnvInt("EXIT_GRACE_PERIOD_MS", 3000),
    },
  };
}

export function validateConfig(config: RouterConfig): void {
  // === VERIFICATION VALIDATION ===

  // Validate verification gateway source
  const validVerificationSources: VerificationGatewaySource[] = [
    "top-staked",
    "static",
  ];
  if (!validVerificationSources.includes(config.verification.gatewaySource)) {
    throw new Error(
      `Invalid VERIFICATION_GATEWAY_SOURCE: ${config.verification.gatewaySource}. Must be one of: ${validVerificationSources.join(", ")}`,
    );
  }

  // Validate static gateways required when verification source is 'static'
  if (
    config.verification.enabled &&
    config.verification.gatewaySource === "static" &&
    config.verification.staticGateways.length === 0
  ) {
    throw new Error(
      "VERIFICATION_ENABLED is true with VERIFICATION_GATEWAY_SOURCE=static but no VERIFICATION_STATIC_GATEWAYS configured.",
    );
  }

  // Validate gateway count for top-staked verification
  if (config.verification.gatewaySource === "top-staked") {
    if (
      config.verification.gatewayCount < 1 ||
      config.verification.gatewayCount > 50
    ) {
      throw new Error(
        `VERIFICATION_GATEWAY_COUNT must be between 1 and 50, got ${config.verification.gatewayCount}`,
      );
    }
  }

  // Validate consensus threshold
  // SECURITY: Require at least 2 gateways for consensus to prevent single-gateway attacks
  if (
    config.verification.enabled &&
    config.verification.consensusThreshold < 2
  ) {
    throw new Error(
      `ARNS_CONSENSUS_THRESHOLD must be at least 2 for security (got ${config.verification.consensusThreshold}). ` +
        "A single gateway could otherwise dictate ArNS resolutions.",
    );
  }

  // Validate consensus threshold against gateway count
  if (config.verification.gatewaySource === "top-staked") {
    if (
      config.verification.consensusThreshold > config.verification.gatewayCount
    ) {
      throw new Error(
        `ARNS_CONSENSUS_THRESHOLD (${config.verification.consensusThreshold}) cannot be greater than VERIFICATION_GATEWAY_COUNT (${config.verification.gatewayCount})`,
      );
    }
  } else if (config.verification.gatewaySource === "static") {
    if (
      config.verification.consensusThreshold >
      config.verification.staticGateways.length
    ) {
      throw new Error(
        `ARNS_CONSENSUS_THRESHOLD (${config.verification.consensusThreshold}) cannot be greater than number of VERIFICATION_STATIC_GATEWAYS (${config.verification.staticGateways.length})`,
      );
    }
  }

  // === ROUTING VALIDATION ===

  // Validate routing strategy
  const validStrategies = ["fastest", "random", "round-robin", "temperature"];
  if (!validStrategies.includes(config.routing.strategy)) {
    throw new Error(
      `Invalid ROUTING_STRATEGY: ${config.routing.strategy}. Must be one of: ${validStrategies.join(", ")}`,
    );
  }

  // Validate routing gateway source
  const validRoutingSources: RoutingGatewaySource[] = [
    "network",
    "trusted-peers",
    "static",
  ];
  if (!validRoutingSources.includes(config.routing.gatewaySource)) {
    throw new Error(
      `Invalid ROUTING_GATEWAY_SOURCE: ${config.routing.gatewaySource}. Must be one of: ${validRoutingSources.join(", ")}`,
    );
  }

  // Validate static gateways required when routing source is 'static'
  if (
    config.routing.gatewaySource === "static" &&
    config.routing.staticGateways.length === 0
  ) {
    throw new Error(
      "ROUTING_GATEWAY_SOURCE is static but no ROUTING_STATIC_GATEWAYS configured",
    );
  }

  // === NETWORK GATEWAY VALIDATION ===

  // Validate network settings when using network sources
  const usesNetwork =
    config.routing.gatewaySource === "network" ||
    config.verification.gatewaySource === "top-staked";

  if (usesNetwork) {
    if (config.networkGateways.minGateways < 1) {
      throw new Error(
        `NETWORK_MIN_GATEWAYS must be at least 1, got ${config.networkGateways.minGateways}`,
      );
    }

    if (config.networkGateways.refreshIntervalMs < 60_000) {
      throw new Error(
        `NETWORK_GATEWAY_REFRESH_MS must be at least 60000 (1 minute), got ${config.networkGateways.refreshIntervalMs}`,
      );
    }

    if (config.networkGateways.fallbackGateways.length === 0) {
      throw new Error(
        "Using network gateway source but no NETWORK_FALLBACK_GATEWAYS configured for failover",
      );
    }
  }

  // === RESILIENCE VALIDATION ===

  if (config.resilience.gatewayHealthMaxEntries < 10) {
    throw new Error(
      `GATEWAY_HEALTH_MAX_ENTRIES must be at least 10, got ${config.resilience.gatewayHealthMaxEntries}`,
    );
  }

  // === PING VALIDATION ===

  if (config.ping.enabled) {
    if (config.ping.intervalHours < 1) {
      throw new Error(
        `PING_INTERVAL_HOURS must be at least 1, got ${config.ping.intervalHours}`,
      );
    }

    if (config.ping.gatewayCount < 1 || config.ping.gatewayCount > 200) {
      throw new Error(
        `PING_GATEWAY_COUNT must be between 1 and 200, got ${config.ping.gatewayCount}`,
      );
    }

    if (config.ping.timeoutMs < 1000 || config.ping.timeoutMs > 30000) {
      throw new Error(
        `PING_TIMEOUT_MS must be between 1000 and 30000, got ${config.ping.timeoutMs}`,
      );
    }

    if (config.ping.concurrency < 1 || config.ping.concurrency > 50) {
      throw new Error(
        `PING_CONCURRENCY must be between 1 and 50, got ${config.ping.concurrency}`,
      );
    }
  }

  // === ERROR HANDLING VALIDATION ===

  if (config.errorHandling.exitGracePeriodMs < 0) {
    throw new Error(
      `EXIT_GRACE_PERIOD_MS must be >= 0, got ${config.errorHandling.exitGracePeriodMs}`,
    );
  }

  if (config.errorHandling.exitGracePeriodMs > 30000) {
    throw new Error(
      `EXIT_GRACE_PERIOD_MS must be <= 30000 (30 seconds), got ${config.errorHandling.exitGracePeriodMs}`,
    );
  }
}
