/**
 * Manifest Resolver Service
 * Handles fetching, verifying, parsing, and resolving Arweave manifests
 */

import type { Logger, RouterConfig } from '../types/index.js';
import type {
  ArweaveManifest,
  VerifiedManifest,
  ManifestPathResolution,
} from '../types/manifest.js';
import {
  isArweaveManifest,
  normalizeManifestPath,
} from '../types/manifest.js';
import type { Verifier } from './verifier.js';
import { ManifestCache } from '../cache/manifest-cache.js';
import { WayfinderError } from '../middleware/error-handler.js';

/**
 * Error thrown when manifest operations fail
 */
export class ManifestError extends WayfinderError {
  public readonly manifestTxId: string;

  constructor(manifestTxId: string, message: string, statusCode: number = 502) {
    super(message, statusCode, 'MANIFEST_ERROR');
    this.name = 'ManifestError';
    this.manifestTxId = manifestTxId;
  }
}

/**
 * Error thrown when a path is not found in a manifest
 */
export class ManifestPathNotFoundError extends WayfinderError {
  public readonly manifestTxId: string;
  public readonly path: string;

  constructor(manifestTxId: string, path: string) {
    super(
      `Path "${path}" not found in manifest ${manifestTxId}`,
      404,
      'MANIFEST_PATH_NOT_FOUND',
    );
    this.name = 'ManifestPathNotFoundError';
    this.manifestTxId = manifestTxId;
    this.path = path;
  }
}

export interface ManifestResolverOptions {
  trustedGateways: URL[];
  verifier: Verifier;
  cache: ManifestCache;
  logger: Logger;
  fetchTimeoutMs?: number;
}

export class ManifestResolver {
  private trustedGateways: URL[];
  private verifier: Verifier;
  private cache: ManifestCache;
  private logger: Logger;
  private fetchTimeoutMs: number;

  constructor(options: ManifestResolverOptions) {
    this.trustedGateways = options.trustedGateways;
    this.verifier = options.verifier;
    this.cache = options.cache;
    this.logger = options.logger;
    this.fetchTimeoutMs = options.fetchTimeoutMs ?? 30000;

    this.logger.info('ManifestResolver initialized', {
      trustedGatewayCount: this.trustedGateways.length,
    });
  }

  /**
   * Get a verified manifest, fetching and verifying if not cached
   */
  async getManifest(manifestTxId: string): Promise<VerifiedManifest> {
    // Check cache first
    const cached = this.cache.get(manifestTxId);
    if (cached) {
      this.logger.debug('Manifest found in cache', { manifestTxId });
      return cached;
    }

    // Fetch and verify from trusted gateways
    this.logger.debug('Fetching manifest from trusted gateways', {
      manifestTxId,
    });

    const verified = await this.fetchAndVerifyManifest(manifestTxId);

    // Cache the verified manifest
    this.cache.set(verified);

    return verified;
  }

  /**
   * Resolve a path within a manifest to its content txId
   */
  async resolvePath(
    manifestTxId: string,
    path: string,
  ): Promise<ManifestPathResolution> {
    const verified = await this.getManifest(manifestTxId);
    const manifest = verified.manifest;

    // Normalize the path
    const normalizedPath = normalizeManifestPath(path);

    this.logger.debug('Resolving manifest path', {
      manifestTxId,
      originalPath: path,
      normalizedPath,
    });

    // Handle empty path or index
    if (normalizedPath === '' || normalizedPath === '/') {
      if (!manifest.index?.path) {
        throw new ManifestPathNotFoundError(
          manifestTxId,
          path || '/',
        );
      }

      const indexPath = normalizeManifestPath(manifest.index.path);
      const indexEntry = manifest.paths[indexPath];

      if (!indexEntry) {
        throw new ManifestPathNotFoundError(
          manifestTxId,
          manifest.index.path,
        );
      }

      return {
        manifestTxId,
        path: indexPath,
        contentTxId: indexEntry.id,
        isIndex: true,
      };
    }

    // Look up the path in manifest
    let entry = manifest.paths[normalizedPath];
    let resolvedPath = normalizedPath;

    if (!entry) {
      // Try with and without leading slash
      const altPath = normalizedPath.startsWith('/')
        ? normalizedPath.slice(1)
        : `/${normalizedPath}`;
      entry = manifest.paths[altPath];
      resolvedPath = altPath;
    }

    if (!entry) {
      // Use fallback if available
      if (manifest.fallback?.id) {
        this.logger.debug('Path not found, using manifest fallback', {
          manifestTxId,
          path: normalizedPath,
          fallbackTxId: manifest.fallback.id,
        });

        return {
          manifestTxId,
          path: normalizedPath,
          contentTxId: manifest.fallback.id,
          isIndex: false,
        };
      }

      throw new ManifestPathNotFoundError(manifestTxId, path);
    }

    return {
      manifestTxId,
      path: resolvedPath,
      contentTxId: entry.id,
      isIndex: false,
    };
  }

  /**
   * Check if we have a verified manifest cached
   */
  hasCached(manifestTxId: string): boolean {
    return this.cache.has(manifestTxId);
  }

  /**
   * Get cache statistics
   */
  stats(): ReturnType<ManifestCache['stats']> {
    return this.cache.stats();
  }

  /**
   * Fetch raw manifest from trusted gateways and verify
   */
  private async fetchAndVerifyManifest(
    manifestTxId: string,
  ): Promise<VerifiedManifest> {
    let lastError: Error | undefined;

    // Try each trusted gateway
    for (const gateway of this.trustedGateways) {
      try {
        const result = await this.fetchRawManifest(gateway, manifestTxId);

        // Verify the manifest
        const verificationResult = await this.verifier.verify(
          result.data,
          manifestTxId,
          result.headers,
        );

        if (!verificationResult.verified) {
          throw new ManifestError(
            manifestTxId,
            `Manifest verification failed: ${verificationResult.error || 'unknown error'}`,
          );
        }

        // Parse the manifest JSON
        const manifest = this.parseManifest(result.data, manifestTxId);

        this.logger.info('Manifest fetched and verified', {
          manifestTxId,
          gateway: gateway.toString(),
          pathCount: Object.keys(manifest.paths).length,
          hasIndex: !!manifest.index,
        });

        return {
          txId: manifestTxId,
          manifest,
          verifiedAt: Date.now(),
          sizeBytes: result.data.length,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        this.logger.warn('Failed to fetch manifest from gateway', {
          manifestTxId,
          gateway: gateway.toString(),
          error: lastError.message,
        });
      }
    }

    // All gateways failed
    throw new ManifestError(
      manifestTxId,
      `Failed to fetch manifest from any trusted gateway: ${lastError?.message || 'unknown error'}`,
    );
  }

  /**
   * Fetch raw manifest content from a gateway
   */
  private async fetchRawManifest(
    gateway: URL,
    manifestTxId: string,
  ): Promise<{ data: Uint8Array; headers: Record<string, string> }> {
    // Construct raw manifest URL
    const url = new URL(gateway);
    url.pathname = `/raw/${manifestTxId}`;

    this.logger.debug('Fetching raw manifest', {
      url: url.toString(),
      manifestTxId,
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(this.fetchTimeoutMs),
    });

    if (!response.ok) {
      throw new ManifestError(
        manifestTxId,
        `Gateway returned ${response.status}: ${response.statusText}`,
      );
    }

    // Read the response body
    const data = new Uint8Array(await response.arrayBuffer());

    // Extract relevant headers for verification
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    return { data, headers };
  }

  /**
   * Parse manifest JSON
   */
  private parseManifest(
    data: Uint8Array,
    manifestTxId: string,
  ): ArweaveManifest {
    let parsed: unknown;

    try {
      const text = new TextDecoder().decode(data);
      parsed = JSON.parse(text);
    } catch {
      throw new ManifestError(
        manifestTxId,
        'Failed to parse manifest JSON',
      );
    }

    if (!isArweaveManifest(parsed)) {
      throw new ManifestError(
        manifestTxId,
        'Invalid manifest format: not a valid arweave/paths manifest',
      );
    }

    return parsed;
  }
}

/**
 * Create manifest resolver from configuration
 */
export function createManifestResolver(
  config: RouterConfig,
  verifier: Verifier,
  logger: Logger,
): ManifestResolver {
  const cache = new ManifestCache({
    maxSize: 1000, // Cache up to 1000 manifests
    logger,
  });

  return new ManifestResolver({
    trustedGateways: config.verification.staticGateways,
    verifier,
    cache,
    logger,
  });
}
