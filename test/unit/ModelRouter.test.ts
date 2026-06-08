import * as assert from 'assert';
import { ModelRouter } from '../../src/core/ModelRouter';

suite('ModelRouter', () => {
  test('returns route for known pair', () => {
    const route = ModelRouter.getRoute('Python', 'Java');
    assert.ok(route);
    assert.strictEqual(route.provider, 'anthropic');
    assert.ok(route.model.length > 0);
    assert.ok(route.reason.length > 0);
  });

  test('returns null for unknown pair', () => {
    const route = ModelRouter.getRoute('Brainfuck', 'COBOL');
    assert.strictEqual(route, null);
  });

  test('hasRoute returns true for known pairs', () => {
    assert.ok(ModelRouter.hasRoute('Python', 'Java'));
    assert.ok(ModelRouter.hasRoute('JavaScript', 'TypeScript'));
  });

  test('hasRoute returns false for unknown pairs', () => {
    assert.ok(!ModelRouter.hasRoute('Unknown', 'Language'));
  });

  test('Gemini routes for Go/Dart', () => {
    const goRoute = ModelRouter.getRoute('Python', 'Go');
    assert.ok(goRoute);
    assert.strictEqual(goRoute.provider, 'gemini');

    const dartRoute = ModelRouter.getRoute('Python', 'Dart');
    assert.ok(dartRoute);
    assert.strictEqual(dartRoute.provider, 'gemini');
  });

  test('OpenAI routes for JS/TS', () => {
    const route = ModelRouter.getRoute('JavaScript', 'TypeScript');
    assert.ok(route);
    assert.strictEqual(route.provider, 'openai');
  });

  test('getAllRoutes returns all entries', () => {
    const all = ModelRouter.getAllRoutes();
    assert.ok(all.length >= 10);
    for (const entry of all) {
      assert.ok(entry.pair.includes('→'));
      assert.ok(entry.recommendation.provider);
      assert.ok(entry.recommendation.model);
    }
  });
});
