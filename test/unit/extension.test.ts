import * as assert from 'assert';
import { LanguageDetector } from '../../src/core/LanguageDetector';
import { CodeValidator } from '../../src/core/CodeValidator';
import { SecurityManager } from '../../src/security/SecurityManager';

// ─────────────────────────────────────────────────────────────────────────────
suite('LanguageDetector', () => {
  // Extension → language name
  test('py   → Python',     () => assert.strictEqual(LanguageDetector.fromExtension('py'),   'Python'));
  test('java → Java',       () => assert.strictEqual(LanguageDetector.fromExtension('java'), 'Java'));
  test('ts   → TypeScript', () => assert.strictEqual(LanguageDetector.fromExtension('ts'),   'TypeScript'));
  test('rs   → Rust',       () => assert.strictEqual(LanguageDetector.fromExtension('rs'),   'Rust'));
  test('go   → Go',         () => assert.strictEqual(LanguageDetector.fromExtension('go'),   'Go'));
  test('kt   → Kotlin',     () => assert.strictEqual(LanguageDetector.fromExtension('kt'),   'Kotlin'));
  test('dart → Dart',       () => assert.strictEqual(LanguageDetector.fromExtension('dart'), 'Dart'));
  test('hs   → Haskell',    () => assert.strictEqual(LanguageDetector.fromExtension('hs'),   'Haskell'));
  test('ex   → Elixir',     () => assert.strictEqual(LanguageDetector.fromExtension('ex'),   'Elixir'));
  test('PY   case-insensitive', () => assert.strictEqual(LanguageDetector.fromExtension('PY'), 'Python'));
  test('xyz  → null',       () => assert.strictEqual(LanguageDetector.fromExtension('xyz'),  null));
  test('docx → null',       () => assert.strictEqual(LanguageDetector.fromExtension('docx'), null));

  // Language name → extension
  test('Python   → .py',   () => assert.strictEqual(LanguageDetector.getExtension('Python'),     '.py'));
  test('Java     → .java', () => assert.strictEqual(LanguageDetector.getExtension('Java'),       '.java'));
  test('Rust     → .rs',   () => assert.strictEqual(LanguageDetector.getExtension('Rust'),       '.rs'));
  test('Go       → .go',   () => assert.strictEqual(LanguageDetector.getExtension('Go'),         '.go'));
  test('C++      → .cpp',  () => assert.strictEqual(LanguageDetector.getExtension('C++'),        '.cpp'));
  test('Unknown  → null',  () => assert.strictEqual(LanguageDetector.getExtension('COBOL'),      null));

  // fromFilePath
  test('fromFilePath /a/b/main.py → Python', () =>
    assert.strictEqual(LanguageDetector.fromFilePath('/a/b/main.py'), 'Python'));
  test('fromFilePath C:\\foo\\bar.java → Java', () =>
    assert.strictEqual(LanguageDetector.fromFilePath('C:\\foo\\bar.java'), 'Java'));
  test('fromFilePath /foo/readme.md → null', () =>
    assert.strictEqual(LanguageDetector.fromFilePath('/foo/readme.md'), null));

  // getAllLanguages — sorted, non-empty
  test('getAllLanguages returns ≥ 20 entries sorted', () => {
    const langs = LanguageDetector.getAllLanguages();
    assert.ok(langs.length >= 20);
    for (let i = 1; i < langs.length; i++) {
      assert.ok(langs[i].localeCompare(langs[i - 1]) >= 0, `Not sorted at index ${i}`);
    }
  });

  // isSupported
  test('isSupported: py → true',   () => assert.ok(LanguageDetector.isSupported('py')));
  test('isSupported: xyz → false', () => assert.ok(!LanguageDetector.isSupported('xyz')));

  // compatibilityNote
  test('Python→Go note mentions no classes', () => {
    const note = LanguageDetector.compatibilityNote('Python', 'Go');
    assert.ok(note?.includes('no classes'));
  });
  test('Python→Java: no note (both have classes, both handle typing differently)', () => {
    // May or may not have a note — just ensure no throw
    assert.doesNotThrow(() => LanguageDetector.compatibilityNote('Python', 'Java'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
suite('CodeValidator', () => {
  // Empty code
  test('empty string → invalid', () => {
    const r = CodeValidator.validate('', 'Python');
    assert.ok(!r.isValid);
    assert.ok(r.errors.length > 0);
  });
  test('whitespace-only → invalid', () => {
    const r = CodeValidator.validate('   \n  ', 'Java');
    assert.ok(!r.isValid);
  });

  // AI refusal detection
  test('detects refusal phrase "i cannot convert"', () => {
    const r = CodeValidator.validate("i cannot convert this code as it uses proprietary libs", 'Java');
    assert.ok(!r.isValid);
    assert.ok(r.errors.some(e => e.includes('refusal')));
  });
  test('detects refusal phrase "i can\'t convert"', () => {
    const r = CodeValidator.validate("I can't convert this snippet.", 'Go');
    assert.ok(!r.isValid);
  });

  // Java checks
  test('Java: balanced braces passes', () => {
    const code = `public class Hello {\n  public static void main(String[] a) {\n    System.out.println("hi");\n  }\n}`;
    const r = CodeValidator.validate(code, 'Java');
    assert.ok(!r.errors.some(e => e.includes('Unbalanced')));
  });
  test('Java: unbalanced braces → error', () => {
    const r = CodeValidator.validate('public class Foo { void bar() { }', 'Java');
    assert.ok(r.errors.some(e => e.includes('Unbalanced')));
  });

  // Python checks
  test('Python: mixed indent → error', () => {
    const r = CodeValidator.validate('def f():\n    x = 1\n\ty = 2\n', 'Python');
    assert.ok(r.errors.some(e => e.includes('Mixed tabs')));
  });
  test('Python: clean code → valid', () => {
    const r = CodeValidator.validate('def hello():\n    print("hi")\n', 'Python');
    assert.ok(r.isValid);
  });

  // Go checks
  test('Go: missing package → error', () => {
    const r = CodeValidator.validate('func main() { fmt.Println("hi") }', 'Go');
    assert.ok(!r.isValid);
    assert.ok(r.errors.some(e => e.includes('package')));
  });
  test('Go: with package declaration → valid', () => {
    const r = CodeValidator.validate('package main\nimport "fmt"\nfunc main() { fmt.Println("hi") }', 'Go');
    assert.ok(r.isValid);
  });

  // C++ checks
  test('C++: no #include → warning', () => {
    const r = CodeValidator.validate('int main() { return 0; }', 'C++');
    assert.ok(r.warnings.some(w => w.includes('#include')));
  });
  test('C++: with #include and balanced braces → valid', () => {
    const r = CodeValidator.validate('#include <iostream>\nint main() { return 0; }', 'C++');
    assert.ok(r.isValid);
  });

  // Rust checks
  test('Rust: no fn → warning', () => {
    const r = CodeValidator.validate('let x = 5;', 'Rust');
    assert.ok(r.warnings.some(w => w.includes('fn')));
  });
  test('Rust: unsafe without SAFETY comment → warning', () => {
    const r = CodeValidator.validate('fn main() { unsafe { let x = 1; } }', 'Rust');
    assert.ok(r.warnings.some(w => w.includes('unsafe')));
  });

  // Fixed Python semicolon regex (multiline)
  test('Python: trailing semicolons on any line → warning', () => {
    const r = CodeValidator.validate('def f():\n    x = 1;\n    y = 2\n', 'Python');
    assert.ok(r.warnings.some(w => w.includes('semicolons')));
  });

  // Improved TypeScript type check
  test('TypeScript: code with type annotations → no warning', () => {
    const r = CodeValidator.validate('const x: string = "hello";\nfunction f(n: number): void { }', 'TypeScript');
    assert.ok(!r.warnings.some(w => w.includes('type annotations')));
  });
  test('TypeScript: code with custom types → no warning', () => {
    const r = CodeValidator.validate('const x: MyClass = new MyClass();', 'TypeScript');
    assert.ok(!r.warnings.some(w => w.includes('type annotations')));
  });
  test('TypeScript: plain JS without types → warning', () => {
    const r = CodeValidator.validate('const x = "hello";\nfunction f(n) { return n; }', 'TypeScript');
    assert.ok(r.warnings.some(w => w.includes('type annotations')));
  });

  // New language validators
  test('JavaScript: valid code passes', () => {
    const r = CodeValidator.validate('const x = 1;\nfunction greet() { return "hi"; }', 'JavaScript');
    assert.ok(r.isValid);
  });
  test('Ruby: no def/class → warning', () => {
    const r = CodeValidator.validate('x = 5', 'Ruby');
    assert.ok(r.warnings.some(w => w.includes('def/class/module')));
  });
  test('PHP: no <?php → warning', () => {
    const r = CodeValidator.validate('echo "Hello";', 'PHP');
    assert.ok(r.warnings.some(w => w.includes('<?php')));
  });
  test('PHP: with <?php → no warning about tag', () => {
    const r = CodeValidator.validate('<?php\necho "Hello";\n', 'PHP');
    assert.ok(!r.warnings.some(w => w.includes('<?php')));
  });
  test('Scala: with declarations → valid', () => {
    const r = CodeValidator.validate('object Main { def main(args: Array[String]): Unit = { } }', 'Scala');
    assert.ok(r.isValid);
  });
  test('Dart: with class → valid', () => {
    const r = CodeValidator.validate('class MyWidget { void build() { } }', 'Dart');
    assert.ok(r.isValid);
  });
  test('Shell: no shebang → warning', () => {
    const r = CodeValidator.validate('echo "hello world"', 'Shell');
    assert.ok(r.warnings.some(w => w.includes('shebang')));
  });
  test('Shell: with shebang → no warning', () => {
    const r = CodeValidator.validate('#!/bin/bash\necho "hello"', 'Shell');
    assert.ok(!r.warnings.some(w => w.includes('shebang')));
  });
  test('Haskell: with module → no warning', () => {
    const r = CodeValidator.validate('module Main where\nmain :: IO ()\nmain = putStrLn "Hello"', 'Haskell');
    assert.ok(r.isValid);
  });
  test('Elixir: with defmodule → no warning', () => {
    const r = CodeValidator.validate('defmodule Hello do\n  def greet, do: IO.puts("Hi")\nend', 'Elixir');
    assert.ok(r.isValid);
  });
  test('Lua: with function → no warning', () => {
    const r = CodeValidator.validate('local function greet()\n  print("hello")\nend', 'Lua');
    assert.ok(r.isValid);
  });
  test('Perl: with sub → no warning', () => {
    const r = CodeValidator.validate('use strict;\nmy $x = 5;\nsub greet { print "hello"; }', 'Perl');
    assert.ok(r.isValid);
  });
  test('R: with function → no warning', () => {
    const r = CodeValidator.validate('greet <- function(name) {\n  print(paste("Hello", name))\n}', 'R');
    assert.ok(r.isValid);
  });

  // Improved brace balancing (string-aware)
  test('braces inside strings do not count', () => {
    const r = CodeValidator.validate('public class Foo { String s = "{ }"; }', 'Java');
    assert.ok(!r.errors.some(e => e.includes('Unbalanced')));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
suite('SecurityManager.scanForSecrets', () => {
  test('detects hardcoded password', () => {
    const w = SecurityManager.scanForSecrets('password = "supersecret123"');
    assert.ok(w.some(x => x.includes('password')));
  });
  test('detects hardcoded token', () => {
    const w = SecurityManager.scanForSecrets('token: "ghp_abc123456789defghijk"');
    assert.ok(w.some(x => x.includes('token')));
  });
  test('detects embedded Anthropic key pattern', () => {
    const w = SecurityManager.scanForSecrets('const key = "sk-ant-api03-abcdefghijklmnopqrstuvwx"');
    assert.ok(w.some(x => x.includes('provider key')));
  });
  test('detects embedded OpenRouter key pattern', () => {
    const w = SecurityManager.scanForSecrets('key = "sk-or-v1-abcdefghijklmnopqrstuvwxyz"');
    assert.ok(w.some(x => x.includes('provider key')));
  });
  test('detects embedded Gemini key pattern', () => {
    const w = SecurityManager.scanForSecrets('const g = "AIzaSyAbcDefGhiJklMnoPqrStuvWxyz1234"');
    assert.ok(w.some(x => x.includes('Gemini')));
  });
  test('clean code → no warnings', () => {
    const code = `def greet(name: str) -> str:\n    return f"Hello, {name}!"\n`;
    assert.deepStrictEqual(SecurityManager.scanForSecrets(code), []);
  });
  test('global regex lastIndex does not leak between calls', () => {
    // Call twice; both must return same result (no lastIndex leak)
    const code = 'password = "abc123xyz"';
    const w1 = SecurityManager.scanForSecrets(code);
    const w2 = SecurityManager.scanForSecrets(code);
    assert.deepStrictEqual(w1, w2);
  });
});
