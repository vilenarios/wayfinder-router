/**
 * Request Tracker
 * Tracks in-flight requests for graceful shutdown
 */

import type { Logger } from "../types/index.js";

export interface RequestTrackerOptions {
  logger?: Logger;
}

/**
 * Atomic counter for tracking in-flight requests.
 * Used to implement graceful shutdown with request draining.
 */
export class RequestTracker {
  private count: number = 0;
  private draining: boolean = false;
  private drainPromise: Promise<void> | null = null;
  private drainResolve: (() => void) | null = null;
  private logger?: Logger;

  constructor(options: RequestTrackerOptions = {}) {
    this.logger = options.logger;
  }

  /**
   * Increment the in-flight request count.
   * Returns false if we're draining (new requests should be rejected).
   */
  increment(): boolean {
    if (this.draining) {
      return false;
    }
    this.count++;
    this.logger?.debug("Request started", { inFlight: this.count });
    return true;
  }

  /**
   * Decrement the in-flight request count.
   * If draining and count reaches 0, resolves the drain promise.
   */
  decrement(): void {
    if (this.count > 0) {
      this.count--;
      this.logger?.debug("Request completed", { inFlight: this.count });

      // If we're draining and all requests are done, resolve
      if (this.draining && this.count === 0 && this.drainResolve) {
        this.logger?.info("All in-flight requests drained");
        this.drainResolve();
        this.drainResolve = null;
      }
    }
  }

  /**
   * Get the current number of in-flight requests.
   */
  getCount(): number {
    return this.count;
  }

  /**
   * Check if we're currently draining.
   */
  isDraining(): boolean {
    return this.draining;
  }

  /**
   * Start draining - new requests will be rejected.
   * Returns a promise that resolves when all in-flight requests complete.
   */
  startDraining(): Promise<void> {
    if (this.drainPromise) {
      return this.drainPromise;
    }

    this.draining = true;
    this.logger?.info("Starting request drain", { inFlight: this.count });

    if (this.count === 0) {
      // No requests to drain
      this.drainPromise = Promise.resolve();
      return this.drainPromise;
    }

    this.drainPromise = new Promise<void>((resolve) => {
      this.drainResolve = resolve;
    });

    return this.drainPromise;
  }

  /**
   * Reset the tracker (mainly for testing).
   */
  reset(): void {
    this.count = 0;
    this.draining = false;
    this.drainPromise = null;
    this.drainResolve = null;
  }
}

// Singleton instance for global request tracking
let globalTracker: RequestTracker | null = null;

/**
 * Get or create the global request tracker.
 */
export function getRequestTracker(
  options?: RequestTrackerOptions,
): RequestTracker {
  if (!globalTracker) {
    globalTracker = new RequestTracker(options);
  }
  return globalTracker;
}

/**
 * Reset the global request tracker (mainly for testing).
 */
export function resetRequestTracker(): void {
  globalTracker?.reset();
  globalTracker = null;
}
