/**
 * Arweave Manifest Types
 * Defines types for Arweave path manifests (arweave/paths)
 */

/**
 * Arweave path manifest structure
 * @see https://cookbook.arweave.dev/concepts/manifests.html
 */
export interface ArweaveManifest {
  /** Manifest type identifier */
  manifest: "arweave/paths";
  /** Manifest version */
  version: string;
  /** Index configuration - path to serve for root requests */
  index?: {
    path: string;
  };
  /** Fallback - txId to serve for paths not found in manifest */
  fallback?: {
    id: string;
  };
  /** Path to transaction ID mappings */
  paths: Record<string, ManifestPathEntry>;
}

/**
 * Entry in a manifest's paths object
 */
export interface ManifestPathEntry {
  /** Transaction ID for this path */
  id: string;
}

/**
 * Verified manifest with metadata
 */
export interface VerifiedManifest {
  /** The manifest's transaction ID */
  txId: string;
  /** The parsed manifest content */
  manifest: ArweaveManifest;
  /** When the manifest was verified */
  verifiedAt: number;
  /** Size in bytes of the raw manifest */
  sizeBytes: number;
}

/**
 * Result of resolving a path within a manifest
 */
export interface ManifestPathResolution {
  /** The manifest transaction ID */
  manifestTxId: string;
  /** The resolved path (normalized) */
  path: string;
  /** The transaction ID for the content at this path */
  contentTxId: string;
  /** Whether this is the index path */
  isIndex: boolean;
}

/**
 * Check if an object is a valid Arweave manifest
 */
export function isArweaveManifest(obj: unknown): obj is ArweaveManifest {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  const manifest = obj as Record<string, unknown>;

  return (
    manifest.manifest === "arweave/paths" &&
    typeof manifest.version === "string" &&
    typeof manifest.paths === "object" &&
    manifest.paths !== null
  );
}

/**
 * Normalize a path for manifest lookup
 * - Removes leading slash
 * - Handles empty path as index lookup
 */
export function normalizeManifestPath(path: string): string {
  // Remove leading slash
  let normalized = path.startsWith("/") ? path.slice(1) : path;

  // Remove trailing slash (unless it's the root)
  if (normalized.endsWith("/") && normalized.length > 1) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}
