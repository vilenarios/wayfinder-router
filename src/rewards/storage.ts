/**
 * Reward Period Storage
 *
 * Stores reward calculations as JSON files.
 * Also supports publishing to Arweave for transparency.
 */

import { mkdir, readFile, writeFile, readdir } from "fs/promises";
import { join } from "path";
import type { RewardPeriod } from "./types.js";

export interface RewardStorageConfig {
  dataDir: string;
}

export function createFileStorage(config: RewardStorageConfig) {
  const { dataDir } = config;
  const periodsDir = join(dataDir, "reward-periods");

  async function ensureDir(): Promise<void> {
    await mkdir(periodsDir, { recursive: true });
  }

  async function savePeriod(period: RewardPeriod): Promise<void> {
    await ensureDir();
    const filePath = join(periodsDir, `${period.periodId}.json`);
    await writeFile(filePath, JSON.stringify(period, null, 2));
  }

  async function loadPeriod(periodId: string): Promise<RewardPeriod | undefined> {
    try {
      const filePath = join(periodsDir, `${periodId}.json`);
      const content = await readFile(filePath, "utf-8");
      return JSON.parse(content) as RewardPeriod;
    } catch {
      return undefined;
    }
  }

  async function listPeriods(status?: RewardPeriod["status"]): Promise<RewardPeriod[]> {
    await ensureDir();
    const files = await readdir(periodsDir);
    const periods: RewardPeriod[] = [];

    for (const file of files) {
      if (file.endsWith(".json")) {
        const periodId = file.replace(".json", "");
        const period = await loadPeriod(periodId);
        if (period) {
          if (!status || period.status === status) {
            periods.push(period);
          }
        }
      }
    }

    // Sort by end time descending (most recent first)
    return periods.sort(
      (a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime()
    );
  }

  async function updatePeriodStatus(
    periodId: string,
    status: RewardPeriod["status"],
    distribution?: RewardPeriod["distribution"]
  ): Promise<void> {
    const period = await loadPeriod(periodId);
    if (!period) {
      throw new Error(`Period ${periodId} not found`);
    }

    period.status = status;
    if (distribution) {
      period.distribution = distribution;
    }

    await savePeriod(period);
  }

  async function getLatestPeriods(count: number): Promise<RewardPeriod[]> {
    const all = await listPeriods();
    return all.slice(0, count);
  }

  return {
    savePeriod,
    loadPeriod,
    listPeriods,
    updatePeriodStatus,
    getLatestPeriods,
  };
}

/**
 * Arweave publisher for reward transparency
 */
export interface ArweavePublisher {
  publish(data: string, tags: Array<{ name: string; value: string }>): Promise<string>;
}

export function createArweavePublisher(
  arweave: ArweavePublisher,
  appName: string = "Wayfinder-Rewards"
) {
  async function publishPeriod(period: RewardPeriod, formattedData: string): Promise<string> {
    const tags = [
      { name: "App-Name", value: appName },
      { name: "Content-Type", value: "application/json" },
      { name: "Period-Id", value: period.periodId },
      { name: "Period-Start", value: period.startTime },
      { name: "Period-End", value: period.endTime },
      { name: "Pool-Amount", value: period.config.dailyPoolAmount.toString() },
      { name: "Qualified-Gateways", value: period.networkStats.qualifiedGateways.toString() },
      { name: "Total-Requests", value: period.networkStats.totalRequests.toString() },
      { name: "Calculator-Version", value: period.version },
    ];

    return arweave.publish(formattedData, tags);
  }

  return {
    publishPeriod,
  };
}
