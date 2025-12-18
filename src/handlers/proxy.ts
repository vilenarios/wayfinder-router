/**
 * Proxy Handler
 * Fetches content from gateways, verifies it (if enabled), and serves to client
 *
 * When verification is enabled: buffers, verifies, caches, then serves only verified data
 * When verification is disabled: streams directly from gateway
 */

import type { Context } from 'hono';
import type { Logger, RouterConfig, RequestInfo } from '../types/index.js';
import type { ArnsResolver } from '../services/arns-resolver.js';
import type { ContentFetcher } from '../services/content-fetcher.js';
import type { Verifier } from '../services/verifier.js';
import type { TelemetryService } from '../telemetry/service.js';
import type { RequestOutcome, VerificationOutcome } from '../types/telemetry.js';
import type { ContentCache } from '../cache/content-cache.js';
import { addWayfinderHeaders } from '../utils/headers.js';

export interface ProxyHandlerDeps {
  arnsResolver: ArnsResolver;
  contentFetcher: ContentFetcher;
  verifier: Verifier;
  config: RouterConfig;
  logger: Logger;
  telemetryService?: TelemetryService | null;
  contentCache?: ContentCache;
}

/**
 * Create proxy handler
 */
export function createProxyHandler(deps: ProxyHandlerDeps) {
  const { arnsResolver, contentFetcher, verifier, logger, telemetryService, contentCache } = deps;

  return async (c: Context): Promise<Response> => {
    const requestInfo = c.get('requestInfo') as RequestInfo;
    const traceId = crypto.randomUUID();

    logger.debug('Proxy handler invoked', {
      requestInfo,
      traceId,
    });

    // Handle based on request type
    if (requestInfo.type === 'arns') {
      return handleArnsRequest(c, requestInfo, traceId);
    } else if (requestInfo.type === 'txid') {
      return handleTxIdRequest(c, requestInfo, traceId);
    } else {
      // Reserved path - should not reach proxy handler
      return c.json({ error: 'Not Found' }, 404);
    }
  };

  /**
   * Handle ArNS subdomain request
   */
  async function handleArnsRequest(
    c: Context,
    requestInfo: { type: 'arns'; arnsName: string; path: string },
    traceId: string,
  ): Promise<Response> {
    const { arnsName, path } = requestInfo;
    const startTime = Date.now();

    logger.info('Processing ArNS proxy request', {
      arnsName,
      path,
      traceId,
    });

    // Resolve ArNS to txId with consensus
    const resolution = await arnsResolver.resolve(arnsName);
    const { txId } = resolution;

    logger.debug('ArNS resolved', {
      arnsName,
      txId,
      traceId,
    });

    // Check cache first (using resolved txId)
    if (contentCache) {
      const cached = contentCache.get(txId, path);
      if (cached) {
        logger.info('Serving ArNS from cache', {
          arnsName,
          txId,
          path,
          cacheAge: Date.now() - cached.verifiedAt,
          traceId,
        });

        // Record cache hit telemetry
        recordTelemetry({
          traceId,
          gateway: 'cache',
          requestType: 'arns',
          identifier: arnsName,
          path,
          outcome: 'success',
          httpStatus: 200,
          startTime,
          bytesReceived: cached.contentLength,
        });

        return contentCache.toResponse(cached);
      }
    }

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
      return handleVerifiedResponse(c, response, txId, path, gateway, headers, startTime, traceId);
    }

    // No verification - pass through directly
    addWayfinderHeaders(headers, {
      mode: 'proxy',
      verified: false,
      gateway: gateway.toString(),
      txId,
    });

    logger.info('ArNS proxy request completed (unverified)', {
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
      requestType: 'arns',
      identifier: arnsName,
      path,
      outcome: 'success',
      httpStatus: response.status,
      startTime,
      bytesReceived: parseInt(response.headers.get('content-length') || '0', 10) || undefined,
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
    requestInfo: { type: 'txid'; txId: string; path: string },
    traceId: string,
  ): Promise<Response> {
    const { txId, path } = requestInfo;
    const startTime = Date.now();

    logger.info('Processing txId proxy request', {
      txId,
      path,
      traceId,
    });

    // Check cache first
    if (contentCache) {
      const cached = contentCache.get(txId, path);
      if (cached) {
        logger.info('Serving from cache', {
          txId,
          path,
          cacheAge: Date.now() - cached.verifiedAt,
          traceId,
        });

        // Record cache hit telemetry
        recordTelemetry({
          traceId,
          gateway: 'cache',
          requestType: 'txid',
          identifier: txId,
          path,
          outcome: 'success',
          httpStatus: 200,
          startTime,
          bytesReceived: cached.contentLength,
        });

        return contentCache.toResponse(cached);
      }
    }

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
      return handleVerifiedResponse(c, response, txId, path, gateway, headers, startTime, traceId);
    }

    // No verification - pass through directly
    addWayfinderHeaders(headers, {
      mode: 'proxy',
      verified: false,
      gateway: gateway.toString(),
      txId,
    });

    logger.info('TxId proxy request completed (unverified)', {
      txId,
      gateway: gateway.toString(),
      durationMs: Date.now() - startTime,
      traceId,
    });

    // Record telemetry
    recordTelemetry({
      traceId,
      gateway: gateway.toString(),
      requestType: 'txid',
      identifier: txId,
      path,
      outcome: 'success',
      httpStatus: response.status,
      startTime,
      bytesReceived: parseInt(response.headers.get('content-length') || '0', 10) || undefined,
    });

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  }

  /**
   * Handle response with verification
   * Buffers entire response, verifies, caches, then serves only verified data
   */
  async function handleVerifiedResponse(
    _c: Context,
    response: Response,
    txId: string,
    path: string,
    gateway: URL,
    headers: Headers,
    startTime: number,
    traceId: string,
  ): Promise<Response> {
    // Convert response headers to plain object for SDK
    const headersObj: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headersObj[key] = value;
    });

    // Create verification pipeline (buffers, verifies, then streams)
    const { stream, verificationPromise } = verifier.createStreamingVerification(
      response.body!,
      txId,
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

      addWayfinderHeaders(headers, {
        mode: 'proxy',
        verified: true,
        gateway: gateway.toString(),
        txId,
        verificationTimeMs: verificationResult.durationMs,
      });

      logger.info('Proxy request completed (verified)', {
        txId,
        gateway: gateway.toString(),
        verified: true,
        verificationTimeMs: verificationResult.durationMs,
        totalDurationMs: Date.now() - startTime,
        traceId,
      });

      // Cache the verified content for future requests
      if (contentCache?.isEnabled()) {
        const headersForCache: Record<string, string> = {};
        headers.forEach((value, key) => {
          headersForCache[key] = value;
        });

        const cached = contentCache.set(txId, path, {
          data,
          contentType: headers.get('content-type') || 'application/octet-stream',
          contentLength: totalLength,
          headers: headersForCache,
          verifiedAt: Date.now(),
          txId,
          hash: verificationResult.hash,
        });

        if (cached) {
          logger.info('Verified content added to cache', {
            txId,
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
        txId,
        startTime,
        httpStatus: response.status,
        bytesReceived: totalLength,
        verificationOutcome: 'verified',
        verificationDurationMs: verificationResult.durationMs,
      });

      return new Response(data, {
        status: response.status,
        headers,
      });
    } catch (error) {
      // Verification failed - do not serve content
      logger.error('Verification failed, blocking content', {
        txId,
        gateway: gateway.toString(),
        error: error instanceof Error ? error.message : String(error),
        traceId,
      });

      // Record failed verification telemetry
      recordTelemetryWithVerification({
        traceId,
        gateway: gateway.toString(),
        txId,
        startTime,
        httpStatus: response.status,
        verificationOutcome: 'failed',
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
    requestType: 'arns' | 'txid';
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
      mode: 'proxy',
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
    txId: string;
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
      requestType: 'txid',
      identifier: params.txId,
      path: '',
      mode: 'proxy',
      outcome: params.verificationOutcome === 'failed' ? 'server_error' : 'success',
      httpStatus: params.httpStatus,
      latency: {
        totalMs: Date.now() - params.startTime,
      },
      bytesReceived: params.bytesReceived,
      verification: {
        outcome: params.verificationOutcome,
        durationMs: params.verificationDurationMs,
      },
    });
  }
}
