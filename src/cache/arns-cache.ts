/**
 * ArNS resolution cache
 * Caches ArNS name → transaction ID mappings with TTL
 */

import { LRUCache } from "lru-cache";
import type { ArnsResolution, Logger } from "../types/index.js";

export interface ArnsCacheOptions {
  maxSize?: number;
  defaultTtlMs?: number;
  logger?: Logger;
}

export class ArnsCache {
  private cache: LRUCache<string, ArnsResolution>;
  private defaultTtlMs: number;
  private logger?: Logger;

  constructor(options: ArnsCacheOptions = {}) {
    const { maxSize = 10_000, defaultTtlMs = 300_000, logger } = options;

    this.defaultTtlMs = defaultTtlMs;
    this.logger = logger;

    this.cache = new LRUCache<string, ArnsResolution>({
      max: maxSize,
      ttl: defaultTtlMs,
      updateAgeOnGet: false,
      updateAgeOnHas: false,
    });
  }

  /**
   * Get cached ArNS resolution
   */
  get(arnsName: string): ArnsResolution | null {
    const normalized = arnsName.toLowerCase();
    const resolution = this.cache.get(normalized);

    if (resolution) {
      this.logger?.debug("ArNS cache hit", { arnsName: normalized });
      return resolution;
    }

    this.logger?.debug("ArNS cache miss", { arnsName: normalized });
    return null;
  }

  /**
   * Cache ArNS resolution with optional custom TTL
   */
  set(arnsName: string, resolution: ArnsResolution): void {
    const normalized = arnsName.toLowerCase();
    const ttl = resolution.ttlMs || this.defaultTtlMs;

    this.cache.set(normalized, resolution, { ttl });

    this.logger?.debug("ArNS cached", {
      arnsName: normalized,
      txId: resolution.txId,
      ttlMs: ttl,
    });
  }

  /**
   * Invalidate cached resolution for an ArNS name
   */
  invalidate(arnsName: string): void {
    const normalized = arnsName.toLowerCase();
    this.cache.delete(normalized);
    this.logger?.debug("ArNS cache invalidated", { arnsName: normalized });
  }

  /**
   * Clear all cached resolutions
   */
  clear(): void {
    this.cache.clear();
    this.logger?.debug("ArNS cache cleared");
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.cache.max,
    };
  }
}
