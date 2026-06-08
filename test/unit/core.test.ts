import * as assert from 'assert';

// ─────────────────────────────────────────────────────────────────────────────
// Tests for BackupManager, ConversionHistory, RateLimiter, and ConfigManager
// These test the pure logic by replicating key algorithms, since the actual
// classes depend on vscode.ExtensionContext which requires the extension host.
// ─────────────────────────────────────────────────────────────────────────────

// ─── BackupManager pruneOld logic ────────────────────────────────────────────
suite('BackupManager — pruneOld logic', () => {
  const LIMIT = 50;

  // Simulate the FIXED pruning logic
  function pruneFixed(entries: { id: string; timestamp: number }[]): {
    toDelete: typeof entries;
    toKeep: typeof entries;
  } {
    if (entries.length <= LIMIT) return { toDelete: [], toKeep: entries };
    // entries[0] = oldest (push appends), entries[last] = newest
    // Keep the NEWEST entries (tail), delete the OLDEST (head)
    const toDelete = entries.slice(0, entries.length - LIMIT);
    const toKeep = entries.slice(entries.length - LIMIT);
    return { toDelete, toKeep };
  }

  // Simulate the BROKEN (original) pruning logic
  function pruneBroken(entries: { id: string; timestamp: number }[]): {
    toDelete: typeof entries;
    toKeep: typeof entries;
  } {
    if (entries.length <= LIMIT) return { toDelete: [], toKeep: entries };
    const toDelete = entries.slice(LIMIT);
    const toKeep = entries.slice(0, LIMIT);
    return { toDelete, toKeep };
  }

  function makeEntries(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      id: `backup_${i}`,
      timestamp: 1000 + i, // timestamp increases with index
    }));
  }

  test('fixed prune: keeps newest 50, deletes oldest when 60 entries', () => {
    const entries = makeEntries(60);
    const { toDelete, toKeep } = pruneFixed(entries);

    assert.strictEqual(toKeep.length, 50);
    assert.strictEqual(toDelete.length, 10);

    // Kept entries should be the NEWEST (highest timestamps)
    assert.strictEqual(toKeep[0].id, 'backup_10');
    assert.strictEqual(toKeep[49].id, 'backup_59');

    // Deleted entries should be the OLDEST (lowest timestamps)
    assert.strictEqual(toDelete[0].id, 'backup_0');
    assert.strictEqual(toDelete[9].id, 'backup_9');
  });

  test('broken prune: incorrectly keeps oldest, deletes newest', () => {
    const entries = makeEntries(60);
    const { toDelete, toKeep } = pruneBroken(entries);

    // BUG: it keeps the OLDEST
    assert.strictEqual(toKeep[0].id, 'backup_0');
    assert.strictEqual(toKeep[49].id, 'backup_49');

    // BUG: it deletes the NEWEST
    assert.strictEqual(toDelete[0].id, 'backup_50');
    assert.strictEqual(toDelete[9].id, 'backup_59');
  });

  test('prune does nothing when under limit', () => {
    const entries = makeEntries(30);
    const { toDelete, toKeep } = pruneFixed(entries);
    assert.strictEqual(toDelete.length, 0);
    assert.strictEqual(toKeep.length, 30);
  });

  test('prune does nothing when exactly at limit', () => {
    const entries = makeEntries(50);
    const { toDelete, toKeep } = pruneFixed(entries);
    assert.strictEqual(toDelete.length, 0);
    assert.strictEqual(toKeep.length, 50);
  });

  test('prune handles large overflow (200 entries)', () => {
    const entries = makeEntries(200);
    const { toDelete, toKeep } = pruneFixed(entries);
    assert.strictEqual(toKeep.length, 50);
    assert.strictEqual(toDelete.length, 150);
    // Newest is last entry
    assert.strictEqual(toKeep[49].id, 'backup_199');
    // Oldest deleted is first entry
    assert.strictEqual(toDelete[0].id, 'backup_0');
  });
});

// ─── ConversionHistory — code retention logic ────────────────────────────────
suite('ConversionHistory — code retention', () => {
  const LIMIT = 100;
  const CODE_RETENTION_LIMIT = 15;

  interface MockRecord {
    id: string;
    originalCode: string | null;
    convertedCode: string | null;
    timestamp: number;
  }

  function simulateAdd(
    history: MockRecord[],
    newRecord: MockRecord,
  ): MockRecord[] {
    history.unshift(newRecord);
    return history.slice(0, LIMIT).map((r, i) => {
      if (i >= CODE_RETENTION_LIMIT) {
        return { ...r, originalCode: null, convertedCode: null };
      }
      return r;
    });
  }

  test('first 15 records retain code', () => {
    let history: MockRecord[] = [];
    for (let i = 0; i < 20; i++) {
      const rec: MockRecord = {
        id: `rec_${i}`,
        originalCode: `source_${i}`,
        convertedCode: `converted_${i}`,
        timestamp: Date.now() + i,
      };
      history = simulateAdd(history, rec);
    }

    // Most recent 15 should have code
    for (let i = 0; i < 15; i++) {
      assert.ok(history[i].originalCode !== null, `Record ${i} should have code`);
      assert.ok(history[i].convertedCode !== null, `Record ${i} should have code`);
    }

    // Records beyond 15 should have nulled code
    for (let i = 15; i < 20; i++) {
      assert.strictEqual(history[i].originalCode, null, `Record ${i} should have null code`);
      assert.strictEqual(history[i].convertedCode, null, `Record ${i} should have null code`);
    }
  });

  test('history is capped at LIMIT', () => {
    let history: MockRecord[] = [];
    for (let i = 0; i < 150; i++) {
      const rec: MockRecord = {
        id: `rec_${i}`,
        originalCode: `source`,
        convertedCode: `converted`,
        timestamp: Date.now() + i,
      };
      history = simulateAdd(history, rec);
    }
    assert.ok(history.length <= LIMIT);
  });

  test('newest record is always at index 0 (unshift behavior)', () => {
    let history: MockRecord[] = [];
    for (let i = 0; i < 5; i++) {
      const rec: MockRecord = {
        id: `rec_${i}`,
        originalCode: `source_${i}`,
        convertedCode: `converted_${i}`,
        timestamp: i,
      };
      history = simulateAdd(history, rec);
    }
    assert.strictEqual(history[0].id, 'rec_4'); // newest
    assert.strictEqual(history[4].id, 'rec_0'); // oldest
  });
});

// ─── ConversionHistory — stats computation ───────────────────────────────────
suite('ConversionHistory — stats', () => {
  interface StatRecord {
    fromLang: string;
    toLang: string;
    provider: string;
    linesConverted: number;
  }

  function getStats(records: StatRecord[]) {
    const byPair: Record<string, number> = {};
    const byProvider: Record<string, number> = {};
    let totalLines = 0;

    for (const r of records) {
      const pair = `${r.fromLang} → ${r.toLang}`;
      byPair[pair] = (byPair[pair] ?? 0) + 1;
      byProvider[r.provider ?? 'unknown'] = (byProvider[r.provider ?? 'unknown'] ?? 0) + 1;
      totalLines += r.linesConverted;
    }

    const mostCommonPair =
      Object.entries(byPair).sort(([, a], [, b]) => b - a)[0]?.[0] ?? '—';

    return {
      totalConversions: records.length,
      totalLinesConverted: totalLines,
      mostCommonPair,
      conversionsByPair: byPair,
      byProvider,
    };
  }

  test('empty history returns zero stats', () => {
    const stats = getStats([]);
    assert.strictEqual(stats.totalConversions, 0);
    assert.strictEqual(stats.totalLinesConverted, 0);
    assert.strictEqual(stats.mostCommonPair, '—');
  });

  test('counts conversions by pair', () => {
    const stats = getStats([
      { fromLang: 'Python', toLang: 'Java', provider: 'anthropic', linesConverted: 50 },
      { fromLang: 'Python', toLang: 'Java', provider: 'openai', linesConverted: 30 },
      { fromLang: 'Go', toLang: 'Rust', provider: 'anthropic', linesConverted: 100 },
    ]);
    assert.strictEqual(stats.conversionsByPair['Python → Java'], 2);
    assert.strictEqual(stats.conversionsByPair['Go → Rust'], 1);
    assert.strictEqual(stats.mostCommonPair, 'Python → Java');
  });

  test('counts conversions by provider', () => {
    const stats = getStats([
      { fromLang: 'Python', toLang: 'Java', provider: 'anthropic', linesConverted: 50 },
      { fromLang: 'Python', toLang: 'Go', provider: 'anthropic', linesConverted: 30 },
      { fromLang: 'Go', toLang: 'Rust', provider: 'openai', linesConverted: 100 },
    ]);
    assert.strictEqual(stats.byProvider['anthropic'], 2);
    assert.strictEqual(stats.byProvider['openai'], 1);
  });

  test('sums total lines correctly', () => {
    const stats = getStats([
      { fromLang: 'Python', toLang: 'Java', provider: 'anthropic', linesConverted: 50 },
      { fromLang: 'Go', toLang: 'Rust', provider: 'openai', linesConverted: 100 },
    ]);
    assert.strictEqual(stats.totalLinesConverted, 150);
  });
});

// ─── RateLimiter — sliding window logic ──────────────────────────────────────
suite('RateLimiter — sliding window', () => {
  const HOUR_MS = 60 * 60 * 1000;
  const LIMIT = 50;

  function slidingWindow(timestamps: number[], now: number): number[] {
    return timestamps.filter(t => t > now - HOUR_MS);
  }

  test('filters out expired timestamps', () => {
    const now = Date.now();
    const timestamps = [
      now - HOUR_MS - 1000, // expired
      now - HOUR_MS + 1000, // still valid (just barely)
      now - 1000,           // valid
      now,                  // valid
    ];
    const fresh = slidingWindow(timestamps, now);
    assert.strictEqual(fresh.length, 3);
  });

  test('empty timestamps returns empty', () => {
    assert.deepStrictEqual(slidingWindow([], Date.now()), []);
  });

  test('all expired returns empty', () => {
    const now = Date.now();
    const old = [now - HOUR_MS - 5000, now - HOUR_MS - 3000, now - HOUR_MS - 1000];
    assert.strictEqual(slidingWindow(old, now).length, 0);
  });

  test('rate limit check with under-limit usage', () => {
    const now = Date.now();
    const timestamps = Array.from({ length: 10 }, (_, i) => now - i * 1000);
    const count = slidingWindow(timestamps, now).length;
    assert.ok(count < LIMIT);
  });

  test('rate limit check with at-limit usage', () => {
    const now = Date.now();
    const timestamps = Array.from({ length: 50 }, (_, i) => now - i * 1000);
    const count = slidingWindow(timestamps, now).length;
    assert.strictEqual(count, LIMIT);
    assert.ok(!(count < LIMIT)); // should NOT allow more
  });

  test('resetInMinutes calculation', () => {
    const now = Date.now();
    const oldest = now - 30 * 60 * 1000; // 30 minutes ago
    const timestamps = [oldest, now - 1000, now];
    const fresh = slidingWindow(timestamps, now);
    const resetAt = Math.min(...fresh) + HOUR_MS;
    const minutes = Math.max(0, Math.ceil((resetAt - now) / 60_000));
    assert.ok(minutes >= 29 && minutes <= 31);
  });
});

// ─── ConfigManager — getActiveModel logic ────────────────────────────────────
suite('ConfigManager — getActiveModel', () => {
  interface MockConfig {
    aiProvider: string;
    anthropicModel: string;
    openaiModel: string;
    geminiModel: string;
    openrouterModel: string;
  }

  function getActiveModel(config: MockConfig): string {
    switch (config.aiProvider) {
      case 'anthropic':   return config.anthropicModel;
      case 'openai':      return config.openaiModel;
      case 'gemini':      return config.geminiModel;
      case 'openrouter':  return config.openrouterModel;
      default:            return config.anthropicModel;
    }
  }

  test('anthropic provider returns anthropicModel', () => {
    assert.strictEqual(getActiveModel({
      aiProvider: 'anthropic',
      anthropicModel: 'claude-opus-4-5',
      openaiModel: 'gpt-4o',
      geminiModel: 'gemini-2.0-flash',
      openrouterModel: 'anthropic/claude-opus-4-5',
    }), 'claude-opus-4-5');
  });

  test('openai provider returns openaiModel', () => {
    assert.strictEqual(getActiveModel({
      aiProvider: 'openai',
      anthropicModel: 'claude-opus-4-5',
      openaiModel: 'gpt-4o',
      geminiModel: 'gemini-2.0-flash',
      openrouterModel: 'anthropic/claude-opus-4-5',
    }), 'gpt-4o');
  });

  test('gemini provider returns geminiModel', () => {
    assert.strictEqual(getActiveModel({
      aiProvider: 'gemini',
      anthropicModel: 'claude-opus-4-5',
      openaiModel: 'gpt-4o',
      geminiModel: 'gemini-2.0-flash',
      openrouterModel: 'anthropic/claude-opus-4-5',
    }), 'gemini-2.0-flash');
  });

  test('openrouter provider returns openrouterModel', () => {
    assert.strictEqual(getActiveModel({
      aiProvider: 'openrouter',
      anthropicModel: 'claude-opus-4-5',
      openaiModel: 'gpt-4o',
      geminiModel: 'gemini-2.0-flash',
      openrouterModel: 'meta-llama/llama-3.3-70b-instruct',
    }), 'meta-llama/llama-3.3-70b-instruct');
  });
});

// ─── Improved balancedBraces logic ───────────────────────────────────────────
suite('CodeValidator — improved balancedBraces', () => {
  function balancedBraces(code: string): boolean {
    // Strip string contents to avoid counting braces inside strings
    const stripped = code.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
    // Strip single-line comments
    const noComments = stripped.replace(/\/\/.*$/gm, '').replace(/#.*$/gm, '');
    const opens  = (noComments.match(/{/g) ?? []).length;
    const closes = (noComments.match(/}/g) ?? []).length;
    return opens === closes;
  }

  test('simple balanced braces', () => {
    assert.ok(balancedBraces('function f() { return {}; }'));
  });

  test('unbalanced braces', () => {
    assert.ok(!balancedBraces('function f() { if (true) {'));
  });

  test('braces inside strings are ignored', () => {
    // The string contains a }, but the code is balanced
    assert.ok(balancedBraces('const x = "{ not a brace }"; function f() { }'));
  });

  test('braces inside single-quoted strings are ignored', () => {
    assert.ok(balancedBraces("const x = '{ not a brace }'; function f() { }"));
  });

  test('braces inside comments are ignored', () => {
    assert.ok(balancedBraces('function f() {\n// { this is a comment\nreturn 1;\n}'));
  });

  test('empty code has balanced braces (zero each)', () => {
    assert.ok(balancedBraces(''));
  });

  test('nested braces', () => {
    assert.ok(balancedBraces('class A { method() { if (true) { } } }'));
  });

  test('JSON-like with braces in strings', () => {
    assert.ok(balancedBraces('const j = { "key": "value with { }" };'));
  });
});
