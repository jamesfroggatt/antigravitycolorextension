// Runs inside the IDE's extension host. Drives the real extension and checks settings.json.
const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Same maths as src/shared/color.ts – kept separate so the test checks real output. */
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

async function poll(check, timeoutMs = 4000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    try {
      return check();
    } catch (err) {
      last = err;
    }
    await wait(100);
  }
  throw last;
}

exports.run = async function run() {
  const lines = [`IDE: ${vscode.env.appName} ${vscode.version}`];
  let failed = false;
  const step = async (name, fn) => {
    try {
      await fn();
      lines.push(`PASS  ${name}`);
    } catch (err) {
      failed = true;
      lines.push(`FAIL  ${name}\n      ${String(err && err.message).split('\n').join('\n      ')}`);
    }
  };

  const ext = vscode.extensions.getExtension('jamesfroggatt.workspace-identity');
  const api = await ext.activate();
  const controller = api.controller;
  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const settingsPath = path.join(folder, '.vscode', 'settings.json');
  const settings = () => JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const colors = () => settings()['workbench.colorCustomizations'] || {};
  const profile = () => JSON.parse(JSON.stringify(controller.initState().profile));

  await step('"Open Panel" opens the sidebar panel and its script fully loads', async () => {
    // READY is the last thing the panel script sends, so receiving it proves the page loaded
    // its CSS/JS under the security policy and ran without errors.
    let readies = 0;
    const original = controller.handle.bind(controller);
    controller.handle = (msg) => {
      if (msg && msg.type === 'READY') readies++;
      return original(msg);
    };
    await vscode.commands.executeCommand('workspaceIdentity.openPanel');
    await poll(() => assert.ok(readies > 0, 'panel never reported READY'), 15000);
  });

  await step('starts with no identity (panel would read the theme)', async () => {
    assert.equal(controller.initState().profile, null);
    assert.equal(controller.initState().hasFolder, true);
  });

  await step('applying the Crimson preset writes all 24 frame + surface keys', async () => {
    await vscode.commands.executeCommand('workspaceIdentity.applyPreset', 'builtin:crimson');
    const cc = colors();
    assert.equal(cc['titleBar.activeBackground'], hslToHex(0, 70, 36));
    assert.equal(cc['editor.background'], hslToHex(0, 26, 8));
    assert.equal(cc['sideBar.background'], hslToHex(0, 26, 11));
    assert.equal(cc['terminal.background'], hslToHex(0, 26, 6));
    assert.equal(Object.keys(cc).length, 25, `got ${Object.keys(cc).length} keys`);
  });

  await step('unrelated settings and colours are kept', async () => {
    assert.equal(settings()['editor.fontSize'], 14);
    assert.equal(colors()['editorCursor.foreground'], '#FF00FF');
    assert.equal('window.titleBarStyle' in settings(), false, 'must never write titleBarStyle to the workspace');
    assert.equal('window.title' in settings(), false, 'no label yet, so no title');
  });

  await step('a title label writes window.title with ${appName} and an em-dash separator', async () => {
    const p = profile();
    p.title.label = 'Payments API [prod]';
    await controller.handle({ type: 'UPDATE_TITLE', profile: p });
    await poll(() => {
      const s = settings();
      assert.equal(s['window.title'], '██  PAYMENTS API [PROD]  ██${separator}${dirty}${activeEditorShort}${separator}${appName}');
      assert.equal(s['window.titleSeparator'], ' — ');
    });
  });

  await step('40 rapid slider updates finish on the last value', async () => {
    const p = profile();
    for (let l = 20; l <= 60; l++) {
      p.frame.l = l;
      void controller.handle({ type: 'UPDATE_FRAME_COLORS', profile: JSON.parse(JSON.stringify(p)) });
    }
    await poll(() => assert.equal(colors()['titleBar.activeBackground'], hslToHex(0, 70, 60)));
    await wait(600);
    assert.equal(colors()['titleBar.activeBackground'], hslToHex(0, 70, 60));
  });

  await step('switching a zone off removes only its keys', async () => {
    const p = profile();
    p.frame.zones.statusBar = false;
    await controller.handle({ type: 'UPDATE_FRAME_COLORS', profile: p });
    await poll(() => {
      assert.equal('statusBar.background' in colors(), false);
      assert.equal('statusBar.foreground' in colors(), false);
      assert.ok(colors()['activityBar.background']);
    });
  });

  await step('surface lightness is clamped to the 4–32% safe range', async () => {
    const p = profile();
    p.surface.l = 90;
    p.surface.s = 0;
    await controller.handle({ type: 'UPDATE_SURFACE_COLORS', profile: p });
    await poll(() => assert.equal(colors()['editor.background'], hslToHex(0, 0, 32)));
  });

  await step('hand-editing settings.json moves the sliders (and is not overwritten)', async () => {
    await wait(700); // let our own writes settle
    const s = settings();
    s['workbench.colorCustomizations']['titleBar.activeBackground'] = '#1D4FB0';
    fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2));
    await poll(() => {
      const f = controller.initState().profile.frame;
      assert.ok(Math.abs(f.h - 220) <= 2, `hue ${f.h}`);
    }, 6000);
    await wait(800);
    assert.equal(colors()['titleBar.activeBackground'], '#1D4FB0');
  });

  await step('status bar pill can be toggled from the panel', async () => {
    const p = profile();
    p.title.statusPill = false;
    await controller.handle({ type: 'UPDATE_TITLE', profile: p });
    p.title.statusPill = true;
    await controller.handle({ type: 'UPDATE_TITLE', profile: p });
  });

  await step('saved presets appear in the list and can be deleted', async () => {
    await controller.handle({ type: 'SAVE_PRESET', name: 'Integration Test', profile: profile() });
    const saved = controller.initState().presets.find((x) => x.name === 'Integration Test');
    assert.ok(saved && !saved.builtIn);
    await controller.handle({ type: 'DELETE_PRESET', id: saved.id });
    assert.equal(controller.initState().presets.some((x) => x.name === 'Integration Test'), false);
  });

  await step('Clean-Git hides .vscode/settings.json from git status, and undoes cleanly', async () => {
    const status = () => execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: folder, encoding: 'utf8' });
    assert.match(status(), /\.vscode\/settings\.json/);
    await controller.handle({ type: 'SET_CLEAN_GIT', enabled: true });
    assert.doesNotMatch(status(), /\.vscode\/settings\.json/);
    assert.equal(controller.initState().cleanGit, true);
    await controller.handle({ type: 'SET_CLEAN_GIT', enabled: false });
    assert.match(status(), /\.vscode\/settings\.json/);
    const exclude = fs.readFileSync(path.join(folder, '.git', 'info', 'exclude'), 'utf8');
    assert.doesNotMatch(exclude, /Workspace Identity/);
  });

  await step('reset strips every managed key and our title, keeps everything else', async () => {
    await wait(600);
    await vscode.commands.executeCommand('workspaceIdentity.reset', true);
    const s = settings();
    assert.deepEqual(s['workbench.colorCustomizations'], { 'editorCursor.foreground': '#FF00FF' });
    assert.equal('window.title' in s, false);
    assert.equal('window.titleSeparator' in s, false);
    assert.equal(s['editor.fontSize'], 14);
    assert.equal(controller.initState().profile, null);
  });

  await step('reset removes colorCustomizations entirely when only our keys were there', async () => {
    const s = settings();
    delete s['workbench.colorCustomizations'];
    fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2));
    await wait(800);
    await vscode.commands.executeCommand('workspaceIdentity.applyPreset', 'builtin:emerald');
    assert.ok(colors()['titleBar.activeBackground']);
    await vscode.commands.executeCommand('workspaceIdentity.reset', true);
    assert.equal('workbench.colorCustomizations' in settings(), false);
  });

  const report = lines.join('\n');
  if (process.env.WI_RESULTS) fs.writeFileSync(process.env.WI_RESULTS, report);
  console.log(report);
  if (failed) throw new Error('Integration tests failed');
};
