import * as fs from 'fs';
import * as path from 'path';
import Mocha from 'mocha';

function collectTests(dir: string, tests: string[] = []): string[] {
  if (!fs.existsSync(dir)) return tests;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTests(fullPath, tests);
    } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
      tests.push(fullPath);
    }
  }

  return tests;
}

export function run(): Promise<void> {
  const mocha = new Mocha({
    color: true,
    ui: 'tdd',
  });

  const testsRoot = path.resolve(__dirname, '..', 'unit');
  const tests = collectTests(testsRoot);
  console.log(`LangShift test runner: loading ${tests.length} test file(s) from ${testsRoot}`);

  for (const testFile of tests) {
    mocha.addFile(testFile);
  }

  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} test(s) failed.`));
      } else {
        resolve();
      }
    });
  });
}
