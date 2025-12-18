/**
 * Data Verification Service
 * Handles verification of data from gateways
 *
 * When enabled: buffers entire response, verifies hash, serves only verified data
 * When disabled: passes through without verification
 */

import { createHash } from "node:crypto";
import type {
  VerificationStrategy as SdkVerificationStrategy,
  GatewaysProvider,
} from "@ar.io/wayfinder-core";
import type {
  Logger,
  RouterConfig,
  VerificationResult,
} from "../types/index.js";
import { VerificationError } from "../middleware/error-handler.js";

export interface VerifierOptions {
  verificationStrategy: SdkVerificationStrategy | null;
  /** Provider for verification gateways (to track which gateways verified) */
  verificationProvider: GatewaysProvider | null;
  logger: Logger;
}

export interface StreamingVerificationResult {
  stream: ReadableStream<Uint8Array>;
  verificationPromise: Promise<VerificationResult>;
}

export class Verifier {
  private strategy: SdkVerificationStrategy | null;
  private verificationProvider: GatewaysProvider | null;
  private logger: Logger;

  constructor(options: VerifierOptions) {
    this.strategy = options.verificationStrategy;
    this.verificationProvider = options.verificationProvider;
    this.logger = options.logger;
  }

  /**
   * Check if verification is enabled
   */
  get enabled(): boolean {
    return this.strategy !== null;
  }

  /**
   * Get the URLs of gateways used for verification
   */
  private async getVerificationGatewayUrls(): Promise<string[]> {
    if (!this.verificationProvider) {
      return [];
    }
    try {
      const gateways = await this.verificationProvider.getGateways();
      return gateways.map((g) => g.toString());
    } catch {
      return [];
    }
  }

  /**
   * Verify data using the configured strategy
   * This buffers the entire response for verification
   */
  async verify(
    data: Uint8Array,
    txId: string,
    headers: Record<string, string>,
  ): Promise<VerificationResult> {
    if (!this.strategy) {
      return {
        verified: false,
        txId,
        durationMs: 0,
        error: "Verification disabled",
      };
    }

    const startTime = Date.now();

    try {
      // Convert Uint8Array to ReadableStream for the SDK
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      });

      await this.strategy.verifyData({
        data: stream,
        txId,
        headers,
      });

      const durationMs = Date.now() - startTime;

      // Compute hash for logging/caching purposes
      const hash = this.computeHash(data);

      // Get the gateways that were used for verification
      const verifiedByGateways = await this.getVerificationGatewayUrls();

      this.logger.debug("Verification succeeded", {
        txId,
        durationMs,
        dataSize: data.length,
        hash,
        verifiedByGateways,
      });

      return {
        verified: true,
        txId,
        durationMs,
        hash,
        verifiedByGateways,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.warn("Verification failed", {
        txId,
        durationMs,
        error: errorMessage,
      });

      return {
        verified: false,
        txId,
        durationMs,
        error: errorMessage,
      };
    }
  }

  /**
   * Create a verification pipeline that buffers, verifies, then streams
   * Guarantees no unverified bytes reach the client
   */
  createStreamingVerification(
    sourceStream: ReadableStream<Uint8Array>,
    txId: string,
    headers: Record<string, string>,
  ): StreamingVerificationResult {
    if (!this.strategy) {
      // No verification - pass through
      return {
        stream: sourceStream,
        verificationPromise: Promise.resolve({
          verified: false,
          txId,
          durationMs: 0,
          error: "Verification disabled",
        }),
      };
    }

    return this.createBufferedVerification(sourceStream, txId, headers);
  }

  /**
   * Buffer entire response, verify, then stream
   * Guarantees no unverified bytes reach the client
   */
  private createBufferedVerification(
    sourceStream: ReadableStream<Uint8Array>,
    txId: string,
    headers: Record<string, string>,
  ): StreamingVerificationResult {
    const logger = this.logger;
    const strategy = this.strategy!;
    const computeHash = this.computeHash.bind(this);
    const getVerificationGatewayUrls =
      this.getVerificationGatewayUrls.bind(this);

    let resolveVerification: (result: VerificationResult) => void;
    let rejectVerification: (error: Error) => void;

    const verificationPromise = new Promise<VerificationResult>(
      (resolve, reject) => {
        resolveVerification = resolve;
        rejectVerification = reject;
      },
    );

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const startTime = Date.now();
        const chunks: Uint8Array[] = [];
        let totalSize = 0;

        try {
          // Buffer all data
          const reader = sourceStream.getReader();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            chunks.push(value);
            totalSize += value.length;
          }

          // Concatenate chunks
          const fullData = new Uint8Array(totalSize);
          let offset = 0;
          for (const chunk of chunks) {
            fullData.set(chunk, offset);
            offset += chunk.length;
          }

          // Verify
          const verifyStream = new ReadableStream<Uint8Array>({
            start(ctrl) {
              ctrl.enqueue(fullData);
              ctrl.close();
            },
          });

          await strategy.verifyData({
            data: verifyStream,
            txId,
            headers,
          });

          const durationMs = Date.now() - startTime;

          // Compute hash for logging/caching purposes
          const hash = computeHash(fullData);

          // Get the gateways that were used for verification
          const verifiedByGateways = await getVerificationGatewayUrls();

          logger.debug("Verification succeeded", {
            txId,
            durationMs,
            dataSize: totalSize,
            hash,
            verifiedByGateways,
          });

          // Verification passed - stream the data
          controller.enqueue(fullData);
          controller.close();

          resolveVerification({
            verified: true,
            txId,
            durationMs,
            hash,
            verifiedByGateways,
          });
        } catch (error) {
          const durationMs = Date.now() - startTime;
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          logger.error("Verification failed", {
            txId,
            durationMs,
            error: errorMessage,
          });

          controller.error(
            new VerificationError(txId, `Verification failed: ${errorMessage}`),
          );

          rejectVerification(
            new VerificationError(txId, `Verification failed: ${errorMessage}`),
          );
        }
      },
    });

    return { stream, verificationPromise };
  }

  /**
   * Compute SHA-256 hash of data (for custom verification)
   */
  computeHash(data: Uint8Array): string {
    return createHash("sha256").update(data).digest("base64url");
  }
}

/**
 * Create verifier from services and configuration
 */
export function createVerifier(
  verificationStrategy: SdkVerificationStrategy | null,
  verificationProvider: GatewaysProvider | null,
  _config: RouterConfig,
  logger: Logger,
): Verifier {
  return new Verifier({
    verificationStrategy,
    verificationProvider,
    logger,
  });
}
