/**
 * Stream utilities with timeout protection
 * Prevents zombie connections from slow or stalling gateways
 */

/**
 * Error thrown when a stream read operation times out
 */
export class StreamTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Stream read timed out after ${timeoutMs}ms`);
    this.name = "StreamTimeoutError";
  }
}

/**
 * Wraps a ReadableStream with per-chunk read timeout protection.
 * If no data is received within timeoutMs, the stream is aborted and an error is thrown.
 *
 * This prevents zombie connections where a gateway starts sending data but then stalls.
 * The timeout resets after each chunk is received.
 *
 * @param stream - The source stream to wrap
 * @param timeoutMs - Maximum time to wait for each chunk (default: 120000ms = 2 minutes)
 * @returns A new stream with timeout protection
 */
export function wrapStreamWithTimeout(
  stream: ReadableStream<Uint8Array>,
  timeoutMs: number = 120_000,
): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      // Clear any existing timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      // Create a timeout promise that rejects if no data arrives
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reader.cancel("Stream read timeout").catch(() => {});
          reject(new StreamTimeoutError(timeoutMs));
        }, timeoutMs);
      });

      try {
        // Race between reading the next chunk and timeout
        const result = await Promise.race([reader.read(), timeoutPromise]);

        // Clear timeout on successful read
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        if (result.done) {
          controller.close();
        } else {
          controller.enqueue(result.value);
        }
      } catch (error) {
        // Clear timeout on error
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        controller.error(error);
      }
    },

    cancel(reason) {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      return reader.cancel(reason);
    },
  });
}

/**
 * Consumes a stream with timeout protection, collecting all chunks into a buffer.
 * This is useful when you need to buffer an entire stream (e.g., for verification)
 * while still protecting against zombie connections.
 *
 * @param stream - The source stream to consume
 * @param timeoutMs - Maximum time to wait for each chunk
 * @returns A promise that resolves to the complete buffered data
 */
export async function consumeStreamWithTimeout(
  stream: ReadableStream<Uint8Array>,
  timeoutMs: number = 120_000,
): Promise<Uint8Array> {
  const wrappedStream = wrapStreamWithTimeout(stream, timeoutMs);
  const reader = wrappedStream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  // Concatenate all chunks
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}
