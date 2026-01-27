/**
 * Arweave Node Selector
 * Selects Arweave nodes for API requests with health tracking
 */

import { GatewayHealthCache } from "../cache/gateway-health.js";
import type { RouterConfig, Logger } from "../types/index.js";

export interface ArweaveNodeSelectorOptions {
  /** List of Arweave node URLs */
  nodes: URL[];
  /** Health TTL in ms */
  healthTtlMs?: number;
  /** Number of failures before opening circuit */
  circuitBreakerThreshold?: number;
  /** Time before circuit breaker resets in ms */
  circuitBreakerResetMs?: number;
  /** Maximum nodes to track health for */
  maxNodes?: number;
  /** Logger instance */
  logger: Logger;
}

export interface ArweaveNodeStats {
  totalNodes: number;
  healthyNodes: number;
  unhealthyNodes: number;
}

export class ArweaveNodeSelector {
  private nodes: URL[];
  private healthCache: GatewayHealthCache;
  private logger: Logger;

  constructor(options: ArweaveNodeSelectorOptions) {
    const {
      nodes,
      healthTtlMs = 300_000,
      circuitBreakerThreshold = 3,
      circuitBreakerResetMs = 60_000,
      maxNodes = 100,
      logger,
    } = options;

    this.nodes = nodes;
    this.logger = logger;

    // Reuse GatewayHealthCache for circuit breaker logic
    this.healthCache = new GatewayHealthCache({
      healthTtlMs,
      circuitBreakerThreshold,
      circuitBreakerResetMs,
      maxGateways: maxNodes,
      logger,
    });

    this.logger.info("Arweave node selector initialized", {
      nodeCount: nodes.length,
      nodes: nodes.map((n) => n.hostname),
    });
  }

  /**
   * Select a healthy Arweave node
   * Uses random selection with fallback to round-robin if all unhealthy
   * @param exclude - Nodes to exclude from selection (e.g., already tried)
   */
  select(exclude?: URL[]): URL {
    // Filter to healthy nodes
    let candidates = this.healthCache.filterHealthy(this.nodes);

    // Apply exclusion list
    if (exclude && exclude.length > 0) {
      const excludeSet = new Set(exclude.map((n) => n.toString()));
      candidates = candidates.filter((n) => !excludeSet.has(n.toString()));
    }

    // If no healthy candidates, try all nodes (excluding the exclude list)
    if (candidates.length === 0) {
      this.logger.warn("No healthy Arweave nodes, trying all nodes");
      candidates = this.nodes;

      if (exclude && exclude.length > 0) {
        const excludeSet = new Set(exclude.map((n) => n.toString()));
        candidates = candidates.filter((n) => !excludeSet.has(n.toString()));
      }
    }

    // If still no candidates, fall back to all nodes
    if (candidates.length === 0) {
      this.logger.warn("All Arweave nodes excluded, resetting health cache");
      this.healthCache.clear();
      candidates = this.nodes;
    }

    // Random selection
    if (candidates.length === 1) {
      return candidates[0];
    }

    const index = Math.floor(Math.random() * candidates.length);
    return candidates[index];
  }

  /**
   * Mark a node as healthy after successful request
   */
  markHealthy(node: URL): void {
    this.healthCache.markHealthy(node);
    this.logger.debug("Arweave node marked healthy", {
      node: node.hostname,
    });
  }

  /**
   * Record a failure for a node
   */
  recordFailure(node: URL): void {
    this.healthCache.recordFailure(node);
    this.logger.debug("Arweave node failure recorded", {
      node: node.hostname,
    });
  }

  /**
   * Get all configured nodes
   */
  getNodes(): URL[] {
    return [...this.nodes];
  }

  /**
   * Get node health statistics
   */
  stats(): ArweaveNodeStats {
    const healthy = this.healthCache.filterHealthy(this.nodes);
    return {
      totalNodes: this.nodes.length,
      healthyNodes: healthy.length,
      unhealthyNodes: this.nodes.length - healthy.length,
    };
  }

  /**
   * Clear health tracking (useful after config change)
   */
  clearHealth(): void {
    this.healthCache.clear();
    this.logger.info("Arweave node health cache cleared");
  }
}

/**
 * Factory function to create ArweaveNodeSelector from config
 */
export function createArweaveNodeSelector(
  config: RouterConfig,
  logger: Logger,
): ArweaveNodeSelector | null {
  if (!config.arweaveApi.enabled) {
    return null;
  }

  if (config.arweaveApi.nodes.length === 0) {
    logger.warn("Arweave API enabled but no nodes configured");
    return null;
  }

  return new ArweaveNodeSelector({
    nodes: config.arweaveApi.nodes,
    healthTtlMs: config.resilience.gatewayHealthTtlMs,
    circuitBreakerThreshold: config.resilience.circuitBreakerThreshold,
    circuitBreakerResetMs: config.resilience.circuitBreakerResetMs,
    maxNodes: Math.min(config.arweaveApi.nodes.length * 2, 100),
    logger,
  });
}
