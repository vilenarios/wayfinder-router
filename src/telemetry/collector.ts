/**
 * Telemetry Collector
 * Collects gateway request events with configurable sampling
 */

import type { Logger } from "../types/index.js";
import type {
  GatewayRequestEvent,
  TelemetryConfig,
  RequestOutcome,
  VerificationOutcome,
} from "../types/telemetry.js";

export interface TelemetryCollectorOptions {
  config: TelemetryConfig;
  logger: Logger;
  onEvent: (event: GatewayRequestEvent) => void;
}

export class TelemetryCollector {
  private config: TelemetryConfig;
  private logger: Logger;
  private onEvent: (event: GatewayRequestEvent) => void;
  private eventBuffer: GatewayRequestEvent[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(options: TelemetryCollectorOptions) {
    this.config = options.config;
    this.logger = options.logger;
    this.onEvent = options.onEvent;

    // Start periodic flush
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  /**
   * Check if we should sample this event based on outcome
   */
  private shouldSample(outcome: RequestOutcome): boolean {
    if (!this.config.enabled) return false;

    // Always sample errors
    if (outcome !== "success") {
      return Math.random() < this.config.sampling.errors;
    }

    // Sample successful requests at configured rate
    return Math.random() < this.config.sampling.successfulRequests;
  }

  /**
   * Record a gateway request event
   */
  record(event: GatewayRequestEvent): void {
    if (!this.shouldSample(event.outcome)) {
      return;
    }

    this.eventBuffer.push(event);

    // Flush if buffer is large
    if (this.eventBuffer.length >= 100) {
      this.flush();
    }
  }

  /**
   * Create a request tracker for building events incrementally
   */
  createTracker(params: {
    traceId: string;
    gateway: string;
    requestType: "arns" | "txid";
    identifier: string;
    path: string;
    mode: "proxy" | "route";
  }): RequestTracker {
    return new RequestTracker(params, this);
  }

  /**
   * Flush buffered events to storage
   */
  flush(): void {
    if (this.eventBuffer.length === 0) return;

    const events = this.eventBuffer;
    this.eventBuffer = [];

    for (const event of events) {
      try {
        this.onEvent(event);
      } catch (error) {
        this.logger.error("Failed to process telemetry event", {
          error: error instanceof Error ? error.message : String(error),
          traceId: event.traceId,
        });
      }
    }

    this.logger.debug("Flushed telemetry events", { count: events.length });
  }

  /**
   * Stop the collector
   */
  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush();
  }
}

/**
 * Request tracker for building telemetry events incrementally
 */
export class RequestTracker {
  private event: Partial<GatewayRequestEvent>;
  private startTime: number;
  private ttfbTime?: number;
  private collector: TelemetryCollector;

  constructor(
    params: {
      traceId: string;
      gateway: string;
      requestType: "arns" | "txid";
      identifier: string;
      path: string;
      mode: "proxy" | "route";
    },
    collector: TelemetryCollector,
  ) {
    this.collector = collector;
    this.startTime = Date.now();
    this.event = {
      traceId: params.traceId,
      timestamp: this.startTime,
      gateway: params.gateway,
      requestType: params.requestType,
      identifier: params.identifier,
      path: params.path,
      mode: params.mode,
    };
  }

  /**
   * Record time to first byte
   */
  recordTTFB(): void {
    this.ttfbTime = Date.now();
  }

  /**
   * Record verification result
   */
  recordVerification(outcome: VerificationOutcome, durationMs?: number): void {
    this.event.verification = {
      outcome,
      durationMs,
    };
  }

  /**
   * Record consensus participation
   */
  recordConsensus(params: {
    outcome: "agreed" | "disagreed" | "insufficient" | "error";
    participatingGateways: string[];
    agreementCount: number;
  }): void {
    this.event.consensus = params;
  }

  /**
   * Record bytes transferred
   */
  recordBytes(received?: number, sent?: number): void {
    if (received !== undefined) this.event.bytesReceived = received;
    if (sent !== undefined) this.event.bytesSent = sent;
  }

  /**
   * Complete the request tracking with final outcome
   */
  complete(outcome: RequestOutcome, httpStatus?: number): void {
    const endTime = Date.now();

    this.event.outcome = outcome;
    this.event.httpStatus = httpStatus;
    this.event.latency = {
      totalMs: endTime - this.startTime,
      ttfbMs: this.ttfbTime ? this.ttfbTime - this.startTime : undefined,
    };

    this.collector.record(this.event as GatewayRequestEvent);
  }

  /**
   * Complete with error
   */
  completeWithError(
    outcome: "timeout" | "connection_error" | "server_error",
    _error?: Error,
  ): void {
    this.complete(outcome);
  }
}
