import { Logger } from '../utils/Logger';

export interface FallbackAttempt<T> {
  name: string;
  fn: () => Promise<T>;
}

export interface FallbackResult<T> {
  result: T;
  provider: string;
  attempts: number;
  fallbackUsed: boolean;
}

export class FallbackChain {
  private static readonly RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

  static isRetryable(error: any): boolean {
    const status = error?.status ?? error?.response?.status ?? 0;
    if (this.RETRYABLE_STATUS.has(status)) return true;
    const msg = error?.message ?? '';
    if (msg.includes('429') || msg.includes('rate')) return true;
    if (msg.includes('500') || msg.includes('502') || msg.includes('503')) return true;
    if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) return true;
    if (msg.includes('timeout') || msg.includes('timed out')) return true;
    return false;
  }

  static async execute<T>(
    primary: FallbackAttempt<T>,
    fallbacks: FallbackAttempt<T>[],
    logger: Logger
  ): Promise<FallbackResult<T>> {
    let attempts = 0;
    const chain = [primary, ...fallbacks];

    for (const attempt of chain) {
      attempts++;
      try {
        const result = await attempt.fn();
        return {
          result,
          provider: attempt.name,
          attempts,
          fallbackUsed: attempt !== primary,
        };
      } catch (error: any) {
        const isLast = attempt === chain[chain.length - 1];
        if (isLast || !this.isRetryable(error)) {
          // Not retryable or last in chain — throw
          throw error;
        }
        logger.warn(`Provider ${attempt.name} failed (${error.message}), trying next fallback...`);
      }
    }

    // Should never reach here, but TypeScript needs it
    throw new Error('All providers in fallback chain failed.');
  }
}
