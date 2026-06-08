import * as assert from 'assert';
import { FallbackChain } from '../../src/core/FallbackChain';

// Minimal mock logger
const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  show: () => {},
  setLevel: () => {},
} as any;

suite('FallbackChain', () => {
  test('returns primary result when it succeeds', async () => {
    const result = await FallbackChain.execute(
      { name: 'primary', fn: async () => 'hello' },
      [{ name: 'backup', fn: async () => 'world' }],
      mockLogger
    );
    assert.strictEqual(result.result, 'hello');
    assert.strictEqual(result.provider, 'primary');
    assert.strictEqual(result.attempts, 1);
    assert.strictEqual(result.fallbackUsed, false);
  });

  test('falls back when primary throws retryable error', async () => {
    const result = await FallbackChain.execute(
      { name: 'primary', fn: async () => { const e: any = new Error('rate limit'); e.status = 429; throw e; } },
      [{ name: 'backup', fn: async () => 'fallback-result' }],
      mockLogger
    );
    assert.strictEqual(result.result, 'fallback-result');
    assert.strictEqual(result.provider, 'backup');
    assert.strictEqual(result.attempts, 2);
    assert.strictEqual(result.fallbackUsed, true);
  });

  test('does NOT fall back on non-retryable error (401)', async () => {
    await assert.rejects(
      () => FallbackChain.execute(
        { name: 'primary', fn: async () => { const e: any = new Error('unauthorized'); e.status = 401; throw e; } },
        [{ name: 'backup', fn: async () => 'should not reach' }],
        mockLogger
      ),
      /unauthorized/
    );
  });

  test('throws when all providers fail', async () => {
    await assert.rejects(
      () => FallbackChain.execute(
        { name: 'p1', fn: async () => { const e: any = new Error('timeout'); e.status = 503; throw e; } },
        [{ name: 'p2', fn: async () => { const e: any = new Error('timeout'); e.status = 503; throw e; } }],
        mockLogger
      ),
      /timeout/
    );
  });

  test('isRetryable detects 429', () => {
    assert.ok(FallbackChain.isRetryable({ status: 429 }));
  });

  test('isRetryable detects 500', () => {
    assert.ok(FallbackChain.isRetryable({ status: 500 }));
  });

  test('isRetryable detects ECONNREFUSED', () => {
    assert.ok(FallbackChain.isRetryable({ message: 'ECONNREFUSED' }));
  });

  test('isRetryable rejects 401', () => {
    assert.ok(!FallbackChain.isRetryable({ status: 401 }));
  });

  test('isRetryable rejects 403', () => {
    assert.ok(!FallbackChain.isRetryable({ status: 403 }));
  });

  test('empty fallback chain throws on primary failure', async () => {
    await assert.rejects(
      () => FallbackChain.execute(
        { name: 'only', fn: async () => { throw new Error('fail'); } },
        [],
        mockLogger
      ),
      /fail/
    );
  });

  test('chain of 3: skips first two on retryable, succeeds on third', async () => {
    const result = await FallbackChain.execute(
      { name: 'p1', fn: async () => { const e: any = new Error('rate'); e.status = 429; throw e; } },
      [
        { name: 'p2', fn: async () => { const e: any = new Error('down'); e.status = 503; throw e; } },
        { name: 'p3', fn: async () => 'third-try' },
      ],
      mockLogger
    );
    assert.strictEqual(result.result, 'third-try');
    assert.strictEqual(result.provider, 'p3');
    assert.strictEqual(result.attempts, 3);
  });
});
