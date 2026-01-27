/**
 * Gateway Rewards System
 *
 * Off-chain reward distribution for ar.io gateways that serve
 * traffic through Wayfinder Router.
 *
 * @example
 * ```typescript
 * import { createRewardCalculator, createRewardDistributor } from './rewards';
 *
 * // Calculate rewards
 * const calculator = createRewardCalculator({ ... });
 * const period = await calculator.calculateYesterdayRewards();
 *
 * // Distribute rewards
 * const distributor = createRewardDistributor({ ... });
 * await distributor.executeDistribution(period.periodId);
 * ```
 */

export * from "./types.js";
export * from "./calculator.js";
export * from "./distributor.js";
export * from "./storage.js";
