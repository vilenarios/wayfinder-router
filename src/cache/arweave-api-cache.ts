/**
 * Arweave API response cache
 * Caches Arweave node API responses with separate TTLs for immutable and dynamic data
 */

import { LRUCache } from "lru-cache";
import type { Logger } from "../types/index.js";
import type {
  ArweaveApiEndpoint,
  ArweaveApiCategory,
} from "../types/arweave-api.js";
import { getEndpointCategory } from "../types/arweave-api.js";

export interface CachedApiResponse {
  /** Raw response data */
  data: Uint8Array;
  /** Content-Type header */
  contentType: string;
  /** Response headers to forward */
  headers: Record<string, string>;
  /** When this response was cached */
  cachedAt: number;
  /** Cache category (immutable/dynamic) */
  category: ArweaveApiCategory;
  /** Endpoint type */
  endpoint: ArweaveApiEndpoint;
}

export interface ArweaveApiCacheOptions {
  /** Enable/disable cache */
  enabled?: boolean;
  /** TTL for immutable data (tx, blocks) in ms */
  immutableTtlMs?: number;
  /** TTL for dynamic data (info, balances, status) in ms */
  dynamicTtlMs?: number;
  /** Maximum cache entries */
  maxEntries?: number;
  /** Maximum cache size in bytes */
  maxSizeBytes?: number;
  /** Logger instance */
  logger?: Logger;
}

export interface ArweaveApiCacheStats {
  size: number;
  maxEntries: number;
  currentSizeBytes: number;
  maxSizeBytes: number;
  hits: number;
  misses: number;
  hitRate: number;
}

export class ArweaveApiCache {
  private cache: LRUCache<string, CachedApiResponse>;
  private enabled: boolean;
  private immutableTtlMs: number;
  private dynamicTtlMs: number;
  private maxSizeBytes: number;
  private currentSizeBytes: number = 0;
  private hits: number = 0;
  private misses: number = 0;
  private logger?: Logger;

  constructor(options: ArweaveApiCacheOptions = {}) {
    const {
      enabled = true,
      immutableTtlMs = 24 * 60 * 60 * 1000, // 24 hours
      dynamicTtlMs = 30_000, // 30 seconds
      maxEntries = 10_000,
      maxSizeBytes = 100 * 1024 * 1024, // 100MB
      logger,
    } = options;

    this.enabled = enabled;
    this.immutableTtlMs = immutableTtlMs;
    this.dynamicTtlMs = dynamicTtlMs;
    this.maxSizeBytes = maxSizeBytes;
    this.logger = logger;

    this.cache = new LRUCache<string, CachedApiResponse>({
      max: maxEntries,
      // Don't use global TTL - we set TTL per entry based on category
      ttl: 0,
      updateAgeOnGet: true,
      updateAgeOnHas: false,
      dispose: (value) => {
        this.currentSizeBytes -= value.data.length;
      },
      noDisposeOnSet: true,
    });
  }

  /**
   * Create cache key from endpoint and params
   */
  private createKey(
    endpoint: ArweaveApiEndpoint,
    params: Record<string, string>,
  ): string {
    const sortedParams = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(":");
    return sortedParams ? `${endpoint}:${sortedParams}` : endpoint;
  }

  /**
   * Get TTL for a cache category
   */
  getTtlForCategory(category: ArweaveApiCategory): number {
    return category === "immutable" ? this.immutableTtlMs : this.dynamicTtlMs;
  }

  /**
   * Check if a cached entry is still valid
   */
  private isValid(entry: CachedApiResponse): boolean {
    const ttl = this.getTtlForCategory(entry.category);
    return Date.now() - entry.cachedAt < ttl;
  }

  /**
   * Get cached API response
   */
  get(
    endpoint: ArweaveApiEndpoint,
    params: Record<string, string>,
  ): CachedApiResponse | null {
    if (!this.enabled) {
      return null;
    }

    const key = this.createKey(endpoint, params);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      this.logger?.debug("Arweave API cache miss", { endpoint, params });
      return null;
    }

    // Check if entry is still valid based on category TTL
    if (!this.isValid(entry)) {
      this.cache.delete(key);
      this.misses++;
      this.logger?.debug("Arweave API cache expired", { endpoint, params });
      return null;
    }

    this.hits++;
    this.logger?.debug("Arweave API cache hit", { endpoint, params });
    return entry;
  }

  /**
   * Cache an API response
   * @returns true if cached, false if rejected (size limits, etc.)
   */
  set(
    endpoint: ArweaveApiEndpoint,
    params: Record<string, string>,
    data: Uint8Array,
    contentType: string,
    headers: Record<string, string> = {},
  ): boolean {
    if (!this.enabled) {
      return false;
    }

    const dataSize = data.length;

    // Check if single entry exceeds reasonable size (10% of max)
    const maxItemSize = Math.max(this.maxSizeBytes * 0.1, 1024 * 1024); // At least 1MB
    if (dataSize > maxItemSize) {
      this.logger?.debug("Arweave API cache item too large", {
        endpoint,
        params,
        size: dataSize,
        maxSize: maxItemSize,
      });
      return false;
    }

    // Evict entries if we would exceed size limit
    while (
      this.currentSizeBytes + dataSize > this.maxSizeBytes &&
      this.cache.size > 0
    ) {
      // Pop oldest entry (LRU eviction)
      const oldest = this.cache.keys().next().value;
      if (oldest) {
        this.cache.delete(oldest);
      } else {
        break;
      }
    }

    const key = this.createKey(endpoint, params);
    const category = getEndpointCategory(endpoint);

    // If updating existing entry, subtract old size first
    const existing = this.cache.peek(key);
    if (existing) {
      this.currentSizeBytes -= existing.data.length;
    }

    const entry: CachedApiResponse = {
      data,
      contentType,
      headers,
      cachedAt: Date.now(),
      category,
      endpoint,
    };

    this.cache.set(key, entry);
    this.currentSizeBytes += dataSize;

    this.logger?.debug("Arweave API cached", {
      endpoint,
      params,
      size: dataSize,
      category,
      ttlMs: this.getTtlForCategory(category),
    });

    return true;
  }

  /**
   * Check if entry exists and is valid
   */
  has(endpoint: ArweaveApiEndpoint, params: Record<string, string>): boolean {
    if (!this.enabled) {
      return false;
    }

    const key = this.createKey(endpoint, params);
    const entry = this.cache.peek(key);

    if (!entry) {
      return false;
    }

    return this.isValid(entry);
  }

  /**
   * Delete a cached entry
   */
  delete(endpoint: ArweaveApiEndpoint, params: Record<string, string>): void {
    const key = this.createKey(endpoint, params);
    this.cache.delete(key);
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.currentSizeBytes = 0;
    this.hits = 0;
    this.misses = 0;
    this.logger?.debug("Arweave API cache cleared");
  }

  /**
   * Get cache statistics
   */
  stats(): ArweaveApiCacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxEntries: this.cache.max,
      currentSizeBytes: this.currentSizeBytes,
      maxSizeBytes: this.maxSizeBytes,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Get Prometheus metrics
   */
  getPrometheusMetrics(): string {
    const stats = this.stats();
    return [
      "# HELP arweave_api_cache_entries Number of entries in the Arweave API cache",
      "# TYPE arweave_api_cache_entries gauge",
      `arweave_api_cache_entries ${stats.size}`,
      "",
      "# HELP arweave_api_cache_max_entries Maximum entries in the Arweave API cache",
      "# TYPE arweave_api_cache_max_entries gauge",
      `arweave_api_cache_max_entries ${stats.maxEntries}`,
      "",
      "# HELP arweave_api_cache_size_bytes Current size of the Arweave API cache in bytes",
      "# TYPE arweave_api_cache_size_bytes gauge",
      `arweave_api_cache_size_bytes ${stats.currentSizeBytes}`,
      "",
      "# HELP arweave_api_cache_max_size_bytes Maximum size of the Arweave API cache in bytes",
      "# TYPE arweave_api_cache_max_size_bytes gauge",
      `arweave_api_cache_max_size_bytes ${stats.maxSizeBytes}`,
      "",
      "# HELP arweave_api_cache_hits_total Total cache hits",
      "# TYPE arweave_api_cache_hits_total counter",
      `arweave_api_cache_hits_total ${stats.hits}`,
      "",
      "# HELP arweave_api_cache_misses_total Total cache misses",
      "# TYPE arweave_api_cache_misses_total counter",
      `arweave_api_cache_misses_total ${stats.misses}`,
      "",
    ].join("\n");
  }
}
