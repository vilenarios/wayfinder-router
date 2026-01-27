/**
 * Gateway Reward Distributor
 *
 * Handles the distribution of rewards to gateway operators and their delegates.
 * Designed to work with ar.io SDK for token transfers.
 */

import type {
  RewardPeriod,
  RewardDistribution,
  DelegationInfo,
  GatewayScore,
} from "./types.js";

export interface TokenTransferService {
  transfer(to: string, amount: number): Promise<{ txId: string }>;
  getBalance(): Promise<number>;
}

export interface DelegationSource {
  getDelegationInfo(operatorAddress: string): Promise<DelegationInfo | undefined>;
}

export interface RewardStorage {
  savePeriod(period: RewardPeriod): Promise<void>;
  loadPeriod(periodId: string): Promise<RewardPeriod | undefined>;
  listPeriods(status?: RewardPeriod["status"]): Promise<RewardPeriod[]>;
  updatePeriodStatus(
    periodId: string,
    status: RewardPeriod["status"],
    distribution?: RewardPeriod["distribution"]
  ): Promise<void>;
}

export interface DistributorDeps {
  tokenService: TokenTransferService;
  delegationSource: DelegationSource;
  storage: RewardStorage;
}

export function createRewardDistributor(deps: DistributorDeps) {
  const { tokenService, delegationSource, storage } = deps;

  /**
   * Calculate how rewards should be split for a gateway
   * Respects the gateway's delegation settings
   */
  async function calculateDistribution(
    score: GatewayScore
  ): Promise<RewardDistribution> {
    const delegationInfo = await delegationSource.getDelegationInfo(
      score.operatorAddress
    );

    // If no delegation info or no delegates, all goes to operator
    if (!delegationInfo || delegationInfo.delegates.length === 0) {
      return {
        periodId: "", // Filled by caller
        gateway: score.gateway,
        totalReward: score.rewardAmount,
        operatorReward: score.rewardAmount,
        operatorAddress: score.operatorAddress,
        delegateRewards: [],
      };
    }

    // Calculate delegate share based on gateway's delegation settings
    const delegateShareRatio = delegationInfo.delegateRewardShareRatio / 100;
    const totalDelegateReward = score.rewardAmount * delegateShareRatio;
    const operatorReward = score.rewardAmount - totalDelegateReward;

    // Distribute among delegates proportional to their stake
    const delegateRewards = delegationInfo.delegates.map((delegate) => ({
      address: delegate.address,
      reward:
        Math.floor(totalDelegateReward * delegate.shareOfDelegatedStake * 1000) / 1000,
      stake: delegate.stake,
    }));

    // Handle rounding - give remainder to operator
    const distributedToDelegates = delegateRewards.reduce((sum, d) => sum + d.reward, 0);
    const adjustedOperatorReward =
      Math.floor((operatorReward + (totalDelegateReward - distributedToDelegates)) * 1000) /
      1000;

    return {
      periodId: "",
      gateway: score.gateway,
      totalReward: score.rewardAmount,
      operatorReward: adjustedOperatorReward,
      operatorAddress: score.operatorAddress,
      delegateRewards,
    };
  }

  /**
   * Preview distribution for a period (without executing)
   */
  async function previewDistribution(period: RewardPeriod): Promise<RewardDistribution[]> {
    const distributions: RewardDistribution[] = [];

    for (const score of period.gatewayScores.filter((s) => s.qualified)) {
      const distribution = await calculateDistribution(score);
      distribution.periodId = period.periodId;
      distributions.push(distribution);
    }

    return distributions;
  }

  /**
   * Execute distribution for an approved period
   */
  async function executeDistribution(
    periodId: string,
    dryRun: boolean = false
  ): Promise<{
    success: boolean;
    distributions: RewardDistribution[];
    transactions: Array<{ address: string; amount: number; txId?: string; error?: string }>;
    totalDistributed: number;
  }> {
    const period = await storage.loadPeriod(periodId);
    if (!period) {
      throw new Error(`Period ${periodId} not found`);
    }

    if (period.status !== "approved" && !dryRun) {
      throw new Error(
        `Period ${periodId} is not approved for distribution (status: ${period.status})`
      );
    }

    // Calculate all distributions
    const distributions = await previewDistribution(period);

    // Calculate total needed
    const totalNeeded = distributions.reduce((sum, d) => sum + d.totalReward, 0);

    // Check balance if not dry run
    if (!dryRun) {
      const balance = await tokenService.getBalance();
      if (balance < totalNeeded) {
        throw new Error(
          `Insufficient balance: need ${totalNeeded} ARIO, have ${balance} ARIO`
        );
      }
    }

    // Execute transfers
    const transactions: Array<{
      address: string;
      amount: number;
      txId?: string;
      error?: string;
    }> = [];
    let totalDistributed = 0;

    for (const distribution of distributions) {
      // Transfer to operator
      if (distribution.operatorReward > 0) {
        if (dryRun) {
          transactions.push({
            address: distribution.operatorAddress,
            amount: distribution.operatorReward,
            txId: `DRY_RUN_${distribution.operatorAddress}`,
          });
          totalDistributed += distribution.operatorReward;
        } else {
          try {
            const result = await tokenService.transfer(
              distribution.operatorAddress,
              distribution.operatorReward
            );
            transactions.push({
              address: distribution.operatorAddress,
              amount: distribution.operatorReward,
              txId: result.txId,
            });
            totalDistributed += distribution.operatorReward;
          } catch (error) {
            transactions.push({
              address: distribution.operatorAddress,
              amount: distribution.operatorReward,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }
      }

      // Transfer to delegates
      for (const delegate of distribution.delegateRewards) {
        if (delegate.reward > 0) {
          if (dryRun) {
            transactions.push({
              address: delegate.address,
              amount: delegate.reward,
              txId: `DRY_RUN_${delegate.address}`,
            });
            totalDistributed += delegate.reward;
          } else {
            try {
              const result = await tokenService.transfer(delegate.address, delegate.reward);
              transactions.push({
                address: delegate.address,
                amount: delegate.reward,
                txId: result.txId,
              });
              totalDistributed += delegate.reward;
            } catch (error) {
              transactions.push({
                address: delegate.address,
                amount: delegate.reward,
                error: error instanceof Error ? error.message : "Unknown error",
              });
            }
          }
        }
      }
    }

    // Update period status if not dry run
    if (!dryRun) {
      const distributionRecord: RewardPeriod["distribution"] = {
        distributedAt: new Date().toISOString(),
        transactionIds: distributions.map((d) => ({
          gateway: d.gateway,
          operatorTxId: transactions.find((t) => t.address === d.operatorAddress)?.txId,
          delegateTxIds: d.delegateRewards
            .map((dr) => transactions.find((t) => t.address === dr.address)?.txId)
            .filter((txId): txId is string => !!txId),
        })),
        totalDistributed,
      };

      await storage.updatePeriodStatus(periodId, "distributed", distributionRecord);
    }

    return {
      success: transactions.every((t) => !t.error),
      distributions,
      transactions,
      totalDistributed,
    };
  }

  /**
   * Approve a period for distribution
   */
  async function approvePeriod(periodId: string): Promise<void> {
    const period = await storage.loadPeriod(periodId);
    if (!period) {
      throw new Error(`Period ${periodId} not found`);
    }

    if (period.status !== "pending_review" && period.status !== "calculated") {
      throw new Error(`Period ${periodId} cannot be approved (status: ${period.status})`);
    }

    await storage.updatePeriodStatus(periodId, "approved");
  }

  /**
   * Reject a period (won't be distributed)
   */
  async function rejectPeriod(periodId: string, _reason: string): Promise<void> {
    // Note: reason is logged but not stored in current implementation
    // Future: could store rejection reason in period metadata
    const period = await storage.loadPeriod(periodId);
    if (!period) {
      throw new Error(`Period ${periodId} not found`);
    }

    await storage.updatePeriodStatus(periodId, "rejected");
  }

  /**
   * Get periods ready for distribution (past delay period)
   */
  async function getPendingDistributions(
    config: { distributionDelayDays: number }
  ): Promise<RewardPeriod[]> {
    const allPeriods = await storage.listPeriods("approved");
    const now = new Date();

    return allPeriods.filter((period) => {
      const endTime = new Date(period.endTime);
      const delayMs = config.distributionDelayDays * 24 * 60 * 60 * 1000;
      return now.getTime() - endTime.getTime() >= delayMs;
    });
  }

  /**
   * Format distribution preview for review
   */
  function formatDistributionPreview(distributions: RewardDistribution[]): string {
    const lines: string[] = [];

    lines.push("=".repeat(80));
    lines.push("REWARD DISTRIBUTION PREVIEW");
    lines.push("=".repeat(80));
    lines.push("");

    let totalToOperators = 0;
    let totalToDelegates = 0;

    for (const dist of distributions) {
      lines.push(`Gateway: ${dist.gateway}`);
      lines.push(`  Total Reward: ${dist.totalReward.toFixed(3)} ARIO`);
      lines.push(`  Operator (${dist.operatorAddress}): ${dist.operatorReward.toFixed(3)} ARIO`);
      totalToOperators += dist.operatorReward;

      if (dist.delegateRewards.length > 0) {
        lines.push(`  Delegates:`);
        for (const delegate of dist.delegateRewards) {
          lines.push(`    ${delegate.address}: ${delegate.reward.toFixed(3)} ARIO (stake: ${delegate.stake})`);
          totalToDelegates += delegate.reward;
        }
      }
      lines.push("");
    }

    lines.push("-".repeat(80));
    lines.push(`Total to Operators: ${totalToOperators.toFixed(3)} ARIO`);
    lines.push(`Total to Delegates: ${totalToDelegates.toFixed(3)} ARIO`);
    lines.push(`Grand Total: ${(totalToOperators + totalToDelegates).toFixed(3)} ARIO`);
    lines.push("=".repeat(80));

    return lines.join("\n");
  }

  return {
    calculateDistribution,
    previewDistribution,
    executeDistribution,
    approvePeriod,
    rejectPeriod,
    getPendingDistributions,
    formatDistributionPreview,
  };
}
