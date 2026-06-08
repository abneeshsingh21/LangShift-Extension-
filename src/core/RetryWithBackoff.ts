/**
 * Exponential backoff retry utility for AI provider calls.
 * Handles transient failures (429, 500, 502, 503, network errors)
 * with configurable delay, jitter, and max attempts.
 */

export interface RetryOptions {
  maxAttempts: number;       // default: 3
  baseDelayMs: number;       // default: 1000 (1 second)
  maxDelayMs: number;        // default: 30000 (30 seconds)
  jitterMs: number;          // default: 500
  signal?: AbortSignal;
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

const DEFAULT_OPTS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  jitterMs: 500,
};

export class RetryWithBackoff {

  /**
   * Execute a function with exponential backoff retry.
   * Only retries on retryable errors (429, 5xx, network, timeout).
   */
  static async execute<T>(
    fn: () => Promise<T>,
    opts: Partial<RetryOptions> = {},
  ): Promise<T> {
    const config = { ...DEFAULT_OPTS, ...opts };
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        if (config.signal?.aborted) {
          throw new DOMException('The operation was aborted', 'AbortError');
        }
        return await fn();
      } catch (error: any) {
        lastError = error;

        // Don't retry aborts
        if (error.name === 'AbortError') throw error;

        // Don't retry non-retryable errors
        if (!RetryWithBackoff.isRetryable(error)) throw error;

        // Don't retry if this was the last attempt
        if (attempt === config.maxAttempts) break;

        // Calculate delay: exponential backoff + jitter
        const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt - 1);
        const jitter = Math.random() * config.jitterMs;
        const delay = Math.min(exponentialDelay + jitter, config.maxDelayMs);

        config.onRetry?.(attempt, error, delay);

        // Wait
        await RetryWithBackoff.sleep(delay, config.signal);
      }
    }

    throw lastError ?? new Error('Retry failed with no error captured');
  }

  /**
   * Determine if an error is retryable.
   */
  static isRetryable(error: any): boolean {
    // HTTP status codes
    const status = error.status ?? error.statusCode ?? error.code;
    if (typeof status === 'number') {
      if (status === 429) return true;  // Rate limited
      if (status >= 500 && status < 600) return true;  // Server error
    }

    // Error message patterns
    const msg = (error.message ?? '').toLowerCase();
    const retryablePatterns = [
      'rate limit',
      'too many requests',
      'overloaded',
      'capacity',
      'timeout',
      'timed out',
      'econnreset',
      'econnrefused',
      'enotfound',
      'network',
      'socket hang up',
      'fetch failed',
      'service unavailable',
      'bad gateway',
      'gateway timeout',
      'internal server error',
    ];

    return retryablePatterns.some(p => msg.includes(p));
  }

  private static sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('The operation was aborted', 'AbortError'));
        return;
      }
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('The operation was aborted', 'AbortError'));
      }, { once: true });
    });
  }
}
