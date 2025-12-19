/**
 * Request Deduplicator
 *
 * Generic utility for deduplicating concurrent async operations.
 * When multiple callers request the same resource simultaneously,
 * only one actual operation is performed and the result is shared.
 *
 * Pattern: If a request is in-flight for a given key, subsequent
 * requests for that key wait for the in-flight request rather than
 * starting a new one.
 */

import type { Logger } from "../types/index.js";

export interface DeduplicatorOptions {
  /** Logger for debug output */
  logger?: Logger;
  /** Name for logging purposes */
  name?: string;
}

export interface DeduplicatorStats {
  /** Number of currently in-flight requests */
  inFlight: number;
  /** Total number of deduplicated requests (requests that reused in-flight) */
  deduplicatedCount: number;
  /** Total number of unique requests (requests that started new operations) */
  uniqueCount: number;
}

/**
 * Generic request deduplicator for async operations
 *
 * @example
 * ```typescript
 * const dedup = new RequestDeduplicator<MyResult>({ name: 'my-service' });
 *
 * // These concurrent calls will only execute fn() once
 * const [result1, result2, result3] = await Promise.all([
 *   dedup.dedupe('key1', () => expensiveOperation()),
 *   dedup.dedupe('key1', () => expensiveOperation()),
 *   dedup.dedupe('key1', () => expensiveOperation()),
 * ]);
 * // result1 === result2 === result3 (same object)
 * ```
 */
export class RequestDeduplicator<T> {
  private inFlight: Map<string, Promise<T>> = new Map();
  private logger?: Logger;
  private name: string;
  private deduplicatedCount: number = 0;
  private uniqueCount: number = 0;

  constructor(options: DeduplicatorOptions = {}) {
    this.logger = options.logger;
    this.name = options.name ?? "deduplicator";
  }

  /**
   * Execute an async operation with deduplication.
   *
   * If an operation with the same key is already in-flight,
   * returns the existing promise instead of starting a new operation.
   *
   * @param key - Unique identifier for this operation
   * @param fn - Async function to execute if no in-flight request exists
   * @returns Promise resolving to the operation result
   */
  async dedupe(key: string, fn: () => Promise<T>): Promise<T> {
    // Check if there's already an in-flight request for this key
    const existing = this.inFlight.get(key);
    if (existing) {
      this.deduplicatedCount++;
      this.logger?.debug(`[${this.name}] Deduplicating request`, {
        key,
        inFlightCount: this.inFlight.size,
      });
      return existing;
    }

    // Start new operation
    this.uniqueCount++;
    this.logger?.debug(`[${this.name}] Starting new request`, {
      key,
      inFlightCount: this.inFlight.size + 1,
    });

    // Create promise and track it
    const promise = fn().finally(() => {
      // Clean up when done (success or failure)
      this.inFlight.delete(key);
      this.logger?.debug(`[${this.name}] Request completed`, {
        key,
        inFlightCount: this.inFlight.size,
      });
    });

    this.inFlight.set(key, promise);
    return promise;
  }

  /**
   * Check if there's an in-flight request for a key
   */
  has(key: string): boolean {
    return this.inFlight.has(key);
  }

  /**
   * Get the number of currently in-flight requests
   */
  get size(): number {
    return this.inFlight.size;
  }

  /**
   * Get deduplicator statistics
   */
  stats(): DeduplicatorStats {
    return {
      inFlight: this.inFlight.size,
      deduplicatedCount: this.deduplicatedCount,
      uniqueCount: this.uniqueCount,
    };
  }

  /**
   * Reset statistics counters
   */
  resetStats(): void {
    this.deduplicatedCount = 0;
    this.uniqueCount = 0;
  }
}
