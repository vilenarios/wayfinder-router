/**
 * Gateway Rewards System Types
 *
 * Off-chain reward calculation and distribution for gateways
 * that serve traffic through Wayfinder Router.
 */

export interface RewardConfig {
  // Fixed daily pool of ARIO tokens to distribute
  dailyPoolAmount: number;

  // Minimum requests to qualify for rewards
  minimumRequestsThreshold: number;

  // Minimum success rate to qualify (0-1)
  minimumSuccessRate: number;

  // Bonus multiplier for verification gateways (e.g., 1.2 = 20% bonus)
  verificationGatewayBonus: number;

  // Weight factors for scoring (should sum to 1.0 for clarity)
  weights: {
    requestVolume: number; // Weight for number of requests served
    successRate: number; // Weight for reliability
    latencyScore: number; // Weight for speed
    bytesServed: number; // Weight for bandwidth contribution
  };

  // Delay period in days before distribution (for fraud review)
  distributionDelayDays: number;

  // Operator wallet that distributes rewards
  distributorWallet?: string;
}

export interface GatewayStats {
  gateway: string;
  fqdn: string;
  operatorAddress: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  totalBytesServed: number;
  verificationRequests: number;
  verificationSuccesses: number;
  isVerificationGateway: boolean;
}

export interface GatewayScore {
  gateway: string;
  fqdn: string;
  operatorAddress: string;

  // Raw metrics
  stats: GatewayStats;

  // Calculated components (0-1 normalized)
  requestVolumeScore: number;
  successRateScore: number;
  latencyScore: number;
  bytesServedScore: number;

  // Bonuses applied
  verificationBonus: number;

  // Final weighted score
  totalScore: number;

  // Share of the pool (0-1)
  poolShare: number;

  // Reward amount in ARIO
  rewardAmount: number;

  // Qualification status
  qualified: boolean;
  disqualificationReason?: string;
}

export interface RewardPeriod {
  // Unique identifier for this period
  periodId: string;

  // Time range
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601

  // Configuration used for this calculation
  config: RewardConfig;

  // Network-wide stats for context
  networkStats: {
    totalRequests: number;
    totalBytesServed: number;
    totalGateways: number;
    qualifiedGateways: number;
    averageLatencyMs: number;
    averageSuccessRate: number;
  };

  // Per-gateway scores and rewards
  gatewayScores: GatewayScore[];

  // Distribution status
  status:
    | "calculated"
    | "pending_review"
    | "approved"
    | "distributed"
    | "rejected";

  // Distribution details (filled after distribution)
  distribution?: {
    distributedAt: string;
    transactionIds: Array<{
      gateway: string;
      operatorTxId?: string;
      delegateTxIds?: string[];
    }>;
    totalDistributed: number;
  };

  // Metadata
  calculatedAt: string;
  calculatedBy: string; // Wayfinder instance identifier
  version: string; // Calculator version for reproducibility
}

export interface DelegationInfo {
  operatorAddress: string;
  delegateRewardShareRatio: number; // 0-100, percentage to delegates
  delegates: Array<{
    address: string;
    stake: number;
    shareOfDelegatedStake: number; // Proportion of this delegate's stake
  }>;
}

export interface RewardDistribution {
  periodId: string;
  gateway: string;
  totalReward: number;

  // Split between operator and delegates
  operatorReward: number;
  operatorAddress: string;

  delegateRewards: Array<{
    address: string;
    reward: number;
    stake: number;
  }>;
}

export interface FraudFlag {
  periodId: string;
  gateway: string;
  flagType:
    | "suspicious_volume_spike"
    | "self_routing_suspected"
    | "sybil_suspected"
    | "latency_manipulation"
    | "other";
  description: string;
  evidence: Record<string, unknown>;
  flaggedAt: string;
  flaggedBy: string;
  resolution?: {
    resolvedAt: string;
    outcome: "cleared" | "confirmed_fraud" | "reduced_reward";
    notes: string;
  };
}

// Default configuration - conservative starting point
export const DEFAULT_REWARD_CONFIG: RewardConfig = {
  dailyPoolAmount: 1000, // 1000 ARIO per day - adjust based on your allocation
  minimumRequestsThreshold: 100, // Must serve at least 100 requests
  minimumSuccessRate: 0.9, // Must have 90%+ success rate
  verificationGatewayBonus: 1.15, // 15% bonus for verification gateways
  weights: {
    requestVolume: 0.4, // 40% weight on volume
    successRate: 0.25, // 25% weight on reliability
    latencyScore: 0.2, // 20% weight on speed
    bytesServed: 0.15, // 15% weight on bandwidth
  },
  distributionDelayDays: 3, // 3 day review period
};
