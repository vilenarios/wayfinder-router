/**
 * Blocklist Service
 * Manages blocked ArNS names and transaction IDs with file persistence
 * and hot reload capability
 */

import { watch, type FSWatcher } from "fs";
import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import type { Logger } from "../types/index.js";
import type {
  BlocklistEntry,
  BlocklistFile,
  BlockedContentType,
  BlocklistStats,
  ModerationConfig,
} from "./blocklist-types.js";

/**
 * Interface for resolving ArNS names to txIds
 */
export interface ArnsResolver {
  resolve(arnsName: string): Promise<{ txId: string } | null>;
}

/**
 * Interface for cache purging
 */
export interface CachePurger {
  purgeArns?(arnsName: string): void;
  purgeTxId?(txId: string): void;
  purgeManifest?(txId: string): void;
}

export interface BlocklistServiceOptions {
  config: ModerationConfig;
  logger: Logger;
  arnsResolver?: ArnsResolver;
  cachePurger?: CachePurger;
}

const CURRENT_VERSION = 1;
const RELOAD_DEBOUNCE_MS = 1000;

export class BlocklistService {
  private config: ModerationConfig;
  private logger: Logger;
  private arnsResolver?: ArnsResolver;
  private cachePurger?: CachePurger;

  // In-memory sets for O(1) lookup
  private blockedArnsNames: Set<string> = new Set();
  private blockedTxIds: Set<string> = new Set();

  // Full entries for metadata
  private entries: BlocklistEntry[] = [];
  private lastUpdated: string | null = null;

  // File watcher
  private watcher: FSWatcher | null = null;
  private reloadTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(options: BlocklistServiceOptions) {
    this.config = options.config;
    this.logger = options.logger;
    this.arnsResolver = options.arnsResolver;
    this.cachePurger = options.cachePurger;
  }

  /**
   * Initialize the service: load blocklist and start file watcher
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.info("Content moderation disabled");
      return;
    }

    // Load initial blocklist
    await this.load();

    // Start file watcher for hot reload
    this.startFileWatcher();

    this.logger.info("Blocklist service initialized", {
      arnsCount: this.blockedArnsNames.size,
      txIdCount: this.blockedTxIds.size,
      filePath: this.config.blocklistPath,
    });
  }

  /**
   * Check if an ArNS name is blocked
   */
  isArnsBlocked(arnsName: string): boolean {
    return this.blockedArnsNames.has(arnsName.toLowerCase());
  }

  /**
   * Check if a transaction ID is blocked
   */
  isTxIdBlocked(txId: string): boolean {
    return this.blockedTxIds.has(txId);
  }

  /**
   * Check if either an ArNS name or txId is blocked
   */
  isBlocked(type: BlockedContentType, value: string): boolean {
    if (type === "arns") {
      return this.isArnsBlocked(value);
    }
    return this.isTxIdBlocked(value);
  }

  /**
   * Block an ArNS name or transaction ID
   */
  async block(
    type: BlockedContentType,
    value: string,
    reason: string,
    blockedBy: string,
  ): Promise<{ resolvedTxId?: string; purgedFromCache: boolean }> {
    const normalizedValue = type === "arns" ? value.toLowerCase() : value;
    let resolvedTxId: string | undefined;
    let purgedFromCache = false;

    // Check if already blocked
    if (this.isBlocked(type, normalizedValue)) {
      this.logger.warn("Content already blocked", { type, value });
      return { resolvedTxId: undefined, purgedFromCache: false };
    }

    const entry: BlocklistEntry = {
      type,
      value: normalizedValue,
      reason,
      blockedAt: new Date().toISOString(),
      blockedBy,
    };

    // If blocking ArNS, also resolve and block the txId
    if (type === "arns" && this.arnsResolver) {
      try {
        const resolution = await this.arnsResolver.resolve(normalizedValue);
        if (resolution) {
          resolvedTxId = resolution.txId;
          entry.resolvedTxId = resolvedTxId;

          // Also block the resolved txId
          this.blockedTxIds.add(resolvedTxId);

          this.logger.info("Resolved ArNS to txId for blocking", {
            arnsName: normalizedValue,
            txId: resolvedTxId,
          });
        }
      } catch (error) {
        this.logger.warn("Failed to resolve ArNS for blocking", {
          arnsName: normalizedValue,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Add to in-memory sets
    if (type === "arns") {
      this.blockedArnsNames.add(normalizedValue);
    } else {
      this.blockedTxIds.add(normalizedValue);
    }

    // Add to entries
    this.entries.push(entry);
    this.lastUpdated = new Date().toISOString();

    // Purge from caches
    if (this.cachePurger) {
      if (type === "arns") {
        this.cachePurger.purgeArns?.(normalizedValue);
        purgedFromCache = true;
      }
      if (type === "txid" || resolvedTxId) {
        const txIdToPurge = type === "txid" ? normalizedValue : resolvedTxId!;
        this.cachePurger.purgeTxId?.(txIdToPurge);
        this.cachePurger.purgeManifest?.(txIdToPurge);
        purgedFromCache = true;
      }
    }

    // Persist to file
    await this.save();

    this.logger.info("Content blocked", {
      type,
      value: normalizedValue,
      resolvedTxId,
      reason,
      blockedBy,
    });

    return { resolvedTxId, purgedFromCache };
  }

  /**
   * Unblock an ArNS name or transaction ID
   */
  async unblock(type: BlockedContentType, value: string): Promise<boolean> {
    const normalizedValue = type === "arns" ? value.toLowerCase() : value;

    // Find the entry
    const entryIndex = this.entries.findIndex(
      (e) => e.type === type && e.value === normalizedValue,
    );

    if (entryIndex === -1) {
      this.logger.warn("Content not found in blocklist", { type, value });
      return false;
    }

    const entry = this.entries[entryIndex];

    // Remove from in-memory sets
    if (type === "arns") {
      this.blockedArnsNames.delete(normalizedValue);
      // Also remove the resolved txId if it was blocked with this entry
      if (entry.resolvedTxId) {
        // Only remove if no other entry blocks this txId
        const otherBlocksThisTxId = this.entries.some(
          (e, i) =>
            i !== entryIndex &&
            (e.value === entry.resolvedTxId ||
              e.resolvedTxId === entry.resolvedTxId),
        );
        if (!otherBlocksThisTxId) {
          this.blockedTxIds.delete(entry.resolvedTxId);
        }
      }
    } else {
      this.blockedTxIds.delete(normalizedValue);
    }

    // Remove from entries
    this.entries.splice(entryIndex, 1);
    this.lastUpdated = new Date().toISOString();

    // Persist to file
    await this.save();

    this.logger.info("Content unblocked", {
      type,
      value: normalizedValue,
    });

    return true;
  }

  /**
   * Get all blocklist entries
   */
  getEntries(): BlocklistEntry[] {
    return [...this.entries];
  }

  /**
   * Get blocklist statistics
   */
  getStats(): BlocklistStats {
    return {
      totalEntries: this.entries.length,
      arnsCount: this.blockedArnsNames.size,
      txIdCount: this.blockedTxIds.size,
      lastUpdated: this.lastUpdated,
      filePath: this.config.blocklistPath,
    };
  }

  /**
   * Force reload blocklist from file
   */
  async reload(): Promise<void> {
    await this.load();
    this.logger.info("Blocklist reloaded", {
      arnsCount: this.blockedArnsNames.size,
      txIdCount: this.blockedTxIds.size,
    });
  }

  /**
   * Stop the service and clean up
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.reloadTimeout) {
      clearTimeout(this.reloadTimeout);
      this.reloadTimeout = null;
    }
    this.logger.info("Blocklist service stopped");
  }

  /**
   * Load blocklist from file
   */
  private async load(): Promise<void> {
    try {
      const content = await readFile(this.config.blocklistPath, "utf-8");
      const data: BlocklistFile = JSON.parse(content);

      // Validate version
      if (data.version > CURRENT_VERSION) {
        this.logger.warn("Blocklist file version is newer than supported", {
          fileVersion: data.version,
          supportedVersion: CURRENT_VERSION,
        });
      }

      // Clear and rebuild sets
      this.blockedArnsNames.clear();
      this.blockedTxIds.clear();
      this.entries = data.entries ?? [];
      this.lastUpdated = data.updatedAt ?? null;

      for (const entry of this.entries) {
        if (entry.type === "arns") {
          this.blockedArnsNames.add(entry.value.toLowerCase());
          // Also add resolved txId if present
          if (entry.resolvedTxId) {
            this.blockedTxIds.add(entry.resolvedTxId);
          }
        } else if (entry.type === "txid") {
          this.blockedTxIds.add(entry.value);
        }
      }

      this.logger.debug("Blocklist loaded from file", {
        entries: this.entries.length,
        arnsCount: this.blockedArnsNames.size,
        txIdCount: this.blockedTxIds.size,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // File doesn't exist - create empty blocklist
        this.logger.info("Blocklist file not found, creating empty blocklist", {
          path: this.config.blocklistPath,
        });
        await this.save();
      } else {
        this.logger.error("Failed to load blocklist", {
          error: error instanceof Error ? error.message : String(error),
          path: this.config.blocklistPath,
        });
        throw error;
      }
    }
  }

  /**
   * Save blocklist to file
   */
  private async save(): Promise<void> {
    const data: BlocklistFile = {
      version: CURRENT_VERSION,
      updatedAt: this.lastUpdated || new Date().toISOString(),
      entries: this.entries,
    };

    try {
      // Ensure directory exists
      const dir = dirname(this.config.blocklistPath);
      await mkdir(dir, { recursive: true });

      // Write atomically by writing to temp file then renaming
      const tempPath = `${this.config.blocklistPath}.tmp`;
      await writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");

      // Rename is atomic on most filesystems
      const { rename } = await import("fs/promises");
      await rename(tempPath, this.config.blocklistPath);

      this.logger.debug("Blocklist saved to file", {
        entries: this.entries.length,
        path: this.config.blocklistPath,
      });
    } catch (error) {
      this.logger.error("Failed to save blocklist", {
        error: error instanceof Error ? error.message : String(error),
        path: this.config.blocklistPath,
      });
      throw error;
    }
  }

  /**
   * Start watching the blocklist file for external changes
   */
  private startFileWatcher(): void {
    try {
      this.watcher = watch(this.config.blocklistPath, (eventType) => {
        if (eventType === "change") {
          // Debounce to handle multiple rapid changes
          if (this.reloadTimeout) {
            clearTimeout(this.reloadTimeout);
          }
          this.reloadTimeout = setTimeout(() => {
            this.logger.info("Blocklist file changed, reloading...");
            this.load().catch((error) => {
              this.logger.error("Failed to reload blocklist on file change", {
                error: error instanceof Error ? error.message : String(error),
              });
            });
          }, RELOAD_DEBOUNCE_MS);
        }
      });

      this.logger.debug("File watcher started", {
        path: this.config.blocklistPath,
      });
    } catch {
      // File might not exist yet, watcher will be started after first save
      this.logger.debug("Could not start file watcher (file may not exist)", {
        path: this.config.blocklistPath,
      });
    }
  }
}

/**
 * Factory function to create BlocklistService
 */
export function createBlocklistService(
  options: BlocklistServiceOptions,
): BlocklistService | null {
  if (!options.config.enabled) {
    return null;
  }

  return new BlocklistService(options);
}
