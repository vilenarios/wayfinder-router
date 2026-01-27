/**
 * Arweave Node Selector
 * Selects Arweave nodes for API requests with health tracking
 */

import { GatewayHealthCache } from "../cache/gateway-health.js";
import type { RouterConfig, Logger } from "../types/index.js";

export interface ArweaveNodeSelectorOptions {
  /** List of Arweave node URLs for GET requests */
  readNodes: URL[];
  /** List of Arweave node URLs for POST requests (falls back to readNodes if empty) */
  writeNodes: URL[];
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

export type ArweaveOperationType = "read" | "write";

export interface ArweaveNodeStats {
  totalReadNodes: number;
  healthyReadNodes: number;
  unhealthyReadNodes: number;
  totalWriteNodes: number;
  healthyWriteNodes: number;
  unhealthyWriteNodes: number;
}

export class ArweaveNodeSelector {
  private readNodes: URL[];
  private writeNodes: URL[];
  private healthCache: GatewayHealthCache;
  private logger: Logger;

  constructor(options: ArweaveNodeSelectorOptions) {
    const {
      readNodes,
      writeNodes,
      healthTtlMs = 300_000,
      circuitBreakerThreshold = 3,
      circuitBreakerResetMs = 60_000,
      maxNodes = 100,
      logger,
    } = options;

    this.readNodes = readNodes;
    // Fall back to read nodes if no write nodes specified
    this.writeNodes = writeNodes.length > 0 ? writeNodes : readNodes;
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
      readNodeCount: this.readNodes.length,
      readNodes: this.readNodes.map((n) => n.hostname),
      writeNodeCount: this.writeNodes.length,
      writeNodes: this.writeNodes.map((n) => n.hostname),
    });
  }

  /**
   * Select a healthy Arweave node for the specified operation type
   * Uses random selection with fallback to round-robin if all unhealthy
   * @param operation - Type of operation: 'read' for GET requests, 'write' for POST requests
   * @param exclude - Nodes to exclude from selection (e.g., already tried)
   */
  select(operation: ArweaveOperationType = "read", exclude?: URL[]): URL {
    const nodes = operation === "write" ? this.writeNodes : this.readNodes;

    // Filter to healthy nodes
    let candidates = this.healthCache.filterHealthy(nodes);

    // Apply exclusion list
    if (exclude && exclude.length > 0) {
      const excludeSet = new Set(exclude.map((n) => n.toString()));
      candidates = candidates.filter((n) => !excludeSet.has(n.toString()));
    }

    // If no healthy candidates, try all nodes (excluding the exclude list)
    if (candidates.length === 0) {
      this.logger.warn(
        `No healthy Arweave ${operation} nodes, trying all nodes`,
      );
      candidates = nodes;

      if (exclude && exclude.length > 0) {
        const excludeSet = new Set(exclude.map((n) => n.toString()));
        candidates = candidates.filter((n) => !excludeSet.has(n.toString()));
      }
    }

    // If still no candidates, fall back to all nodes
    if (candidates.length === 0) {
      this.logger.warn(
        `All Arweave ${operation} nodes excluded, resetting health cache`,
      );
      this.healthCache.clear();
      candidates = nodes;
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
   * Get all configured nodes for an operation type
   */
  getNodes(operation: ArweaveOperationType = "read"): URL[] {
    const nodes = operation === "write" ? this.writeNodes : this.readNodes;
    return [...nodes];
  }

  /**
   * Get node health statistics
   */
  stats(): ArweaveNodeStats {
    const healthyRead = this.healthCache.filterHealthy(this.readNodes);
    const healthyWrite = this.healthCache.filterHealthy(this.writeNodes);
    return {
      totalReadNodes: this.readNodes.length,
      healthyReadNodes: healthyRead.length,
      unhealthyReadNodes: this.readNodes.length - healthyRead.length,
      totalWriteNodes: this.writeNodes.length,
      healthyWriteNodes: healthyWrite.length,
      unhealthyWriteNodes: this.writeNodes.length - healthyWrite.length,
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

  if (config.arweaveApi.readNodes.length === 0) {
    logger.warn("Arweave API enabled but no read nodes configured");
    return null;
  }

  return new ArweaveNodeSelector({
    readNodes: config.arweaveApi.readNodes,
    writeNodes: config.arweaveApi.writeNodes,
    healthTtlMs: config.resilience.gatewayHealthTtlMs,
    circuitBreakerThreshold: config.resilience.circuitBreakerThreshold,
    circuitBreakerResetMs: config.resilience.circuitBreakerResetMs,
    maxNodes: Math.min(
      (config.arweaveApi.readNodes.length +
        config.arweaveApi.writeNodes.length) *
        2,
      100,
    ),
    logger,
  });
}
