import * as assert from 'assert';
import { CompilerValidator } from '../../src/core/CompilerValidator';

suite('CompilerValidator', () => {
  test('supports TypeScript', () => {
    assert.ok(CompilerValidator.isSupported('TypeScript'));
  });

  test('supports Java', () => {
    assert.ok(CompilerValidator.isSupported('Java'));
  });

  test('supports Go', () => {
    assert.ok(CompilerValidator.isSupported('Go'));
  });

  test('supports Rust', () => {
    assert.ok(CompilerValidator.isSupported('Rust'));
  });

  test('supports Python', () => {
    assert.ok(CompilerValidator.isSupported('Python'));
  });

  test('supports C++', () => {
    assert.ok(CompilerValidator.isSupported('C++'));
  });

  test('does not support unknown language', () => {
    assert.ok(!CompilerValidator.isSupported('Brainfuck'));
  });

  test('supportedLanguages returns non-empty list', () => {
    const langs = CompilerValidator.supportedLanguages();
    assert.ok(langs.length >= 6);
    assert.ok(langs.includes('TypeScript'));
    assert.ok(langs.includes('Java'));
    assert.ok(langs.includes('Python'));
  });

  test('validate returns success for unsupported language', async () => {
    const result = await CompilerValidator.validate('some code', 'Brainfuck');
    assert.ok(result.success);
    assert.strictEqual(result.compiler, 'none');
  });
});
