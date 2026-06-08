import * as assert from 'assert';
import { RetryWithBackoff } from '../../src/core/RetryWithBackoff';

suite('RetryWithBackoff', () => {

  test('succeeds immediately on first attempt', async () => {
    let attempts = 0;
    const result = await RetryWithBackoff.execute(async () => {
      attempts++;
      return 'success';
    });
    assert.strictEqual(result, 'success');
    assert.strictEqual(attempts, 1);
  });

  test('retries on retryable error and succeeds', async () => {
    let attempts = 0;
    const result = await RetryWithBackoff.execute(
      async () => {
        attempts++;
        if (attempts < 3) {
          throw Object.assign(new Error('rate limit'), { status: 429 });
        }
        return 'success';
      },
      { maxAttempts: 3, baseDelayMs: 10, jitterMs: 0 },
    );
    assert.strictEqual(result, 'success');
    assert.strictEqual(attempts, 3);
  });

  test('throws immediately on non-retryable error', async () => {
    let attempts = 0;
    try {
      await RetryWithBackoff.execute(
        async () => {
          attempts++;
          throw new Error('invalid API key');
        },
        { maxAttempts: 3, baseDelayMs: 10 },
      );
      assert.fail('Should have thrown');
    } catch (e: any) {
      assert.strictEqual(e.message, 'invalid API key');
      assert.strictEqual(attempts, 1);
    }
  });

  test('throws after max attempts on retryable error', async () => {
    let attempts = 0;
    try {
      await RetryWithBackoff.execute(
        async () => {
          attempts++;
          throw Object.assign(new Error('server error'), { status: 500 });
        },
        { maxAttempts: 2, baseDelayMs: 10, jitterMs: 0 },
      );
      assert.fail('Should have thrown');
    } catch (e: any) {
      assert.strictEqual(e.message, 'server error');
      assert.strictEqual(attempts, 2);
    }
  });

  test('calls onRetry callback', async () => {
    const retries: number[] = [];
    try {
      await RetryWithBackoff.execute(
        async () => { throw Object.assign(new Error('overloaded'), { status: 503 }); },
        {
          maxAttempts: 3,
          baseDelayMs: 10,
          jitterMs: 0,
          onRetry: (attempt) => retries.push(attempt),
        },
      );
    } catch {}
    assert.deepStrictEqual(retries, [1, 2]);
  });

  test('isRetryable detects 429', () => {
    assert.strictEqual(RetryWithBackoff.isRetryable({ status: 429 }), true);
  });

  test('isRetryable detects 500', () => {
    assert.strictEqual(RetryWithBackoff.isRetryable({ status: 500 }), true);
  });

  test('isRetryable detects timeout message', () => {
    assert.strictEqual(RetryWithBackoff.isRetryable({ message: 'Request timed out' }), true);
  });

  test('isRetryable returns false for auth errors', () => {
    assert.strictEqual(RetryWithBackoff.isRetryable({ status: 401 }), false);
    assert.strictEqual(RetryWithBackoff.isRetryable({ message: 'invalid API key' }), false);
  });

  test('respects abort signal', async () => {
    const controller = new AbortController();
    controller.abort();
    try {
      await RetryWithBackoff.execute(
        async () => 'should not reach',
        { signal: controller.signal },
      );
      assert.fail('Should have thrown');
    } catch (e: any) {
      assert.strictEqual(e.name, 'AbortError');
    }
  });
});
