/**
 * Shutdown Manager
 * Orchestrates graceful shutdown with request draining
 */

import type { Logger } from "../types/index.js";
import { RequestTracker } from "./request-tracker.js";

/**
 * Server interface that can be closed
 * Compatible with Bun.serve() (stop) and Node http.Server (close)
 */
interface CloseableServer {
  stop?(): void;
  close?(callback?: (err?: Error) => void): void;
}

export interface ShutdownManagerOptions {
  /** HTTP server to close */
  server: CloseableServer;
  /** Request tracker for draining */
  requestTracker: RequestTracker;
  /** Logger instance */
  logger: Logger;
  /** Grace period for requests to drain (ms) */
  drainTimeoutMs: number;
  /** Total shutdown timeout before force exit (ms) */
  shutdownTimeoutMs: number;
  /** Callback to stop background services before server close */
  onBeforeServerClose?: () => Promise<void> | void;
}

export interface ShutdownStats {
  drainedRequests: number;
  drainTimeMs: number;
  forcedShutdown: boolean;
}

/**
 * Manages graceful shutdown process:
 * 1. Stop accepting new connections
 * 2. Wait for in-flight requests to complete (with timeout)
 * 3. Stop background services
 * 4. Close server
 * 5. Exit process
 */
export class ShutdownManager {
  private server: CloseableServer;
  private requestTracker: RequestTracker;
  private logger: Logger;
  private drainTimeoutMs: number;
  private shutdownTimeoutMs: number;
  private onBeforeServerClose?: () => Promise<void> | void;
  private isShuttingDown: boolean = false;

  constructor(options: ShutdownManagerOptions) {
    this.server = options.server;
    this.requestTracker = options.requestTracker;
    this.logger = options.logger;
    this.drainTimeoutMs = options.drainTimeoutMs;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs;
    this.onBeforeServerClose = options.onBeforeServerClose;
  }

  /**
   * Initiate graceful shutdown.
   * Returns stats about the shutdown process.
   */
  async shutdown(signal: string): Promise<ShutdownStats> {
    if (this.isShuttingDown) {
      this.logger.warn("Shutdown already in progress", { signal });
      return { drainedRequests: 0, drainTimeMs: 0, forcedShutdown: false };
    }

    this.isShuttingDown = true;
    const startTime = Date.now();
    let forcedShutdown = false;

    this.logger.info("Graceful shutdown initiated", {
      signal,
      inFlightRequests: this.requestTracker.getCount(),
      drainTimeoutMs: this.drainTimeoutMs,
      shutdownTimeoutMs: this.shutdownTimeoutMs,
    });

    // Set up force exit timer
    const forceExitTimer = setTimeout(() => {
      this.logger.error("Forced shutdown after timeout", {
        shutdownTimeoutMs: this.shutdownTimeoutMs,
        remainingRequests: this.requestTracker.getCount(),
      });
      process.exit(1);
    }, this.shutdownTimeoutMs);

    try {
      // Step 1: Stop accepting new connections and start draining
      const initialCount = this.requestTracker.getCount();
      const drainPromise = this.requestTracker.startDraining();

      // Step 2: Wait for requests to drain (with timeout)
      const drainStartTime = Date.now();
      const drainResult = await Promise.race([
        drainPromise.then(() => "drained" as const),
        this.delay(this.drainTimeoutMs).then(() => "timeout" as const),
      ]);

      const drainTimeMs = Date.now() - drainStartTime;
      const remainingRequests = this.requestTracker.getCount();

      if (drainResult === "timeout" && remainingRequests > 0) {
        this.logger.warn("Drain timeout reached, proceeding with shutdown", {
          drainTimeMs,
          remainingRequests,
        });
        forcedShutdown = true;
      } else {
        this.logger.info("Request drain completed", {
          drainTimeMs,
          drainedRequests: initialCount - remainingRequests,
        });
      }

      // Step 3: Stop background services
      if (this.onBeforeServerClose) {
        this.logger.info("Stopping background services");
        await this.onBeforeServerClose();
      }

      // Step 4: Close the server
      await this.closeServer();

      // Clear force exit timer
      clearTimeout(forceExitTimer);

      const totalTimeMs = Date.now() - startTime;
      this.logger.info("Graceful shutdown completed", {
        totalTimeMs,
        drainTimeMs,
        forcedShutdown,
      });

      return {
        drainedRequests: initialCount - remainingRequests,
        drainTimeMs,
        forcedShutdown,
      };
    } catch (error) {
      clearTimeout(forceExitTimer);
      this.logger.error("Error during shutdown", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Close the HTTP server.
   * Supports both Bun.serve() (stop) and Node http.Server (close).
   */
  private closeServer(): Promise<void> {
    if (this.server.stop) {
      this.server.stop();
      this.logger.info("Server closed");
      return Promise.resolve();
    }

    if (this.server.close) {
      return new Promise((resolve, reject) => {
        this.server.close!((err) => {
          if (err) {
            this.logger.error("Error closing server", {
              error: err.message,
            });
            reject(err);
          } else {
            this.logger.info("Server closed");
            resolve();
          }
        });
      });
    }

    this.logger.warn("Server has no stop or close method");
    return Promise.resolve();
  }

  /**
   * Helper to delay execution.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a shutdown manager and register signal handlers.
 */
export function createShutdownManager(
  options: ShutdownManagerOptions,
): ShutdownManager {
  const manager = new ShutdownManager(options);

  // Register signal handlers
  const handleSignal = async (signal: string) => {
    try {
      await manager.shutdown(signal);
      process.exit(0);
    } catch {
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => handleSignal("SIGTERM"));
  process.on("SIGINT", () => handleSignal("SIGINT"));

  return manager;
}
