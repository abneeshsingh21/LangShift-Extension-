import * as assert from 'assert';
import { FewShotExamples } from '../../src/core/FewShotExamples';

suite('FewShotExamples', () => {
  test('returns examples for Python→Java', () => {
    const examples = FewShotExamples.get('Python', 'Java');
    assert.ok(examples.length >= 2);
    for (const ex of examples) {
      assert.ok(ex.sourceCode.length > 0);
      assert.ok(ex.targetCode.length > 0);
      assert.ok(ex.description.length > 0);
    }
  });

  test('returns empty for unknown pair', () => {
    const examples = FewShotExamples.get('FORTRAN', 'Assembly');
    assert.strictEqual(examples.length, 0);
  });

  test('has() returns true for known pairs', () => {
    assert.ok(FewShotExamples.has('Python', 'Java'));
    assert.ok(FewShotExamples.has('Python', 'TypeScript'));
    assert.ok(FewShotExamples.has('JavaScript', 'TypeScript'));
  });

  test('has() returns false for unknown pairs', () => {
    assert.ok(!FewShotExamples.has('X', 'Y'));
  });

  test('formatForPrompt includes examples', () => {
    const prompt = FewShotExamples.formatForPrompt('Python', 'Java');
    assert.ok(prompt.includes('EXAMPLES'));
    assert.ok(prompt.includes('List comprehension'));
    assert.ok(prompt.includes('streams'));
  });

  test('formatForPrompt returns empty for unknown pair', () => {
    const prompt = FewShotExamples.formatForPrompt('X', 'Y');
    assert.strictEqual(prompt, '');
  });

  test('availablePairs returns all pairs', () => {
    const pairs = FewShotExamples.availablePairs();
    assert.ok(pairs.length >= 5);
    assert.ok(pairs.includes('Python→Java'));
  });
});
