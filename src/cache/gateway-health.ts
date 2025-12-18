/**
 * Gateway health tracking cache
 * Tracks healthy/unhealthy gateways with circuit breaker pattern
 */

import type { GatewayHealth, Logger } from "../types/index.js";

export interface GatewayHealthCacheOptions {
  healthTtlMs?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerResetMs?: number;
  logger?: Logger;
}

export class GatewayHealthCache {
  private health: Map<string, GatewayHealth>;
  private healthTtlMs: number;
  private circuitBreakerThreshold: number;
  private circuitBreakerResetMs: number;
  private logger?: Logger;

  constructor(options: GatewayHealthCacheOptions = {}) {
    const {
      healthTtlMs = 300_000,
      circuitBreakerThreshold = 3,
      circuitBreakerResetMs = 60_000,
      logger,
    } = options;

    this.health = new Map();
    this.healthTtlMs = healthTtlMs;
    this.circuitBreakerThreshold = circuitBreakerThreshold;
    this.circuitBreakerResetMs = circuitBreakerResetMs;
    this.logger = logger;
  }

  /**
   * Normalize gateway URL to string key
   */
  private normalizeKey(gateway: URL | string): string {
    const url = typeof gateway === "string" ? new URL(gateway) : gateway;
    return `${url.protocol}//${url.host}`;
  }

  /**
   * Check if a gateway is healthy
   */
  isHealthy(gateway: URL | string): boolean {
    const key = this.normalizeKey(gateway);
    const state = this.health.get(key);

    if (!state) {
      return true; // Unknown gateways are assumed healthy
    }

    const now = Date.now();

    // Check if circuit breaker has reset
    if (state.circuitOpen && now > state.circuitOpenUntil) {
      // Circuit is closing, allow a test request
      this.logger?.debug("Circuit breaker half-open", { gateway: key });
      return true;
    }

    // Check if health status has expired
    if (now - state.lastChecked > this.healthTtlMs) {
      // Status expired, assume healthy and allow request
      this.health.delete(key);
      return true;
    }

    return state.healthy && !state.circuitOpen;
  }

  /**
   * Get all healthy gateways from a list
   */
  filterHealthy(gateways: URL[]): URL[] {
    return gateways.filter((gw) => this.isHealthy(gw));
  }

  /**
   * Mark a gateway as healthy after successful request
   */
  markHealthy(gateway: URL | string): void {
    const key = this.normalizeKey(gateway);
    const state = this.health.get(key);

    if (state) {
      // Reset failures and close circuit
      state.healthy = true;
      state.failures = 0;
      state.circuitOpen = false;
      state.circuitOpenUntil = 0;
      state.lastChecked = Date.now();

      this.logger?.debug("Gateway marked healthy", { gateway: key });
    }
  }

  /**
   * Record a failure for a gateway
   */
  recordFailure(gateway: URL | string): void {
    const key = this.normalizeKey(gateway);
    const now = Date.now();

    let state = this.health.get(key);

    if (!state) {
      state = {
        healthy: true,
        lastChecked: now,
        failures: 0,
        circuitOpen: false,
        circuitOpenUntil: 0,
      };
      this.health.set(key, state);
    }

    state.failures++;
    state.lastChecked = now;

    this.logger?.debug("Gateway failure recorded", {
      gateway: key,
      failures: state.failures,
    });

    // Check if circuit breaker should open
    if (state.failures >= this.circuitBreakerThreshold) {
      state.healthy = false;
      state.circuitOpen = true;
      state.circuitOpenUntil = now + this.circuitBreakerResetMs;

      this.logger?.warn("Circuit breaker opened", {
        gateway: key,
        resetAt: new Date(state.circuitOpenUntil).toISOString(),
      });
    }
  }

  /**
   * Explicitly mark a gateway as unhealthy
   */
  markUnhealthy(gateway: URL | string, durationMs?: number): void {
    const key = this.normalizeKey(gateway);
    const now = Date.now();

    const state: GatewayHealth = {
      healthy: false,
      lastChecked: now,
      failures: this.circuitBreakerThreshold,
      circuitOpen: true,
      circuitOpenUntil: now + (durationMs ?? this.circuitBreakerResetMs),
    };

    this.health.set(key, state);

    this.logger?.warn("Gateway marked unhealthy", {
      gateway: key,
      durationMs: durationMs ?? this.circuitBreakerResetMs,
    });
  }

  /**
   * Clear all health tracking (useful when all gateways appear unhealthy)
   */
  clear(): void {
    this.health.clear();
    this.logger?.info("Gateway health cache cleared");
  }

  /**
   * Get health statistics
   */
  stats(): {
    total: number;
    healthy: number;
    unhealthy: number;
    circuitOpen: number;
  } {
    let healthy = 0;
    let unhealthy = 0;
    let circuitOpen = 0;

    for (const state of this.health.values()) {
      if (state.healthy) healthy++;
      else unhealthy++;
      if (state.circuitOpen) circuitOpen++;
    }

    return {
      total: this.health.size,
      healthy,
      unhealthy,
      circuitOpen,
    };
  }
}
