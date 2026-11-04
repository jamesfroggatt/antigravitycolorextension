// Launches a real IDE (Antigravity by default, or VS Code with WI_IDE=vscode) with a throwaway
// profile and sample workspace, runs suite.cjs inside it, and reports the results.
// Usage: npm run test:integration          (Antigravity IDE)
//        set WI_IDE=vscode&& npm run test:integration
import { runTests } from '@vscode/test-electron';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const scratch = path.join(root, '.vscode-test');
const workspace = path.join(scratch, 'workspace');
const userData = path.join(scratch, 'user-data');
const extensionsDir = path.join(scratch, 'extensions');
const resultsFile = path.join(scratch, 'results.txt');

const local = process.env.LOCALAPPDATA ?? '';
const executables = {
  antigravity: path.join(local, 'Programs', 'Antigravity IDE', 'Antigravity IDE.exe'),
  vscode: path.join(local, 'Programs', 'Microsoft VS Code', 'Code.exe'),
};
const ide = process.env.WI_IDE === 'vscode' ? 'vscode' : 'antigravity';
const exe = executables[ide];
if (!existsSync(exe)) {
  console.error(`Can't find ${ide} at ${exe}`);
  process.exit(1);
}

// Fresh sample workspace with some settings that must survive untouched.
rmSync(workspace, { recursive: true, force: true });
rmSync(resultsFile, { force: true });
mkdirSync(path.join(workspace, '.vscode'), { recursive: true });
writeFileSync(
  path.join(workspace, '.vscode', 'settings.json'),
  JSON.stringify({ 'editor.fontSize': 14, 'workbench.colorCustomizations': { 'editorCursor.foreground': '#FF00FF' } }, null, 2),
);
writeFileSync(path.join(workspace, 'server.ts'), 'export const hello = "world";\n');
execFileSync('git', ['init', '-q'], { cwd: workspace });

// When launched from a terminal inside VS Code this is inherited and would start the IDE as plain Node.
delete process.env.ELECTRON_RUN_AS_NODE;

console.log(`Running integration tests in ${ide} (${exe})`);
let exitCode = 0;
try {
  await runTests({
    vscodeExecutablePath: exe,
    extensionDevelopmentPath: root,
    extensionTestsPath: path.join(root, 'test', 'integration', 'suite.cjs'),
    extensionTestsEnv: { WI_RESULTS: resultsFile },
    launchArgs: [
      workspace,
      '--disable-extensions',
      `--user-data-dir=${userData}`,
      `--extensions-dir=${extensionsDir}`,
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-workspace-trust',
    ],
  });
} catch (err) {
  exitCode = 1;
  console.error('Test run failed:', err instanceof Error ? err.message : err);
}
if (existsSync(resultsFile)) console.log(readFileSync(resultsFile, 'utf8'));
process.exit(exitCode);
