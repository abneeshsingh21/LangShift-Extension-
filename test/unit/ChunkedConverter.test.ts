import * as assert from 'assert';
import { ChunkedConverter } from '../../src/core/ChunkedConverter';

suite('ChunkedConverter', () => {
  test('shouldChunk returns false for small files', () => {
    const code = Array(100).fill('const x = 1;').join('\n');
    assert.strictEqual(ChunkedConverter.shouldChunk(code), false);
  });

  test('shouldChunk returns true for large files', () => {
    const code = Array(500).fill('const x = 1;').join('\n');
    assert.strictEqual(ChunkedConverter.shouldChunk(code), true);
  });

  test('split returns single chunk for small files', () => {
    const code = Array(50).fill('const x = 1;').join('\n');
    const chunks = ChunkedConverter.split(code, 'JavaScript');
    assert.strictEqual(chunks.length, 1);
  });

  test('split creates multiple chunks for large files', () => {
    const code = Array(600).fill('const x = 1;').join('\n');
    const chunks = ChunkedConverter.split(code, 'JavaScript');
    assert.ok(chunks.length >= 2, `Expected >= 2 chunks, got ${chunks.length}`);
  });

  test('split preserves header in each chunk for Python', () => {
    const header = 'import os\nimport sys\nfrom typing import List\n\n';
    const body = Array(500).fill('def foo(): pass').join('\n');
    const code = header + body;
    const chunks = ChunkedConverter.split(code, 'Python');
    assert.ok(chunks.length >= 2);
    // Each chunk should contain the imports
    for (const chunk of chunks) {
      assert.ok(chunk.includes('import os'), 'Chunk should contain header import');
    }
  });

  test('reassemble joins chunks correctly', () => {
    const chunks = ['import os\n\ndef foo(): pass', 'import os\n\ndef bar(): pass'];
    const result = ChunkedConverter.reassemble(chunks, 'Python');
    assert.ok(result.includes('def foo'));
    assert.ok(result.includes('def bar'));
  });

  test('reassemble with single chunk returns it unchanged', () => {
    const code = 'const x = 1;';
    assert.strictEqual(ChunkedConverter.reassemble([code], 'JavaScript'), code);
  });

  test('split respects break points for TypeScript', () => {
    const lines: string[] = [
      'import { foo } from "bar";',
      '',
    ];
    // Add enough code to trigger chunking
    for (let i = 0; i < 250; i++) {
      lines.push(`function fn${i}() { return ${i}; }`);
    }
    const code = lines.join('\n');
    const chunks = ChunkedConverter.split(code, 'TypeScript');
    assert.ok(chunks.length >= 2);
  });

  test('split handles Go with package and imports', () => {
    const lines = ['package main', '', 'import (', '\t"fmt"', ')', ''];
    for (let i = 0; i < 500; i++) {
      lines.push(`func fn${i}() { fmt.Println(${i}) }`);
    }
    const code = lines.join('\n');
    const chunks = ChunkedConverter.split(code, 'Go');
    assert.ok(chunks.length >= 2);
  });
});
