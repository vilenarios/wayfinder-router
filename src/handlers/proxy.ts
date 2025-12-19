/**
 * Proxy Handler
 * Fetches content from gateways, verifies it (if enabled), and serves to client
 *
 * When verification is enabled: buffers, verifies, caches, then serves only verified data
 * When verification is disabled: streams directly from gateway
 *
 * Manifest Support:
 * - Detects manifest requests (txId with subpath or ArNS resolving to manifest)
 * - Fetches and verifies manifest from trusted gateways
 * - Verifies path mapping against authentic manifest
 * - Verifies content against expected txId from manifest
 */

import type { Context } from "hono";
import type {
  Logger,
  RouterConfig,
  RequestInfo,
  TxIdRequestInfo,
} from "../types/index.js";
import type { ArnsResolver } from "../services/arns-resolver.js";
import type { ContentFetcher } from "../services/content-fetcher.js";
import type { Verifier } from "../services/verifier.js";
import type { ManifestResolver } from "../services/manifest-resolver.js";
import type { TelemetryService } from "../telemetry/service.js";
import type {
  RequestOutcome,
  VerificationOutcome,
} from "../types/telemetry.js";
import type { ContentCache } from "../cache/content-cache.js";
import {
  addWayfinderHeaders,
  extractManifestInfo,
  isManifestResponse,
} from "../utils/headers.js";
import { sandboxFromTxId, validateSandboxForTxId } from "../utils/url.js";

export interface ProxyHandlerDeps {
  arnsResolver: ArnsResolver;
  contentFetcher: ContentFetcher;
  verifier: Verifier;
  manifestResolver: ManifestResolver;
  config: RouterConfig;
  logger: Logger;
  telemetryService?: TelemetryService | null;
  contentCache?: ContentCache;
}

/**
 * Create proxy handler
 */
export function createProxyHandler(deps: ProxyHandlerDeps) {
  const {
    arnsResolver,
    contentFetcher,
    verifier,
    manifestResolver,
    logger,
    telemetryService,
    contentCache,
  } = deps;

  return async (c: Context): Promise<Response> => {
    const requestInfo = c.get("requestInfo") as RequestInfo;
    const traceId = crypto.randomUUID();

    logger.debug("Proxy handler invoked", {
      requestInfo,
      traceId,
    });

    // Handle based on request type
    if (requestInfo.type === "arns") {
      return handleArnsRequest(c, requestInfo, traceId);
    } else if (requestInfo.type === "txid") {
      return handleTxIdRequest(c, requestInfo, traceId);
    } else {
      // Reserved path - should not reach proxy handler
      return c.json({ error: "Not Found" }, 404);
    }
  };

  /**
   * Handle ArNS subdomain request
   */
  async function handleArnsRequest(
    c: Context,
    requestInfo: { type: "arns"; arnsName: string; path: string },
    traceId: string,
  ): Promise<Response> {
    const { arnsName, path } = requestInfo;
    const startTime = Date.now();

    logger.info("Processing ArNS proxy request", {
      arnsName,
      path,
      traceId,
    });

    // Resolve ArNS to txId with consensus
    const resolution = await arnsResolver.resolve(arnsName);
    const { txId } = resolution;

    logger.debug("ArNS resolved", {
      arnsName,
      txId,
      traceId,
    });

    // Note: Cache check happens AFTER manifest resolution in handleVerifiedResponse
    // because we need to know the actual content txId (which may differ for manifests)

    // Fetch content from gateway
    const fetchResult = await contentFetcher.fetchByArns({
      arnsName,
      resolvedTxId: txId,
      path,
      originalHeaders: c.req.raw.headers,
      traceId,
    });

    const { response, gateway, headers } = fetchResult;

    // Handle verification if enabled
    if (verifier.enabled && response.body) {
      return handleVerifiedResponse(
        c,
        response,
        txId,
        path,
        gateway,
        headers,
        startTime,
        traceId,
        "arns",
        arnsName,
      );
    }

    // No verification - pass through directly
    addWayfinderHeaders(headers, {
      mode: "proxy",
      verified: false,
      routedVia: gateway.toString(),
      txId,
    });

    logger.info("ArNS proxy request completed (unverified)", {
      arnsName,
      txId,
      gateway: gateway.toString(),
      durationMs: Date.now() - startTime,
      traceId,
    });

    // Record telemetry
    recordTelemetry({
      traceId,
      gateway: gateway.toString(),
      requestType: "arns",
      identifier: arnsName,
      path,
      outcome: "success",
      httpStatus: response.status,
      startTime,
      bytesReceived:
        parseInt(response.headers.get("content-length") || "0", 10) ||
        undefined,
    });

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  }

  /**
   * Handle transaction ID path request
   */
  async function handleTxIdRequest(
    c: Context,
    requestInfo: TxIdRequestInfo,
    traceId: string,
  ): Promise<Response> {
    const { txId, path, sandboxSubdomain } = requestInfo;
    const startTime = Date.now();

    logger.info("Processing txId proxy request", {
      txId,
      path,
      sandboxSubdomain,
      traceId,
    });

    // Check if we need to redirect to sandbox subdomain
    if (!sandboxSubdomain) {
      // No sandbox subdomain - redirect to sandboxed URL
      const sandbox = sandboxFromTxId(txId);
      const { config } = deps;
      const protocol = c.req.url.startsWith("https") ? "https" : "http";
      const redirectUrl = `${protocol}://${sandbox}.${config.server.baseDomain}/${txId}${path}`;

      logger.info("Redirecting to sandbox subdomain", {
        txId,
        sandbox,
        redirectUrl,
        traceId,
      });

      return c.redirect(redirectUrl, 302);
    }

    // Validate sandbox matches txId (security check)
    if (!validateSandboxForTxId(sandboxSubdomain, txId)) {
      logger.warn("Sandbox subdomain mismatch", {
        txId,
        sandboxSubdomain,
        expectedSandbox: sandboxFromTxId(txId),
        traceId,
      });
      return c.json(
        {
          error: "Bad Request",
          message: "Sandbox subdomain does not match transaction ID",
        },
        400,
      );
    }

    // Note: Cache check happens AFTER manifest resolution in handleVerifiedResponse
    // because we need to know the actual content txId (which may differ for manifests)

    // Fetch content from gateway
    const fetchResult = await contentFetcher.fetchByTxId({
      txId,
      path,
      originalHeaders: c.req.raw.headers,
      traceId,
    });

    const { response, gateway, headers } = fetchResult;

    // Handle verification if enabled
    if (verifier.enabled && response.body) {
      return handleVerifiedResponse(
        c,
        response,
        txId,
        path,
        gateway,
        headers,
        startTime,
        traceId,
        "txid",
        txId,
      );
    }

    // No verification - pass through directly
    addWayfinderHeaders(headers, {
      mode: "proxy",
      verified: false,
      routedVia: gateway.toString(),
      txId,
    });

    logger.info("TxId proxy request completed (unverified)", {
      txId,
      gateway: gateway.toString(),
      durationMs: Date.now() - startTime,
      traceId,
    });

    // Record telemetry
    recordTelemetry({
      traceId,
      gateway: gateway.toString(),
      requestType: "txid",
      identifier: txId,
      path,
      outcome: "success",
      httpStatus: response.status,
      startTime,
      bytesReceived:
        parseInt(response.headers.get("content-length") || "0", 10) ||
        undefined,
    });

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  }

  /**
   * Handle response with manifest-aware verification
   * 1. Detects if response is from a manifest (via headers)
   * 2. If manifest: verifies manifest, verifies path mapping, verifies content
   * 3. If not manifest: verifies content against requested txId
   * 4. Checks cache AFTER determining content txId (important for manifest deduplication)
   */
  async function handleVerifiedResponse(
    _c: Context,
    response: Response,
    requestedTxId: string,
    path: string,
    gateway: URL,
    headers: Headers,
    startTime: number,
    traceId: string,
    requestType: "arns" | "txid",
    identifier: string,
  ): Promise<Response> {
    // Extract manifest info from gateway response headers
    const manifestInfo = extractManifestInfo(response.headers);
    const isManifest = isManifestResponse(manifestInfo, requestedTxId);

    logger.debug("Checking for manifest response", {
      requestedTxId,
      path,
      resolvedId: manifestInfo.resolvedId,
      dataId: manifestInfo.dataId,
      isManifest,
      traceId,
    });

    // Determine the expected content txId for verification
    let contentTxId = requestedTxId;
    let manifestTxId: string | null = null;

    if (isManifest && manifestInfo.dataId) {
      // This is a manifest response - we need to verify the path mapping
      // For ArNS requests, the manifest txId is resolvedId
      // For txId requests, the manifest txId is the requestedTxId itself
      manifestTxId = manifestInfo.resolvedId || requestedTxId;

      logger.debug("Manifest response detected, verifying path mapping", {
        manifestTxId,
        dataId: manifestInfo.dataId,
        path,
        traceId,
      });

      try {
        // Get and verify the manifest from trusted gateways
        const pathResolution = await manifestResolver.resolvePath(
          manifestTxId,
          path,
        );

        logger.debug("Manifest path resolved", {
          manifestTxId,
          path,
          expectedContentTxId: pathResolution.contentTxId,
          actualDataId: manifestInfo.dataId,
          isIndex: pathResolution.isIndex,
          traceId,
        });

        // Verify that the gateway returned the correct content for this path
        if (pathResolution.contentTxId !== manifestInfo.dataId) {
          logger.error(
            "Manifest path mapping mismatch - gateway may be malicious",
            {
              manifestTxId,
              path,
              expectedContentTxId: pathResolution.contentTxId,
              actualDataId: manifestInfo.dataId,
              traceId,
            },
          );
          throw new Error(
            `Gateway returned wrong content for manifest path. Expected ${pathResolution.contentTxId}, got ${manifestInfo.dataId}`,
          );
        }

        // Use the content txId from manifest for verification
        contentTxId = pathResolution.contentTxId;
      } catch (error) {
        logger.error("Failed to verify manifest path mapping", {
          manifestTxId,
          path,
          error: error instanceof Error ? error.message : String(error),
          traceId,
        });
        throw error;
      }
    }

    // NOW we can check the cache - we know the actual content txId
    // Cache by contentTxId only (not path) since the same content can be accessed via different paths
    if (contentCache) {
      const cached = contentCache.get(contentTxId, "");
      if (cached) {
        logger.info("Serving verified content from cache", {
          contentTxId,
          manifestTxId,
          path,
          cacheAge: Date.now() - cached.verifiedAt,
          traceId,
        });

        // Record cache hit telemetry
        recordTelemetry({
          traceId,
          gateway: "cache",
          requestType,
          identifier,
          path,
          outcome: "success",
          httpStatus: 200,
          startTime,
          bytesReceived: cached.contentLength,
        });

        // We need to consume/discard the response body since we're serving from cache
        // This prevents memory leaks from unconsumed streams
        response.body?.cancel().catch(() => {});

        return contentCache.toResponse(cached);
      }
    }

    // Cache miss - proceed with content verification
    return handleContentVerification(
      response,
      contentTxId,
      manifestTxId,
      path,
      gateway,
      headers,
      startTime,
      traceId,
      requestType,
      identifier,
    );
  }

  /**
   * Handle content verification (post-manifest resolution)
   * Buffers entire response, verifies against expected txId, caches, then serves
   */
  async function handleContentVerification(
    response: Response,
    contentTxId: string,
    manifestTxId: string | null,
    path: string,
    gateway: URL,
    headers: Headers,
    startTime: number,
    traceId: string,
    requestType: "arns" | "txid",
    identifier: string,
  ): Promise<Response> {
    // Convert response headers to plain object for SDK
    const headersObj: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headersObj[key] = value;
    });

    // Create verification pipeline (buffers, verifies, then streams)
    // Use contentTxId (which may be from manifest resolution) for verification
    const { stream, verificationPromise } =
      verifier.createStreamingVerification(
        response.body!,
        contentTxId,
        headersObj,
      );

    try {
      // Consume the stream to get verified data
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      // Verification succeeded (stream would have thrown if it failed)
      const verificationResult = await verificationPromise;

      // Concatenate chunks for response
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const data = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.length;
      }

      // IMPORTANT: Remove content-encoding header since Node.js fetch() auto-decompresses
      // If we pass through content-encoding: gzip but serve decompressed data,
      // browsers will fail with ERR_CONTENT_DECODING_FAILED
      headers.delete("content-encoding");
      // Update content-length to match actual decompressed size
      headers.set("content-length", String(totalLength));

      // Add wayfinder headers - include manifest info if applicable
      addWayfinderHeaders(headers, {
        mode: "proxy",
        verified: true,
        routedVia: gateway.toString(),
        verifiedBy: verificationResult.verifiedByGateways,
        txId: contentTxId,
        verificationTimeMs: verificationResult.durationMs,
      });

      // Add manifest-specific header if this was a manifest response
      if (manifestTxId) {
        headers.set("x-wayfinder-manifest-txid", manifestTxId);
      }

      logger.info("Proxy request completed (verified)", {
        contentTxId,
        manifestTxId,
        path,
        gateway: gateway.toString(),
        verified: true,
        verificationTimeMs: verificationResult.durationMs,
        totalDurationMs: Date.now() - startTime,
        traceId,
      });

      // Cache the verified content for future requests
      // Cache key is the content txId (not manifest txId) since content is immutable
      if (contentCache?.isEnabled()) {
        const headersForCache: Record<string, string> = {};
        headers.forEach((value, key) => {
          headersForCache[key] = value;
        });

        // Cache by content txId with empty path (content is the same regardless of manifest path)
        const cached = contentCache.set(contentTxId, "", {
          data,
          contentType:
            headers.get("content-type") || "application/octet-stream",
          contentLength: totalLength,
          headers: headersForCache,
          verifiedAt: Date.now(),
          txId: contentTxId,
          hash: verificationResult.hash,
        });

        if (cached) {
          logger.info("Verified content added to cache", {
            contentTxId,
            manifestTxId,
            path,
            size: totalLength,
            traceId,
          });
        }
      }

      // Record successful telemetry with verification
      recordTelemetryWithVerification({
        traceId,
        gateway: gateway.toString(),
        requestType,
        identifier,
        path,
        contentTxId,
        startTime,
        httpStatus: response.status,
        bytesReceived: totalLength,
        verificationOutcome: "verified",
        verificationDurationMs: verificationResult.durationMs,
      });

      return new Response(data, {
        status: response.status,
        headers,
      });
    } catch (error) {
      // Verification failed - do not serve content
      logger.error("Verification failed, blocking content", {
        contentTxId,
        manifestTxId,
        path,
        gateway: gateway.toString(),
        error: error instanceof Error ? error.message : String(error),
        traceId,
      });

      // Record failed verification telemetry
      recordTelemetryWithVerification({
        traceId,
        gateway: gateway.toString(),
        requestType,
        identifier,
        path,
        contentTxId,
        startTime,
        httpStatus: response.status,
        verificationOutcome: "failed",
      });

      throw error;
    }
  }

  /**
   * Record telemetry for a request
   */
  function recordTelemetry(params: {
    traceId: string;
    gateway: string;
    requestType: "arns" | "txid";
    identifier: string;
    path: string;
    outcome: RequestOutcome;
    httpStatus?: number;
    startTime: number;
    bytesReceived?: number;
  }): void {
    if (!telemetryService) return;

    telemetryService.recordRequest({
      traceId: params.traceId,
      timestamp: params.startTime,
      gateway: params.gateway,
      requestType: params.requestType,
      identifier: params.identifier,
      path: params.path,
      mode: "proxy",
      outcome: params.outcome,
      httpStatus: params.httpStatus,
      latency: {
        totalMs: Date.now() - params.startTime,
      },
      bytesReceived: params.bytesReceived,
    });
  }

  /**
   * Record telemetry for a request with verification
   */
  function recordTelemetryWithVerification(params: {
    traceId: string;
    gateway: string;
    requestType: "arns" | "txid";
    identifier: string;
    path: string;
    contentTxId: string;
    startTime: number;
    httpStatus?: number;
    bytesReceived?: number;
    verificationOutcome: VerificationOutcome;
    verificationDurationMs?: number;
  }): void {
    if (!telemetryService) return;

    telemetryService.recordRequest({
      traceId: params.traceId,
      timestamp: params.startTime,
      gateway: params.gateway,
      requestType: params.requestType,
      identifier: params.identifier,
      path: params.path,
      mode: "proxy",
      outcome:
        params.verificationOutcome === "failed" ? "server_error" : "success",
      httpStatus: params.httpStatus,
      latency: {
        totalMs: Date.now() - params.startTime,
      },
      bytesReceived: params.bytesReceived,
      verification: {
        outcome: params.verificationOutcome,
        durationMs: params.verificationDurationMs,
        contentTxId: params.contentTxId,
      },
    });
  }
}
