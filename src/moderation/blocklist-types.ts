/**
 * Content Moderation Types
 * Types for the blocklist service and moderation API
 */

/**
 * Type of blocked content
 */
export type BlockedContentType = "arns" | "txid";

/**
 * A single blocklist entry with audit metadata
 */
export interface BlocklistEntry {
  /** Type of blocked content */
  type: BlockedContentType;
  /** The blocked value (ArNS name or txId) */
  value: string;
  /** Reason for blocking */
  reason: string;
  /** ISO timestamp when blocked */
  blockedAt: string;
  /** Who/what blocked it (admin email, system, etc.) */
  blockedBy: string;
  /** For ArNS entries: the txId it resolved to at block time */
  resolvedTxId?: string;
}

/**
 * Blocklist file format
 */
export interface BlocklistFile {
  /** Schema version for future migrations */
  version: number;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** All blocked entries */
  entries: BlocklistEntry[];
}

/**
 * Request to block content
 */
export interface BlockRequest {
  type: BlockedContentType;
  value: string;
  reason: string;
  blockedBy: string;
}

/**
 * Response after blocking content
 */
export interface BlockResponse {
  success: boolean;
  blocked: {
    type: BlockedContentType;
    value: string;
    resolvedTxId?: string;
    purgedFromCache: boolean;
  };
}

/**
 * Blocklist statistics
 */
export interface BlocklistStats {
  totalEntries: number;
  arnsCount: number;
  txIdCount: number;
  lastUpdated: string | null;
  filePath: string;
}

/**
 * Moderation configuration
 */
export interface ModerationConfig {
  /** Enable content moderation */
  enabled: boolean;
  /** Path to blocklist JSON file */
  blocklistPath: string;
  /** Admin API token for authentication */
  adminToken: string;
}
