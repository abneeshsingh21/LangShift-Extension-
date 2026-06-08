import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runTests, TestOptions } from '@vscode/test-electron';

function localVSCodeCli(): string | undefined {
  if (process.env.VSCODE_TEST_EXECUTABLE) return process.env.VSCODE_TEST_EXECUTABLE;
  if (process.platform !== 'win32') return undefined;

  const candidate = path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd');
  return fs.existsSync(candidate) ? candidate : undefined;
}

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '..', '..');
  const extensionTestsPath = path.resolve(__dirname, 'suite', 'index.js');
  const testWorkspace = path.join(extensionDevelopmentPath, '.vscode-test', 'workspace');

  fs.mkdirSync(testWorkspace, { recursive: true });

  const options: TestOptions = {
    extensionDevelopmentPath,
    extensionTestsPath,
    extensionTestsEnv: {
      LANGSHIFT_TEST: '1',
    },
    launchArgs: [testWorkspace],
  };

  const executable = localVSCodeCli();
  if (executable) {
    options.vscodeExecutablePath = executable;
  } else {
    options.version = '1.85.0';
  }

  await runTests(options);
}

main().catch((error) => {
  console.error('Failed to run LangShift tests:', error);
  process.exit(1);
});
