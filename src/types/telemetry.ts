/**
 * Telemetry Types
 * Types for gateway tracking, metrics, and reward data export
 */

// Request outcome types
export type RequestOutcome =
  | "success"
  | "client_error"
  | "server_error"
  | "timeout"
  | "connection_error";
export type VerificationOutcome = "verified" | "failed" | "skipped" | "error";
export type ConsensusOutcome =
  | "agreed"
  | "disagreed"
  | "insufficient"
  | "error";

/**
 * Individual telemetry event for a gateway request
 */
export interface GatewayRequestEvent {
  // Request identification
  traceId: string;
  timestamp: number;

  // Gateway info
  gateway: string;

  // Request details
  requestType: "arns" | "txid" | "arweave-api";
  identifier: string; // ArNS name, txId, or Arweave API endpoint
  path: string;
  mode: "proxy" | "route";

  // Outcome
  outcome: RequestOutcome;
  httpStatus?: number;

  // Verification (proxy mode only)
  verification?: {
    outcome: VerificationOutcome;
    durationMs?: number;
    contentTxId?: string; // The actual content txId (may differ from identifier for manifests)
  };

  // Consensus (ArNS resolution)
  consensus?: {
    outcome: ConsensusOutcome;
    participatingGateways: string[];
    agreementCount: number;
  };

  // Performance
  latency: {
    totalMs: number;
    ttfbMs?: number; // Time to first byte
    connectionMs?: number;
  };

  // Bandwidth
  bytesReceived?: number;
  bytesSent?: number;
}

/**
 * Aggregated stats for a gateway within a time bucket
 */
export interface GatewayHourlyStats {
  gateway: string;
  hourBucket: string; // ISO 8601 hour, e.g., "2024-12-17T15:00:00Z"

  // Request counts
  totalRequests: number;
  successfulRequests: number;
  clientErrors: number;
  serverErrors: number;
  timeouts: number;
  connectionErrors: number;

  // Verification counts
  verificationAttempts: number;
  verificationSuccess: number;
  verificationFailed: number;
  verificationSkipped: number;

  // Consensus participation (for ArNS resolution)
  consensusParticipations: number;
  consensusAgreements: number;
  consensusDisagreements: number;

  // Latency (stored as histogram buckets for p50/p95/p99 calculation)
  latencySum: number;
  latencyCount: number;
  latencyBuckets: Record<string, number>; // bucket_ms -> count

  // Bandwidth
  bytesServed: number;

  // Computed at query time, not stored
  _computed?: {
    successRate: number;
    verificationRate: number;
    consensusAgreementRate: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
  };
}

/**
 * Gateway stats summary for a time range
 */
export interface GatewayStatsSummary {
  gateway: string;
  period: {
    start: string; // ISO 8601
    end: string;
  };

  // Volume metrics
  totalRequests: number;
  successfulRequests: number;
  bytesServed: number;

  // Quality metrics
  successRate: number; // 0-1
  verificationSuccessRate: number; // 0-1
  consensusAgreementRate: number; // 0-1
  errorRate: number; // 0-1

  // Performance metrics
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;

  // Reliability
  hoursActive: number;
  hoursMissing: number;
  availabilityRate: number; // 0-1
}

/**
 * Export format for reward distribution systems
 */
export interface GatewayRewardExport {
  exportedAt: string; // ISO 8601
  period: {
    start: string;
    end: string;
  };
  routerInfo: {
    routerId: string;
    version: string;
    baseDomain: string;
  };
  gateways: GatewayStatsSummary[];
  totals: {
    totalRequests: number;
    totalBytesServed: number;
    totalGateways: number;
    activeGateways: number;
  };
}

/**
 * Telemetry configuration
 */
export interface TelemetryConfig {
  enabled: boolean;

  // Sampling rates (0-1)
  sampling: {
    successfulRequests: number; // e.g., 0.1 = 10% of successful requests
    errors: number; // e.g., 1.0 = 100% of errors always logged
    latencyMeasurements: number;
  };

  // Storage
  storage: {
    type: "sqlite";
    path: string;
    retentionDays: number;
  };

  // Router identification
  routerId?: string; // For multi-router deployments

  // Export settings
  export: {
    enabled: boolean;
    intervalHours: number; // How often to export
    path?: string; // File path for JSON export
  };
}

/**
 * Latency histogram bucket boundaries (in ms)
 */
export const LATENCY_BUCKETS = [
  10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000,
];

/**
 * Get the bucket for a latency value
 */
export function getLatencyBucket(latencyMs: number): string {
  for (const bucket of LATENCY_BUCKETS) {
    if (latencyMs <= bucket) {
      return `le_${bucket}`;
    }
  }
  return "le_inf";
}

/**
 * Calculate percentile from histogram buckets
 */
export function calculatePercentile(
  buckets: Record<string, number>,
  totalCount: number,
  percentile: number,
): number {
  if (totalCount === 0) return 0;

  const targetCount = totalCount * (percentile / 100);
  let cumulativeCount = 0;

  for (const bucket of LATENCY_BUCKETS) {
    const bucketKey = `le_${bucket}`;
    cumulativeCount += buckets[bucketKey] || 0;
    if (cumulativeCount >= targetCount) {
      return bucket;
    }
  }

  return LATENCY_BUCKETS[LATENCY_BUCKETS.length - 1];
}

/**
 * Get current hour bucket string
 */
export function getCurrentHourBucket(): string {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return now.toISOString();
}

/**
 * Get hour bucket for a timestamp
 */
export function getHourBucket(timestamp: number): string {
  const date = new Date(timestamp);
  date.setMinutes(0, 0, 0);
  return date.toISOString();
}
