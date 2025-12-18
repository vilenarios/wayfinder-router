/**
 * Manifest Cache
 * LRU cache for verified Arweave manifests
 */

import type { Logger } from '../types/index.js';
import type { VerifiedManifest } from '../types/manifest.js';

export interface ManifestCacheOptions {
  /** Maximum number of manifests to cache */
  maxSize: number;
  /** Logger instance */
  logger: Logger;
}

interface CacheEntry {
  manifest: VerifiedManifest;
  lastAccessed: number;
}

/**
 * LRU cache for verified manifests
 * Manifests are immutable on Arweave, so no TTL needed
 */
export class ManifestCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private logger: Logger;

  // Stats
  private hits = 0;
  private misses = 0;

  constructor(options: ManifestCacheOptions) {
    this.maxSize = options.maxSize;
    this.logger = options.logger;

    this.logger.debug('ManifestCache initialized', {
      maxSize: this.maxSize,
    });
  }

  /**
   * Get a manifest from cache
   */
  get(txId: string): VerifiedManifest | null {
    const entry = this.cache.get(txId);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Update last accessed time for LRU
    entry.lastAccessed = Date.now();
    this.hits++;

    this.logger.debug('Manifest cache hit', { txId });
    return entry.manifest;
  }

  /**
   * Store a verified manifest in cache
   */
  set(manifest: VerifiedManifest): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(manifest.txId)) {
      this.evictLRU();
    }

    this.cache.set(manifest.txId, {
      manifest,
      lastAccessed: Date.now(),
    });

    this.logger.debug('Manifest cached', {
      txId: manifest.txId,
      pathCount: Object.keys(manifest.manifest.paths).length,
      sizeBytes: manifest.sizeBytes,
    });
  }

  /**
   * Check if manifest is in cache
   */
  has(txId: string): boolean {
    return this.cache.has(txId);
  }

  /**
   * Remove a manifest from cache
   */
  delete(txId: string): boolean {
    return this.cache.delete(txId);
  }

  /**
   * Clear all cached manifests
   */
  clear(): void {
    this.cache.clear();
    this.logger.info('Manifest cache cleared');
  }

  /**
   * Get cache statistics
   */
  stats(): {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.logger.debug('Manifest evicted from cache (LRU)', {
        txId: oldestKey,
      });
    }
  }

  /**
   * Get Prometheus metrics
   */
  getPrometheusMetrics(): string {
    const stats = this.stats();
    return [
      '# HELP wayfinder_manifest_cache_size Number of cached manifests',
      '# TYPE wayfinder_manifest_cache_size gauge',
      `wayfinder_manifest_cache_size ${stats.size}`,
      '',
      '# HELP wayfinder_manifest_cache_hits_total Manifest cache hits',
      '# TYPE wayfinder_manifest_cache_hits_total counter',
      `wayfinder_manifest_cache_hits_total ${stats.hits}`,
      '',
      '# HELP wayfinder_manifest_cache_misses_total Manifest cache misses',
      '# TYPE wayfinder_manifest_cache_misses_total counter',
      `wayfinder_manifest_cache_misses_total ${stats.misses}`,
      '',
    ].join('\n');
  }
}
