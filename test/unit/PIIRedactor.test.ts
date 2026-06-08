import * as assert from 'assert';
import { PIIRedactor } from '../../src/core/PIIRedactor';

suite('PIIRedactor', () => {
  test('redacts email addresses', () => {
    const result = PIIRedactor.redact('Send to user@example.com please');
    assert.ok(!result.redactedCode.includes('user@example.com'));
    assert.ok(result.redactedCode.includes('__REDACTED_EMAIL_'));
    assert.strictEqual(result.redactionCount, 1);
  });

  test('redacts multiple emails', () => {
    const result = PIIRedactor.redact('a@b.com and c@d.org');
    assert.strictEqual(result.redactionCount, 2);
  });

  test('redacts IP addresses', () => {
    const result = PIIRedactor.redact('connect to 10.0.1.55:8080');
    assert.ok(!result.redactedCode.includes('10.0.1.55'));
    assert.ok(result.redactedCode.includes('__REDACTED_IP_'));
  });

  test('preserves localhost and private IPs', () => {
    const result = PIIRedactor.redact('localhost is 127.0.0.1 and 192.168.1.1');
    assert.ok(result.redactedCode.includes('127.0.0.1'));
    assert.ok(result.redactedCode.includes('192.168.1.1'));
  });

  test('redacts US phone numbers', () => {
    const result = PIIRedactor.redact('Call 555-123-4567');
    assert.ok(!result.redactedCode.includes('555-123-4567'));
  });

  test('redacts SSNs', () => {
    const result = PIIRedactor.redact('SSN: 123-45-6789');
    assert.ok(!result.redactedCode.includes('123-45-6789'));
  });

  test('redacts AWS access keys', () => {
    const result = PIIRedactor.redact('key = AKIAIOSFODNN7EXAMPLE');
    assert.ok(!result.redactedCode.includes('AKIAIOSFODNN7EXAMPLE'));
  });

  test('restore reverses all redactions', () => {
    const original = 'user@test.com at 10.0.1.55 call 555-123-4567';
    const { redactedCode, redactions } = PIIRedactor.redact(original);
    assert.ok(!redactedCode.includes('user@test.com'));
    const restored = PIIRedactor.restore(redactedCode, redactions);
    assert.strictEqual(restored, original);
  });

  test('clean code has zero redactions', () => {
    const result = PIIRedactor.redact('function add(a, b) { return a + b; }');
    assert.strictEqual(result.redactionCount, 0);
    assert.strictEqual(result.redactedCode, 'function add(a, b) { return a + b; }');
  });

  test('handles empty string', () => {
    const result = PIIRedactor.redact('');
    assert.strictEqual(result.redactedCode, '');
    assert.strictEqual(result.redactionCount, 0);
  });

  test('multiple restore calls are idempotent', () => {
    const { redactedCode, redactions } = PIIRedactor.redact('a@b.com');
    const r1 = PIIRedactor.restore(redactedCode, redactions);
    const r2 = PIIRedactor.restore(r1, redactions);
    assert.strictEqual(r1, r2);
  });
});
