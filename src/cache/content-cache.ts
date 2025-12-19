/**
 * Verified Content Cache
 * LRU cache for verified Arweave content
 *
 * Since Arweave data is immutable, once we've verified content by its hash,
 * we can safely cache it indefinitely. The LRU eviction ensures memory stays bounded.
 */

import { LRUCache } from "lru-cache";
import type { Logger } from "../types/index.js";

export interface CachedContent {
  data: Uint8Array;
  contentType: string;
  contentLength: number;
  headers: Record<string, string>;
  verifiedAt: number;
  txId: string;
  hash?: string; // The verified hash
  accessCount: number; // Track popularity
  lastAccessed: number; // Timestamp of last access
}

export interface ContentCacheOptions {
  enabled?: boolean;
  maxSizeBytes?: number;
  maxEntries?: number;
  ttlMs?: number; // 0 = no TTL (immutable content mode)
  maxItemSizeBytes?: number; // Don't cache items larger than this
  logger?: Logger;
}

export class ContentCache {
  private cache: LRUCache<string, CachedContent>;
  private currentSizeBytes: number;
  private maxSizeBytes: number;
  private maxItemSizeBytes: number;
  private enabled: boolean;
  private logger?: Logger;
  private hits: number = 0;
  private misses: number = 0;

  constructor(options: ContentCacheOptions = {}) {
    const {
      enabled = true,
      maxSizeBytes = 100 * 1024 * 1024, // 100MB default
      maxEntries = 1000,
      ttlMs = 0, // No TTL by default - Arweave content is immutable
      maxItemSizeBytes = 10 * 1024 * 1024, // 10MB max per item
      logger,
    } = options;

    this.enabled = enabled;
    this.maxSizeBytes = maxSizeBytes;
    this.maxItemSizeBytes = maxItemSizeBytes;
    this.currentSizeBytes = 0;
    this.logger = logger;

    // Configure LRU cache
    const cacheOptions: LRUCache.Options<string, CachedContent, unknown> = {
      max: maxEntries,
      dispose: (value) => {
        this.currentSizeBytes -= value.data.length;
        this.logger?.debug("Cache entry evicted", {
          txId: value.txId,
          size: value.data.length,
        });
      },
      noDisposeOnSet: true,
      // Update access time on get
      updateAgeOnGet: true,
    };

    // Only set TTL if specified (0 means no TTL for immutable content)
    if (ttlMs > 0) {
      cacheOptions.ttl = ttlMs;
    }

    this.cache = new LRUCache<string, CachedContent>(cacheOptions);

    this.logger?.info("Content cache initialized", {
      enabled,
      maxSizeBytes,
      maxEntries,
      ttlMs: ttlMs || "infinite (immutable mode)",
      maxItemSizeBytes,
    });
  }

  /**
   * Create cache key from txId and path
   */
  private createKey(txId: string, path: string): string {
    return `${txId}:${path}`;
  }

  /**
   * Calculate eviction score for a cache entry.
   * Lower score = more likely to be evicted.
   *
   * Factors considered:
   * - Recency: Recently accessed items get higher scores
   * - Popularity: Frequently accessed items get higher scores
   * - Size: Larger items get slightly lower scores (prefer evicting big items)
   */
  private evictionScore(entry: CachedContent): number {
    const now = Date.now();
    const ageMs = now - entry.lastAccessed;
    const ageMinutes = ageMs / 60000;

    // Popularity boost: log scale to prevent outliers from dominating
    // accessCount 0 = 0, 1 = 1, 10 = 3.3, 100 = 6.6
    const popularity = Math.log2(entry.accessCount + 1);

    // Recency: decays over time
    // Items accessed 1 minute ago score higher than items accessed 60 minutes ago
    const recency = 100 / (ageMinutes + 1);

    // Size penalty: slightly prefer evicting larger items to free more space
    // Normalized to MB to keep it in reasonable range
    const sizeMB = entry.data.length / (1024 * 1024);
    const sizePenalty = sizeMB * 0.5; // Small penalty per MB

    // Combined score: popularity and recency boost, size penalty
    return popularity * 10 + recency - sizePenalty;
  }

  /**
   * Select the best candidate for eviction based on weighted scoring.
   * Returns the key of the entry with the lowest score.
   */
  private selectEvictionCandidate(): string | null {
    let lowestScore = Infinity;
    let candidateKey: string | null = null;

    for (const [key, entry] of this.cache.entries()) {
      const score = this.evictionScore(entry);
      if (score < lowestScore) {
        lowestScore = score;
        candidateKey = key;
      }
    }

    return candidateKey;
  }

  /**
   * Check if cache is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get cached content
   */
  get(txId: string, path: string = "/"): CachedContent | null {
    if (!this.enabled) return null;

    const key = this.createKey(txId, path);
    const cached = this.cache.get(key);

    if (cached) {
      this.hits++;
      cached.accessCount++;
      cached.lastAccessed = Date.now();
      this.logger?.debug("Content cache hit", {
        txId,
        path,
        size: cached.contentLength,
        accessCount: cached.accessCount,
      });
      return cached;
    }

    this.misses++;
    this.logger?.debug("Content cache miss", { txId, path });
    return null;
  }

  /**
   * Cache verified content
   */
  set(
    txId: string,
    path: string,
    content: Omit<CachedContent, "accessCount" | "lastAccessed">,
  ): boolean {
    if (!this.enabled) return false;

    const contentSize = content.data.length;

    // Skip if single item exceeds max item size
    if (contentSize > this.maxItemSizeBytes) {
      this.logger?.debug("Content too large to cache (exceeds max item size)", {
        txId,
        path,
        size: contentSize,
        maxItemSize: this.maxItemSizeBytes,
      });
      return false;
    }

    // Skip if single item exceeds total cache size
    if (contentSize > this.maxSizeBytes) {
      this.logger?.debug(
        "Content too large to cache (exceeds total cache size)",
        {
          txId,
          path,
          size: contentSize,
          maxSize: this.maxSizeBytes,
        },
      );
      return false;
    }

    // Evict using weighted algorithm until we have space
    // The algorithm considers: recency, popularity, and size
    while (
      this.currentSizeBytes + contentSize > this.maxSizeBytes &&
      this.cache.size > 0
    ) {
      const keyToEvict = this.selectEvictionCandidate();
      if (keyToEvict) {
        this.cache.delete(keyToEvict);
      } else {
        // Fallback to oldest key if scoring fails
        const oldest = this.cache.keys().next().value;
        if (oldest) {
          this.cache.delete(oldest);
        }
      }
    }

    const key = this.createKey(txId, path);
    const now = Date.now();
    const fullContent: CachedContent = {
      ...content,
      accessCount: 0,
      lastAccessed: now,
    };
    this.cache.set(key, fullContent);
    this.currentSizeBytes += contentSize;

    this.logger?.info("Verified content cached", {
      txId,
      path,
      size: contentSize,
      totalCacheSize: this.currentSizeBytes,
      cacheEntries: this.cache.size,
    });

    return true;
  }

  /**
   * Check if content is cached
   */
  has(txId: string, path: string = "/"): boolean {
    if (!this.enabled) return false;
    const key = this.createKey(txId, path);
    return this.cache.has(key);
  }

  /**
   * Invalidate cached content
   */
  invalidate(txId: string, path?: string): void {
    if (path) {
      const key = this.createKey(txId, path);
      this.cache.delete(key);
    } else {
      // Invalidate all entries for this txId
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${txId}:`)) {
          this.cache.delete(key);
        }
      }
    }
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    this.currentSizeBytes = 0;
    this.logger?.info("Content cache cleared");
  }

  /**
   * Get cache statistics
   */
  stats(): {
    enabled: boolean;
    entries: number;
    sizeBytes: number;
    maxSizeBytes: number;
    utilizationPercent: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const totalRequests = this.hits + this.misses;
    return {
      enabled: this.enabled,
      entries: this.cache.size,
      sizeBytes: this.currentSizeBytes,
      maxSizeBytes: this.maxSizeBytes,
      utilizationPercent: (this.currentSizeBytes / this.maxSizeBytes) * 100,
      hits: this.hits,
      misses: this.misses,
      hitRate: totalRequests > 0 ? this.hits / totalRequests : 0,
    };
  }

  /**
   * Convert cached content to Response with appropriate headers
   */
  toResponse(cached: CachedContent): Response {
    const headers = new Headers(cached.headers);

    // IMPORTANT: Remove content-encoding since cached data is decompressed
    // (Node.js fetch() auto-decompresses, so we store decompressed data)
    headers.delete("content-encoding");
    // Ensure content-length matches actual data size
    headers.set("content-length", String(cached.data.length));

    // Add cache indicators
    headers.set("x-wayfinder-cached", "true");
    headers.set("x-wayfinder-verified", "true");
    headers.set(
      "x-wayfinder-cache-age",
      String(Date.now() - cached.verifiedAt),
    );

    // Since content is verified and immutable, allow strong caching
    if (!headers.has("cache-control")) {
      headers.set("cache-control", "public, max-age=31536000, immutable");
    }

    return new Response(cached.data, {
      status: 200,
      headers,
    });
  }

  /**
   * Get Prometheus-style metrics
   */
  getPrometheusMetrics(): string {
    const stats = this.stats();
    const lines: string[] = [];

    lines.push(
      "# HELP wayfinder_content_cache_entries Number of cached content entries",
    );
    lines.push("# TYPE wayfinder_content_cache_entries gauge");
    lines.push(`wayfinder_content_cache_entries ${stats.entries}`);
    lines.push("");

    lines.push(
      "# HELP wayfinder_content_cache_size_bytes Current cache size in bytes",
    );
    lines.push("# TYPE wayfinder_content_cache_size_bytes gauge");
    lines.push(`wayfinder_content_cache_size_bytes ${stats.sizeBytes}`);
    lines.push("");

    lines.push(
      "# HELP wayfinder_content_cache_max_bytes Maximum cache size in bytes",
    );
    lines.push("# TYPE wayfinder_content_cache_max_bytes gauge");
    lines.push(`wayfinder_content_cache_max_bytes ${stats.maxSizeBytes}`);
    lines.push("");

    lines.push("# HELP wayfinder_content_cache_hits_total Total cache hits");
    lines.push("# TYPE wayfinder_content_cache_hits_total counter");
    lines.push(`wayfinder_content_cache_hits_total ${stats.hits}`);
    lines.push("");

    lines.push(
      "# HELP wayfinder_content_cache_misses_total Total cache misses",
    );
    lines.push("# TYPE wayfinder_content_cache_misses_total counter");
    lines.push(`wayfinder_content_cache_misses_total ${stats.misses}`);
    lines.push("");

    return lines.join("\n");
  }
}
