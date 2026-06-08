import * as assert from 'assert';

// Test import extraction logic directly (without filesystem access)
suite('ContextCollector — Import Extraction', () => {
  // Replicate the extraction logic for testing
  function extractImports(code: string, lang: string): string[] {
    const imports: string[] = [];
    const lines = code.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      switch (lang) {
        case 'Python': {
          const fromMatch = trimmed.match(/^from\s+(\.{0,2}\w[\w.]*)\s+import/);
          if (fromMatch) imports.push(fromMatch[1]);
          const impMatch = trimmed.match(/^import\s+(\.{0,2}\w[\w.]*)/);
          if (impMatch && !impMatch[1].startsWith('__')) imports.push(impMatch[1]);
          break;
        }
        case 'JavaScript':
        case 'TypeScript': {
          const esMatch = trimmed.match(/(?:import|export).*from\s+['"](\.{1,2}\/[^'"]+)['"]/);
          if (esMatch) imports.push(esMatch[1]);
          const reqMatch = trimmed.match(/require\(['"](\.{1,2}\/[^'"]+)['"]\)/);
          if (reqMatch) imports.push(reqMatch[1]);
          break;
        }
        case 'Java': {
          const jMatch = trimmed.match(/^import\s+[\w.]+\.(\w+)\s*;?/);
          if (jMatch) imports.push(jMatch[1]);
          break;
        }
        case 'C': case 'C++': {
          const cMatch = trimmed.match(/^#include\s+"([^"]+)"/);
          if (cMatch) imports.push(cMatch[1]);
          break;
        }
        case 'Rust': {
          const rustMatch = trimmed.match(/^(?:use|mod)\s+(\w+)/);
          if (rustMatch) imports.push(rustMatch[1]);
          break;
        }
        case 'Ruby': {
          const rbMatch = trimmed.match(/^require(?:_relative)?\s+['"](.+)['"]/);
          if (rbMatch) imports.push(rbMatch[1]);
          break;
        }
        case 'Go': {
          const goMatch = trimmed.match(/^\s*"(\.\/.+)"/);
          if (goMatch) imports.push(goMatch[1]);
          break;
        }
      }
    }
    return [...new Set(imports)];
  }

  test('Python: from X import Y', () => {
    assert.deepStrictEqual(extractImports('from utils import helper', 'Python'), ['utils']);
  });

  test('Python: import X', () => {
    assert.deepStrictEqual(extractImports('import os\nimport mymodule', 'Python'), ['os', 'mymodule']);
  });

  test('Python: relative import', () => {
    assert.deepStrictEqual(extractImports('from .utils import foo', 'Python'), ['.utils']);
  });

  test('Python: skips __future__', () => {
    assert.deepStrictEqual(extractImports('import __future__', 'Python'), []);
  });

  test('JavaScript: ES import', () => {
    assert.deepStrictEqual(extractImports("import { foo } from './utils'", 'JavaScript'), ['./utils']);
  });

  test('JavaScript: require', () => {
    assert.deepStrictEqual(extractImports("const x = require('./helper')", 'JavaScript'), ['./helper']);
  });

  test('TypeScript: import from', () => {
    assert.deepStrictEqual(extractImports("import { Bar } from '../models/Bar'", 'TypeScript'), ['../models/Bar']);
  });

  test('Java: import statement', () => {
    assert.deepStrictEqual(extractImports('import com.example.MyClass;', 'Java'), ['MyClass']);
  });

  test('C++: quoted include', () => {
    assert.deepStrictEqual(extractImports('#include "myheader.h"', 'C++'), ['myheader.h']);
  });

  test('C++: ignores angle bracket includes', () => {
    assert.deepStrictEqual(extractImports('#include <iostream>', 'C++'), []);
  });

  test('Rust: use statement', () => {
    assert.deepStrictEqual(extractImports('use mymod;', 'Rust'), ['mymod']);
  });

  test('Rust: mod statement', () => {
    assert.deepStrictEqual(extractImports('mod utils;', 'Rust'), ['utils']);
  });

  test('Ruby: require_relative', () => {
    assert.deepStrictEqual(extractImports("require_relative 'lib/helper'", 'Ruby'), ['lib/helper']);
  });

  test('Go: relative import', () => {
    assert.deepStrictEqual(extractImports('  "./utils"', 'Go'), ['./utils']);
  });

  test('deduplicates imports', () => {
    const code = "import os\nimport os";
    assert.deepStrictEqual(extractImports(code, 'Python'), ['os']);
  });

  test('empty code returns empty', () => {
    assert.deepStrictEqual(extractImports('', 'Python'), []);
  });

  test('non-import code returns empty', () => {
    assert.deepStrictEqual(extractImports('x = 1 + 2', 'Python'), []);
  });
});
