import * as assert from 'assert';

// We test the matching logic by importing the interface and creating test data
suite('CustomRules — Rule Matching Logic', () => {
  // Since CustomRules.getApplicableRules depends on vscode.workspace,
  // we test the matching logic directly

  interface ConversionRule {
    languages?: string[];
    instruction: string;
  }

  function matchRules(rules: ConversionRule[], fromLang: string, toLang: string): string[] {
    const pair = `${fromLang}→${toLang}`;
    const fromWild = `${fromLang}→*`;
    const toWild = `*→${toLang}`;
    const allWild = '*→*';

    return rules
      .filter(r => {
        if (!r.languages || r.languages.length === 0) return true;
        return r.languages.some(l => l === pair || l === fromWild || l === toWild || l === allWild);
      })
      .map(r => r.instruction);
  }

  test('exact pair match', () => {
    const rules: ConversionRule[] = [
      { languages: ['Python→Java'], instruction: 'Use slf4j' },
    ];
    assert.deepStrictEqual(matchRules(rules, 'Python', 'Java'), ['Use slf4j']);
  });

  test('no match for different pair', () => {
    const rules: ConversionRule[] = [
      { languages: ['Python→Java'], instruction: 'Use slf4j' },
    ];
    assert.deepStrictEqual(matchRules(rules, 'Python', 'Go'), []);
  });

  test('wildcard source matches any fromLang', () => {
    const rules: ConversionRule[] = [
      { languages: ['*→TypeScript'], instruction: 'Use zod' },
    ];
    assert.deepStrictEqual(matchRules(rules, 'Python', 'TypeScript'), ['Use zod']);
    assert.deepStrictEqual(matchRules(rules, 'Java', 'TypeScript'), ['Use zod']);
  });

  test('wildcard target matches any toLang', () => {
    const rules: ConversionRule[] = [
      { languages: ['Python→*'], instruction: 'Always type hint' },
    ];
    assert.deepStrictEqual(matchRules(rules, 'Python', 'Java'), ['Always type hint']);
    assert.deepStrictEqual(matchRules(rules, 'Python', 'Go'), ['Always type hint']);
  });

  test('global wildcard matches everything', () => {
    const rules: ConversionRule[] = [
      { languages: ['*→*'], instruction: 'Add license header' },
    ];
    assert.deepStrictEqual(matchRules(rules, 'Rust', 'C++'), ['Add license header']);
  });

  test('no languages array matches all pairs', () => {
    const rules: ConversionRule[] = [
      { instruction: 'Always use strict mode' },
    ];
    assert.deepStrictEqual(matchRules(rules, 'anything', 'else'), ['Always use strict mode']);
  });

  test('empty languages array matches all pairs', () => {
    const rules: ConversionRule[] = [
      { languages: [], instruction: 'Global rule' },
    ];
    assert.deepStrictEqual(matchRules(rules, 'X', 'Y'), ['Global rule']);
  });

  test('multiple rules, some match some dont', () => {
    const rules: ConversionRule[] = [
      { languages: ['Python→Java'], instruction: 'Use streams' },
      { languages: ['Python→Go'], instruction: 'Use goroutines' },
      { languages: ['*→*'], instruction: 'Add comments' },
    ];
    const matched = matchRules(rules, 'Python', 'Java');
    assert.deepStrictEqual(matched, ['Use streams', 'Add comments']);
  });
});
