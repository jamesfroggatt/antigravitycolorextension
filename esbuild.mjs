// Builds the two bundles the extension needs:
//   dist/extension.js  – runs inside the IDE (Node, CommonJS)
//   dist/webview.js    – runs inside the sidebar panel (browser, IIFE)
// and copies the panel's CSS and the codicon font next to them.
import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const common = {
  bundle: true,
  minify: production,
  sourcemap: production ? false : 'linked',
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions} */
const extensionBuild = {
  ...common,
  entryPoints: ['src/host/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
};

/** @type {import('esbuild').BuildOptions} */
const webviewBuild = {
  ...common,
  entryPoints: ['src/webview/main.ts'],
  outfile: 'dist/webview.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
};

function copyStatic() {
  mkdirSync('dist/codicons', { recursive: true });
  copyFileSync('src/webview/styles.css', 'dist/webview.css');
  copyFileSync('node_modules/@vscode/codicons/dist/codicon.css', 'dist/codicons/codicon.css');
  copyFileSync('node_modules/@vscode/codicons/dist/codicon.ttf', 'dist/codicons/codicon.ttf');
}

/** Re-copies static files whenever esbuild finishes a rebuild in watch mode. */
const copyStaticPlugin = {
  name: 'copy-static',
  setup(build) {
    build.onEnd(() => {
      try {
        copyStatic();
      } catch (err) {
        console.error('[copy-static]', err);
      }
    });
  },
};

if (watch) {
  const ctxs = await Promise.all([
    esbuild.context(extensionBuild),
    esbuild.context({ ...webviewBuild, plugins: [copyStaticPlugin] }),
  ]);
  await Promise.all(ctxs.map((c) => c.watch()));
  console.log('[watch] watching for changes…');
} else {
  await Promise.all([esbuild.build(extensionBuild), esbuild.build(webviewBuild)]);
  copyStatic();
}
