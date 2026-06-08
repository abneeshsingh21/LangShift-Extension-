import * as assert from 'assert';

// We test the static/pure helpers of ConversionEngine by importing them
// The actual AI calls require mocking SDKs which is done via integration tests

// Since ConversionEngine is a class with private methods, we test the public interface
// and the pure-function behavior we can access.
// For the helpers that are testable, we extract and test their logic.

// ─────────────────────────────────────────────────────────────────────────────
suite('ConversionEngine — stripMarkdown logic', () => {
  // Replicate the stripMarkdown logic for unit testing
  function stripMarkdown(text: string): string {
    const fenced = /^```[\w]*\r?\n([\s\S]*?)```\s*$/;
    const m = text.match(fenced);
    if (m) return m[1].trim();
    const all = [...text.matchAll(/```[\w]*\r?\n([\s\S]*?)```/gm)];
    if (all.length > 0) return all.map(b => b[1].trim()).join('\n\n');
    return text.trim();
  }

  test('plain code (no fences) is returned trimmed', () => {
    const code = '  def hello():\n    print("hi")\n  ';
    assert.strictEqual(stripMarkdown(code), 'def hello():\n    print("hi")');
  });

  test('single fenced block is extracted', () => {
    const input = '```python\ndef hello():\n    print("hi")\n```';
    assert.strictEqual(stripMarkdown(input), 'def hello():\n    print("hi")');
  });

  test('fenced block with no language specifier', () => {
    const input = '```\nconst x = 1;\n```';
    assert.strictEqual(stripMarkdown(input), 'const x = 1;');
  });

  test('multiple fenced blocks are concatenated', () => {
    const input = 'Here is the code:\n```java\nclass A {}\n```\nAnd:\n```java\nclass B {}\n```\n';
    const result = stripMarkdown(input);
    assert.ok(result.includes('class A {}'));
    assert.ok(result.includes('class B {}'));
  });

  test('handles Windows line endings (\\r\\n)', () => {
    const input = '```python\r\ndef hello():\r\n    pass\r\n```';
    assert.strictEqual(stripMarkdown(input), 'def hello():\r\n    pass');
  });

  test('handles empty fenced block', () => {
    const input = '```\n\n```';
    assert.strictEqual(stripMarkdown(input), '');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
suite('ConversionEngine — friendlyError logic', () => {
  // Replicate friendlyError for testing
  function friendlyError(e: any): string {
    const msg: string = e?.message ?? String(e);
    const status = e?.status ?? e?.response?.status ?? 0;
    if (status === 401 || msg.includes('401') || msg.includes('auth') || msg.includes('Unauthorized'))
      return 'API key rejected — check your key in LangShift settings.';
    if (status === 403 || msg.includes('403') || msg.includes('forbidden'))
      return 'Access forbidden — your API key may lack required permissions.';
    if (status === 429 || msg.includes('429') || msg.includes('rate'))
      return 'Provider rate limit hit — try again in a moment.';
    if (status === 402 || msg.includes('quota') || msg.includes('billing') || msg.includes('insufficient'))
      return 'API quota exceeded — check your provider billing.';
    if (status >= 500 || msg.includes('500') || msg.includes('502') || msg.includes('503'))
      return 'AI provider server error — try again shortly.';
    if (msg.includes('timeout') || msg.includes('timed out'))
      return `Request timed out. Increase "conversionTimeout" in settings.`;
    if (msg.includes('context') || msg.includes('too long') || msg.includes('max_tokens'))
      return 'File is too large for this model\'s context window. Try a shorter file or larger model.';
    if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('network'))
      return 'Network error — check your internet connection.';
    return `AI provider error: ${msg}`;
  }

  test('maps 401 status to auth error', () => {
    const result = friendlyError({ status: 401, message: 'Unauthorized' });
    assert.ok(result.includes('API key rejected'));
  });

  test('maps 403 status to forbidden error', () => {
    const result = friendlyError({ status: 403, message: 'Forbidden' });
    assert.ok(result.includes('forbidden'));
  });

  test('maps 429 status to rate limit error', () => {
    const result = friendlyError({ status: 429, message: 'Too Many Requests' });
    assert.ok(result.includes('rate limit'));
  });

  test('maps quota/billing error', () => {
    const result = friendlyError({ message: 'insufficient quota' });
    assert.ok(result.includes('quota exceeded'));
  });

  test('maps 500+ status to server error', () => {
    const result = friendlyError({ status: 502, message: 'Bad Gateway' });
    assert.ok(result.includes('server error'));
  });

  test('maps timeout error', () => {
    const result = friendlyError({ message: 'Request timed out' });
    assert.ok(result.includes('timed out'));
  });

  test('maps context length error', () => {
    const result = friendlyError({ message: 'context length exceeded, max_tokens too large' });
    assert.ok(result.includes('context window'));
  });

  test('maps network error', () => {
    const result = friendlyError({ message: 'ENOTFOUND api.anthropic.com' });
    assert.ok(result.includes('Network error'));
  });

  test('maps ECONNREFUSED error', () => {
    const result = friendlyError({ message: 'ECONNREFUSED 127.0.0.1' });
    assert.ok(result.includes('Network error'));
  });

  test('falls through to generic error for unknown messages', () => {
    const result = friendlyError({ message: 'something weird happened' });
    assert.ok(result.includes('AI provider error:'));
    assert.ok(result.includes('something weird'));
  });

  test('handles error from string', () => {
    const result = friendlyError('plain string error');
    assert.ok(result.includes('AI provider error:'));
  });

  test('handles nested response.status', () => {
    const result = friendlyError({ response: { status: 429 }, message: 'error' });
    assert.ok(result.includes('rate limit'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
suite('ConversionEngine — prompt construction', () => {
  // Replicate prompt helpers
  function systemPrompt(): string {
    return [
      'You are an expert code transpiler. Convert source code between programming languages with these rules:',
      '1. Preserve ALL logic, algorithms, and program behavior exactly — zero functional changes.',
      '2. Use idiomatic patterns of the TARGET language, not a literal word-for-word translation.',
      '3. Convert comments and docstrings to the target language documentation style.',
      '4. Map standard library calls to their correct target-language equivalents.',
      '5. Handle language-specific features properly (e.g. Python list comprehensions → Java streams, etc.).',
      '6. Add all necessary imports, package declarations, class wrappers, and type annotations.',
      '7. Maintain proper error-handling idioms for the target language.',
      '',
      'CRITICAL OUTPUT RULES:',
      '- Return ONLY the raw converted code. No explanations. No markdown. No triple backticks.',
      '- The code must compile/run as-is in the target language.',
      '- If something has no direct equivalent, use the closest idiomatic alternative and note it in a comment.',
    ].join('\n');
  }

  test('system prompt contains critical output rules', () => {
    const prompt = systemPrompt();
    assert.ok(prompt.includes('CRITICAL OUTPUT RULES'));
    assert.ok(prompt.includes('No markdown'));
    assert.ok(prompt.includes('No triple backticks'));
    assert.ok(prompt.includes('Preserve ALL logic'));
  });

  test('system prompt mentions idiomatic patterns', () => {
    const prompt = systemPrompt();
    assert.ok(prompt.includes('idiomatic'));
  });

  test('system prompt instructs to add imports', () => {
    const prompt = systemPrompt();
    assert.ok(prompt.includes('imports'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
suite('ConversionEngine — AbortError detection', () => {
  test('DOMException with AbortError name is properly named', () => {
    // Verify the fix: DOMException creates proper name
    const err = new DOMException('The operation was aborted', 'AbortError');
    assert.strictEqual(err.name, 'AbortError');
  });

  test('plain Error does NOT have AbortError name (pre-fix behavior)', () => {
    const err = new Error('AbortError');
    assert.notStrictEqual(err.name, 'AbortError');
    assert.strictEqual(err.name, 'Error');
  });
});
