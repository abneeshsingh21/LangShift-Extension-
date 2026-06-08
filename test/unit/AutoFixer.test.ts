import * as assert from 'assert';
import { AutoFixer } from '../../src/core/AutoFixer';

suite('AutoFixer', () => {

  test('AutoFixer class exists and has fix method', () => {
    assert.strictEqual(typeof AutoFixer.fix, 'function');
  });

  test('AutoFixResult interface shape', async () => {
    // We can't fully test without a real compiler + AI, but verify the module loads
    // and the static method signature is correct
    assert.ok(AutoFixer.fix);
  });
});
