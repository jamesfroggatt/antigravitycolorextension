// Takes real screenshots of Antigravity IDE with the extension running, for the README.
// Launches a throwaway Antigravity window per scenario (your own profile is never touched),
// photographs it over the Chrome DevTools protocol, then builds the README images in media/.
//
// Usage: npm run screenshots
import { Resvg } from '@resvg/resvg-js';
import { runTests } from '@vscode/test-electron';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const work = path.join(root, '.vscode-test', 'shots');
// Demo projects live outside this repo so the IDE shows their own clean git state.
const demos = path.join(os.tmpdir(), 'workspace-identity-demos');
const media = path.join(root, 'media');
const exe = path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Antigravity IDE', 'Antigravity IDE.exe');
const PORT = 9333;
const W = 1400;
const H = 860;

// Inherited from VS Code terminals; would start the IDE as plain Node.
delete process.env.ELECTRON_RUN_AS_NODE;

const SAMPLES = {
  'server.ts': `import { createServer } from 'node:http';
import { verifySignature } from './security/hmac';

// Payments webhook – production
export async function handleWebhook(req: Request): Promise<Response> {
  const sig = req.headers.get('x-signature');
  if (!sig || !verifySignature(await req.text(), sig)) {
    return new Response('Unauthorized', { status: 401 });
  }
  return Response.json({ received: true, timestamp: Date.now() });
}

createServer().listen(4000);
`,
  'CheckoutPage.tsx': `import { useCart } from '../hooks/useCart';
import { Button } from '../components/Button';

export function CheckoutPage() {
  const { items, total } = useCart();
  return (
    <main className="checkout">
      <h1>Checkout</h1>
      {items.map((item) => (
        <p key={item.id}>{item.name}</p>
      ))}
      <Button>Pay £{total.toFixed(2)}</Button>
    </main>
  );
}
`,
  'tokenValidator.ts': `import { jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

export async function validateToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret);
    return { ok: true, userId: payload.sub };
  } catch {
    return { ok: false };
  }
}
`,
};

const scenarios = [
  { folder: 'payments-api', file: 'server.ts', preset: 'builtin:crimson', label: 'Payments API [prod]', panel: true },
  { folder: 'storefront-web', file: 'CheckoutPage.tsx', preset: 'builtin:cobalt', label: 'Storefront UI [staging]', panel: false },
  { folder: 'auth-worker', file: 'tokenValidator.ts', preset: 'builtin:emerald', label: 'Auth Worker [dev]', panel: false },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(check, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) return;
    await sleep(250);
  }
  throw new Error('Timed out waiting for the IDE');
}

/** A tidy demo project: one source file, a clean `main` branch, no error squiggles. */
function makeDemoProject(sc) {
  const ws = path.join(demos, sc.folder);
  rmSync(ws, { recursive: true, force: true });
  mkdirSync(path.join(ws, 'src'), { recursive: true });
  mkdirSync(path.join(ws, '.vscode'), { recursive: true });
  writeFileSync(path.join(ws, 'src', sc.file), SAMPLES[sc.file]);
  // The demo files have no node_modules, so switch off type checking to avoid red squiggles.
  writeFileSync(
    path.join(ws, '.vscode', 'settings.json'),
    JSON.stringify(
      {
        'typescript.validate.enable': false,
        'javascript.validate.enable': false,
        'editor.minimap.enabled': false,
        'editor.lightbulb.enabled': 'off',
      },
      null,
      2,
    ),
  );
  const git = (...args) => execFileSync('git', ['-c', 'user.name=Demo', '-c', 'user.email=demo@example.com', ...args], { cwd: ws });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'Initial commit');
  // Our colours are written to settings.json after this commit; hide that from git so the demo stays clean.
  writeFileSync(path.join(ws, '.git', 'info', 'exclude'), '/.vscode/settings.json\n');
  git('update-index', '--assume-unchanged', '.vscode/settings.json');
  return ws;
}

/** Hides IDE chrome that isn't part of this extension (test-mode banners, Antigravity's own monitors). */
async function tidy(page) {
  await page.evaluate(() => {
    const hide = (el) => el && el.style.setProperty('display', 'none', 'important');
    for (const t of document.querySelectorAll('.window-title')) {
      t.textContent = (t.textContent ?? '').replace('[Extension Development Host] ', '');
    }
    hide(document.querySelector('.notifications-toasts'));
    for (const item of document.querySelectorAll('.statusbar-item')) {
      if (/Mem:|Analyzing|Initializing/.test(item.textContent ?? '')) hide(item);
    }
    // Antigravity's "View Changelog" pill in the title bar.
    const candidates = [...document.querySelectorAll('.titlebar *')].filter(
      (el) => (el.textContent ?? '').trim().startsWith('View Changelog') && el.getBoundingClientRect().width < 220,
    );
    candidates.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
    hide(candidates[0]);
  });
  await sleep(300);
}

async function capture(sc) {
  const ws = makeDemoProject(sc);
  const ready = path.join(work, `${sc.folder}.ready`);
  const done = path.join(work, `${sc.folder}.done`);
  rmSync(ready, { force: true });
  rmSync(done, { force: true });

  let failure;
  const run = runTests({
    vscodeExecutablePath: exe,
    extensionDevelopmentPath: root,
    extensionTestsPath: path.join(root, 'scripts', 'screenshots', 'inside.cjs'),
    extensionTestsEnv: { WI_SHOT: JSON.stringify({ ...sc, ready, done }) },
    launchArgs: [
      ws,
      '--disable-extensions',
      `--user-data-dir=${path.join(work, 'user-data')}`,
      `--extensions-dir=${path.join(work, 'extensions')}`,
      `--remote-debugging-port=${PORT}`,
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-workspace-trust',
    ],
  }).catch((err) => {
    failure = err;
  });

  try {
    await waitFor(() => existsSync(ready) || failure !== undefined, 120000);
    if (failure) throw failure;

    const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
    const pages = await browser.pages();
    const page = pages.find((p) => p.url().includes('workbench')) ?? pages[0];
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
    await page.bringToFront();
    await sleep(4000);
    await tidy(page);

    const icon = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.action-item [aria-label], .action-item[aria-label], a[aria-label]')].find((e) =>
        /^Workspace Identity/.test(e.getAttribute('aria-label') ?? ''),
      );
      if (!el) return null;
      const r = (el.closest('.action-item') ?? el).getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const file = path.join(work, `${sc.folder}.png`);
    await page.screenshot({ path: file });
    await browser.disconnect();
    console.log(`captured ${sc.folder}${icon ? ` (icon at ${Math.round(icon.x)},${Math.round(icon.y)})` : ''}`);
    return { file, icon };
  } finally {
    writeFileSync(done, '');
    await run;
  }
}

// ---- Image composition (SVG → PNG via resvg) -----------------------------------

const dataUri = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;

function render(svg, outFile, width) {
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' },
  })
    .render()
    .asPng();
  writeFileSync(outFile, png);
  console.log(`wrote ${path.relative(root, outFile)} (${Math.round(png.length / 1024)} KB)`);
}

function heroImage(shot) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <image href="${dataUri(shot.file)}" width="${W}" height="${H}"/>
  </svg>`;
  render(svg, path.join(media, 'screenshot-window.png'), 1400);
}

function howToOpenImage(shot) {
  if (!shot.icon) {
    console.warn('Could not find the Workspace Identity icon; skipping how-to-open image.');
    return;
  }
  const { x, y, w, h } = shot.icon;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const crop = { x: 0, y: 0, w: Math.min(W, Math.max(520, cx + 230)), h: Math.min(H, cy + 300) };
  const scale = 2;
  const outW = crop.w * scale;
  const outH = crop.h * scale;
  const labelX = Math.min(cx + 34, crop.w - 200);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 ${crop.w} ${crop.h}">
    <svg x="0" y="0" width="${crop.w}" height="${crop.h}" viewBox="${crop.x} ${crop.y} ${crop.w} ${crop.h}">
      <image href="${dataUri(shot.file)}" width="${W}" height="${H}"/>
    </svg>
    <circle cx="${cx}" cy="${cy}" r="${Math.max(w, h) * 0.75}" fill="none" stroke="#FACC15" stroke-width="3"/>
    <path d="M ${labelX - 4} ${cy + 38} L ${cx + 12} ${cy + 14}" stroke="#FACC15" stroke-width="3" stroke-linecap="round"/>
    <rect x="${labelX - 8}" y="${cy + 36}" width="196" height="44" rx="8" fill="#FACC15"/>
    <text x="${labelX + 4}" y="${cy + 55}" font-family="Segoe UI" font-weight="700" font-size="15" fill="#111827">Click this icon to open</text>
    <text x="${labelX + 4}" y="${cy + 73}" font-family="Segoe UI" font-weight="400" font-size="13" fill="#111827">the Workspace Identity panel</text>
  </svg>`;
  render(svg, path.join(media, 'how-to-open.png'), outW);
}

function windowsImage(shots) {
  // Three windows cascaded like a busy desktop.
  const scale = 0.62;
  const ww = W * scale;
  const wh = H * scale;
  const step = { x: 150, y: 70 };
  const cw = ww + step.x * 2 + 60;
  const ch = wh + step.y * 2 + 60;
  const order = [shots[2], shots[1], shots[0]]; // back to front
  const parts = order
    .map((s, i) => {
      const x = 30 + (2 - i) * step.x;
      const y = 30 + i * step.y;
      return `<rect x="${x + 6}" y="${y + 10}" width="${ww}" height="${wh}" rx="8" fill="#000" opacity="0.45" filter="url(#blur)"/>
        <svg x="${x}" y="${y}" width="${ww}" height="${wh}" viewBox="0 0 ${W} ${H}">
          <image href="${dataUri(s.file)}" width="${W}" height="${H}"/>
        </svg>`;
    })
    .join('\n');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}" viewBox="0 0 ${cw} ${ch}">
    <defs><filter id="blur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="10"/></filter></defs>
    <rect width="${cw}" height="${ch}" rx="14" fill="#0B0E14"/>
    ${parts}
  </svg>`;
  render(svg, path.join(media, 'screenshot-windows.png'), Math.round(cw * 1.4));
}

// ---- Main ----------------------------------------------------------------------

if (!existsSync(exe)) {
  console.error(`Antigravity IDE not found at ${exe}`);
  process.exit(1);
}
mkdirSync(work, { recursive: true });
const shots = [];
for (const sc of scenarios) shots.push(await capture(sc));
heroImage(shots[0]);
howToOpenImage(shots[0]);
windowsImage(shots);
