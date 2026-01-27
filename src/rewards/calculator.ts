/**
 * Gateway Reward Calculator
 *
 * Calculates reward distribution based on telemetry data.
 * Designed to be deterministic and reproducible.
 */

import type {
  RewardConfig,
  GatewayStats,
  GatewayScore,
  RewardPeriod,
  FraudFlag,
} from "./types.js";
import { DEFAULT_REWARD_CONFIG } from "./types.js";

export interface TelemetrySource {
  getGatewayStats(startTime: Date, endTime: Date): Promise<GatewayStats[]>;
  getVerificationGateways(): Promise<string[]>;
}

export interface GatewayRegistry {
  getOperatorAddress(gatewayFqdn: string): Promise<string | undefined>;
  getGatewayInfo(
    fqdn: string,
  ): Promise<{ operatorAddress: string; fqdn: string } | undefined>;
}

export interface RewardCalculatorDeps {
  telemetry: TelemetrySource;
  gatewayRegistry: GatewayRegistry;
  instanceId: string;
}

const CALCULATOR_VERSION = "1.0.0";

export function createRewardCalculator(deps: RewardCalculatorDeps) {
  const { telemetry, gatewayRegistry, instanceId } = deps;

  /**
   * Calculate rewards for a specific time period
   */
  async function calculateRewards(
    startTime: Date,
    endTime: Date,
    config: RewardConfig = DEFAULT_REWARD_CONFIG,
  ): Promise<RewardPeriod> {
    const periodId = generatePeriodId(startTime, endTime);

    // Fetch raw stats from telemetry
    const rawStats = await telemetry.getGatewayStats(startTime, endTime);
    const verificationGateways = await telemetry.getVerificationGateways();

    // Enrich with operator addresses
    const enrichedStats = await enrichWithOperatorInfo(
      rawStats,
      verificationGateways,
    );

    // Calculate scores
    const scores = calculateScores(enrichedStats, config);

    // Calculate network-wide stats
    const networkStats = calculateNetworkStats(enrichedStats, scores);

    return {
      periodId,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      config,
      networkStats,
      gatewayScores: scores,
      status: "calculated",
      calculatedAt: new Date().toISOString(),
      calculatedBy: instanceId,
      version: CALCULATOR_VERSION,
    };
  }

  /**
   * Calculate rewards for yesterday (most common use case)
   */
  async function calculateYesterdayRewards(
    config: RewardConfig = DEFAULT_REWARD_CONFIG,
  ): Promise<RewardPeriod> {
    const now = new Date();
    const endTime = new Date(now);
    endTime.setUTCHours(0, 0, 0, 0); // Start of today = end of yesterday

    const startTime = new Date(endTime);
    startTime.setUTCDate(startTime.getUTCDate() - 1); // Start of yesterday

    return calculateRewards(startTime, endTime, config);
  }

  /**
   * Enrich stats with operator addresses and verification status
   */
  async function enrichWithOperatorInfo(
    stats: GatewayStats[],
    verificationGateways: string[],
  ): Promise<GatewayStats[]> {
    const enriched: GatewayStats[] = [];

    for (const stat of stats) {
      const gatewayInfo = await gatewayRegistry.getGatewayInfo(stat.fqdn);

      enriched.push({
        ...stat,
        operatorAddress: gatewayInfo?.operatorAddress ?? "unknown",
        isVerificationGateway: verificationGateways.some(
          (vg) => vg.includes(stat.fqdn) || stat.gateway.includes(vg),
        ),
      });
    }

    return enriched;
  }

  /**
   * Calculate scores for all gateways
   */
  function calculateScores(
    stats: GatewayStats[],
    config: RewardConfig,
  ): GatewayScore[] {
    // First pass: calculate raw scores and find max values for normalization
    const maxValues = {
      requests: Math.max(...stats.map((s) => s.totalRequests), 1),
      bytes: Math.max(...stats.map((s) => s.totalBytesServed), 1),
      // For latency, lower is better, so we track min
      minLatency: Math.min(...stats.map((s) => s.p95LatencyMs || Infinity), 1),
    };

    // Calculate scores for each gateway
    const rawScores = stats.map((stat) =>
      calculateGatewayScore(stat, config, maxValues),
    );

    // Calculate total score for pool share calculation
    const totalQualifiedScore = rawScores
      .filter((s) => s.qualified)
      .reduce((sum, s) => sum + s.totalScore, 0);

    // Second pass: calculate pool shares and reward amounts
    return rawScores.map((score) => {
      if (!score.qualified || totalQualifiedScore === 0) {
        return {
          ...score,
          poolShare: 0,
          rewardAmount: 0,
        };
      }

      const poolShare = score.totalScore / totalQualifiedScore;
      const rewardAmount =
        Math.floor(poolShare * config.dailyPoolAmount * 1000) / 1000; // 3 decimal precision

      return {
        ...score,
        poolShare,
        rewardAmount,
      };
    });
  }

  /**
   * Calculate score for a single gateway
   */
  function calculateGatewayScore(
    stat: GatewayStats,
    config: RewardConfig,
    maxValues: { requests: number; bytes: number; minLatency: number },
  ): GatewayScore {
    const successRate =
      stat.totalRequests > 0 ? stat.successfulRequests / stat.totalRequests : 0;

    // Check qualification
    let qualified = true;
    let disqualificationReason: string | undefined;

    if (stat.totalRequests < config.minimumRequestsThreshold) {
      qualified = false;
      disqualificationReason = `Below minimum requests threshold (${stat.totalRequests} < ${config.minimumRequestsThreshold})`;
    } else if (successRate < config.minimumSuccessRate) {
      qualified = false;
      disqualificationReason = `Below minimum success rate (${(successRate * 100).toFixed(1)}% < ${config.minimumSuccessRate * 100}%)`;
    }

    // Normalize scores to 0-1 range
    const requestVolumeScore = stat.totalRequests / maxValues.requests;
    const successRateScore = successRate; // Already 0-1
    const latencyScore =
      stat.p95LatencyMs > 0 ? maxValues.minLatency / stat.p95LatencyMs : 0; // Inverted: lower latency = higher score
    const bytesServedScore = stat.totalBytesServed / maxValues.bytes;

    // Apply weights
    const weightedScore =
      requestVolumeScore * config.weights.requestVolume +
      successRateScore * config.weights.successRate +
      Math.min(latencyScore, 1) * config.weights.latencyScore + // Cap at 1
      bytesServedScore * config.weights.bytesServed;

    // Apply verification bonus
    const verificationBonus = stat.isVerificationGateway
      ? config.verificationGatewayBonus
      : 1.0;
    const totalScore = qualified ? weightedScore * verificationBonus : 0;

    return {
      gateway: stat.gateway,
      fqdn: stat.fqdn,
      operatorAddress: stat.operatorAddress,
      stats: stat,
      requestVolumeScore,
      successRateScore,
      latencyScore: Math.min(latencyScore, 1),
      bytesServedScore,
      verificationBonus,
      totalScore,
      poolShare: 0, // Calculated in second pass
      rewardAmount: 0, // Calculated in second pass
      qualified,
      disqualificationReason,
    };
  }

  /**
   * Calculate network-wide statistics
   */
  function calculateNetworkStats(
    stats: GatewayStats[],
    scores: GatewayScore[],
  ): RewardPeriod["networkStats"] {
    const totalRequests = stats.reduce((sum, s) => sum + s.totalRequests, 0);
    const totalBytesServed = stats.reduce(
      (sum, s) => sum + s.totalBytesServed,
      0,
    );
    const totalSuccessful = stats.reduce(
      (sum, s) => sum + s.successfulRequests,
      0,
    );

    const latencies = stats
      .filter((s) => s.avgLatencyMs > 0)
      .map((s) => s.avgLatencyMs);
    const averageLatencyMs =
      latencies.length > 0
        ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length
        : 0;

    return {
      totalRequests,
      totalBytesServed,
      totalGateways: stats.length,
      qualifiedGateways: scores.filter((s) => s.qualified).length,
      averageLatencyMs: Math.round(averageLatencyMs),
      averageSuccessRate:
        totalRequests > 0 ? totalSuccessful / totalRequests : 0,
    };
  }

  /**
   * Check for potential fraud patterns
   */
  function detectFraudPatterns(
    currentPeriod: RewardPeriod,
    historicalPeriods: RewardPeriod[],
  ): FraudFlag[] {
    const flags: FraudFlag[] = [];

    for (const score of currentPeriod.gatewayScores) {
      // Get historical data for this gateway
      const historicalScores = historicalPeriods
        .flatMap((p) => p.gatewayScores)
        .filter((s) => s.gateway === score.gateway);

      if (historicalScores.length < 3) {
        // Not enough history to detect anomalies
        continue;
      }

      // Calculate historical average
      const avgRequests =
        historicalScores.reduce((sum, s) => sum + s.stats.totalRequests, 0) /
        historicalScores.length;

      // Flag 1: Suspicious volume spike (>3x historical average)
      if (score.stats.totalRequests > avgRequests * 3) {
        flags.push({
          periodId: currentPeriod.periodId,
          gateway: score.gateway,
          flagType: "suspicious_volume_spike",
          description: `Request volume ${score.stats.totalRequests} is ${(score.stats.totalRequests / avgRequests).toFixed(1)}x the historical average of ${Math.round(avgRequests)}`,
          evidence: {
            currentRequests: score.stats.totalRequests,
            historicalAverage: avgRequests,
            multiplier: score.stats.totalRequests / avgRequests,
          },
          flaggedAt: new Date().toISOString(),
          flaggedBy: instanceId,
        });
      }

      // Flag 2: Latency too good to be true (if suddenly way faster)
      const avgLatency =
        historicalScores.reduce((sum, s) => sum + s.stats.p95LatencyMs, 0) /
        historicalScores.length;
      if (score.stats.p95LatencyMs < avgLatency * 0.3 && avgLatency > 100) {
        flags.push({
          periodId: currentPeriod.periodId,
          gateway: score.gateway,
          flagType: "latency_manipulation",
          description: `P95 latency ${score.stats.p95LatencyMs}ms is suspiciously lower than historical average of ${Math.round(avgLatency)}ms`,
          evidence: {
            currentLatency: score.stats.p95LatencyMs,
            historicalAverage: avgLatency,
            ratio: score.stats.p95LatencyMs / avgLatency,
          },
          flaggedAt: new Date().toISOString(),
          flaggedBy: instanceId,
        });
      }
    }

    return flags;
  }

  /**
   * Generate a deterministic period ID
   */
  function generatePeriodId(startTime: Date, endTime: Date): string {
    const start = startTime.toISOString().split("T")[0];
    const end = endTime.toISOString().split("T")[0];
    return `${start}_${end}`;
  }

  /**
   * Format reward period for public publishing
   */
  function formatForPublishing(period: RewardPeriod): string {
    // Create a clean, readable format
    const output = {
      periodId: period.periodId,
      period: {
        start: period.startTime,
        end: period.endTime,
      },
      pool: {
        totalAmount: period.config.dailyPoolAmount,
        distributed: period.gatewayScores.reduce(
          (sum, s) => sum + s.rewardAmount,
          0,
        ),
        qualifiedGateways: period.networkStats.qualifiedGateways,
      },
      configuration: {
        minimumRequests: period.config.minimumRequestsThreshold,
        minimumSuccessRate: `${period.config.minimumSuccessRate * 100}%`,
        verificationBonus: `${(period.config.verificationGatewayBonus - 1) * 100}%`,
        weights: period.config.weights,
      },
      networkStats: {
        totalRequests: period.networkStats.totalRequests,
        totalBytesServed: formatBytes(period.networkStats.totalBytesServed),
        averageSuccessRate: `${(period.networkStats.averageSuccessRate * 100).toFixed(2)}%`,
        averageLatencyMs: period.networkStats.averageLatencyMs,
      },
      rewards: period.gatewayScores
        .filter((s) => s.qualified)
        .sort((a, b) => b.rewardAmount - a.rewardAmount)
        .map((s) => ({
          gateway: s.fqdn,
          operatorAddress: s.operatorAddress,
          reward: s.rewardAmount,
          poolShare: `${(s.poolShare * 100).toFixed(2)}%`,
          metrics: {
            requests: s.stats.totalRequests,
            successRate: `${(s.successRateScore * 100).toFixed(2)}%`,
            p95LatencyMs: s.stats.p95LatencyMs,
            bytesServed: formatBytes(s.stats.totalBytesServed),
            isVerificationGateway: s.stats.isVerificationGateway,
          },
          scores: {
            volume: s.requestVolumeScore.toFixed(4),
            reliability: s.successRateScore.toFixed(4),
            speed: s.latencyScore.toFixed(4),
            bandwidth: s.bytesServedScore.toFixed(4),
            verificationBonus: s.verificationBonus.toFixed(2),
            total: s.totalScore.toFixed(4),
          },
        })),
      disqualified: period.gatewayScores
        .filter((s) => !s.qualified)
        .map((s) => ({
          gateway: s.fqdn,
          reason: s.disqualificationReason,
          requests: s.stats.totalRequests,
          successRate: `${(s.successRateScore * 100).toFixed(2)}%`,
        })),
      metadata: {
        calculatedAt: period.calculatedAt,
        calculatedBy: period.calculatedBy,
        calculatorVersion: period.version,
        status: period.status,
      },
    };

    return JSON.stringify(output, null, 2);
  }

  return {
    calculateRewards,
    calculateYesterdayRewards,
    detectFraudPatterns,
    formatForPublishing,
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
