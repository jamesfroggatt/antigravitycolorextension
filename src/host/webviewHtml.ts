// Static markup for the sidebar panel. Behaviour lives in src/webview/main.ts.
import * as vscode from 'vscode';

function nonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

const slider = (id: string, label: string, min: number, max: number, extraClass = '') => `
  <div class="slider">
    <div class="slider-label"><label for="${id}">${label}</label><span class="val mono" id="${id}Val"></span></div>
    <input type="range" id="${id}" min="${min}" max="${max}" step="1" class="${extraClass}">
  </div>`;

const check = (id: string, label: string, title = '') =>
  `<label class="check"${title ? ` title="${title}"` : ''}><input type="checkbox" id="${id}"><span>${label}</span></label>`;

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const uri = (...p: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', ...p));
  const n = nonce();
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
    `img-src ${webview.cspSource} data:`,
    `script-src 'nonce-${n}'`,
  ].join('; ');

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${uri('codicons', 'codicon.css')}">
  <link rel="stylesheet" href="${uri('webview.css')}">
  <title>Workspace Identity</title>
</head>
<body>
  <div id="noFolder" class="banner" hidden>
    <i class="codicon codicon-info"></i>
    <span>Open a folder to give this window its own identity.</span>
  </div>

  <div id="notice" class="notice" hidden role="status" aria-live="polite">
    <i id="noticeIcon" class="codicon codicon-info"></i>
    <span id="noticeText"></span>
    <button id="noticeClose" class="icon-btn" type="button" aria-label="Dismiss"><i class="codicon codicon-close"></i></button>
  </div>

  <fieldset id="controls" class="controls">
    <div class="topline">
      <span class="eyebrow">This window</span>
      <span id="folderBadge" class="badge mono"></span>
    </div>

    <!-- CARD 1: header title & prominence -->
    <section class="card" aria-labelledby="h-title">
      <header class="card-head">
        <h2 id="h-title"><i class="codicon codicon-text-size"></i>1. Header Title</h2>
      </header>
      <input id="titleInput" type="text" class="text-input mono" maxlength="60" spellcheck="false" autocomplete="off"
             placeholder="Workspace name…" aria-label="Workspace name shown in the title bar">
      <div class="style-grid" role="group" aria-label="Title style">
        <button type="button" class="style-btn mono" data-style="block">██ BLOCK ██</button>
        <button type="button" class="style-btn mono" data-style="brackets">【 BRACKET 】</button>
        <button type="button" class="style-btn mono" data-style="spaced">W I D E</button>
        <button type="button" class="style-btn mono" data-style="chevrons">⟫⟫ CHEVRON ⟪⟪</button>
      </div>
      <div id="titlePreview" class="preview mono" title="Roughly how the title bar will read"></div>
      <div class="row split divider">
        ${check('forceUpper', 'Force ALL CAPS')}
        ${check('statusPill', 'Status bar pill', 'Show the name at the far left of the status bar')}
      </div>
    </section>

    <!-- CARD 2: outer frame -->
    <section class="card" aria-labelledby="h-frame">
      <header class="card-head">
        <h2 id="h-frame"><i class="codicon codicon-window"></i>2. Outer Frame</h2>
        <span class="hex mono"><span id="frameSwatch" class="swatch"></span><span id="frameHex"></span></span>
      </header>
      ${slider('frameH', 'Hue', 0, 360, 'track-rainbow')}
      ${slider('frameS', 'Saturation', 0, 100)}
      ${slider('frameL', 'Lightness', 12, 85)}
      <div class="zones divider">
        ${check('zTitleBar', 'Title bar')}
        ${check('zWindowBorder', 'Window border')}
        ${check('zActivityBar', 'Activity bar')}
        ${check('zStatusBar', 'Status bar')}
      </div>
    </section>

    <!-- CARD 3: inner surfaces ("the grays") -->
    <section class="card accent" aria-labelledby="h-surface">
      <header class="card-head">
        <h2 id="h-surface"><i class="codicon codicon-layout"></i>3. Inner Surfaces</h2>
        <span class="hex mono"><span id="surfaceSwatch" class="swatch"></span><span id="surfaceHex"></span></span>
      </header>
      <p class="hint">The grays behind the <strong>code editor</strong>, <strong>Claude Code</strong>, <strong>sidebars</strong> and <strong>terminal</strong>.</p>
      <div id="lightThemeNote" class="note" hidden>
        <i class="codicon codicon-warning"></i>
        <span>These grays are made for dark themes. With a light theme, text may be hard to read.</span>
      </div>
      <div class="chip-grid">
        <button type="button" class="chip" data-gray="oled">OLED Black</button>
        <button type="button" class="chip" data-gray="neutral">Pure Gray</button>
        <button type="button" class="chip" data-gray="tinted">Theme Tint</button>
        <button type="button" class="chip" data-gray="slate">Lighter Gray</button>
      </div>
      <div class="row split divider">
        ${check('linkHue', 'Match hue to header')}
        <span id="hueStatus" class="mono muted small"></span>
      </div>
      ${slider('surfaceH', 'Undertone hue', 0, 360, 'track-rainbow')}
      ${slider('surfaceL', 'Gray level (darkness)', 4, 32)}
      <div class="scale mono"><span id="scaleMin"></span><span>Charcoal</span><span id="scaleMax"></span></div>
      ${slider('surfaceS', 'Color tint (0% = pure gray)', 0, 55)}
      ${slider('depth', 'Claude Code &amp; sidebar contrast', -6, 10)}
      <div class="scale mono"><span>Darker panels</span><span>Flat</span><span>Lighter panels</span></div>
      <div class="zones divider">
        ${check('zEditor', 'Code editor')}
        ${check('zSidebars', 'Sidebars &amp; Claude Code', 'The Explorer and the secondary sidebar where Claude Code docks share one colour setting')}
        ${check('zTabs', 'Tabs')}
        ${check('zPanel', 'Panel &amp; terminal')}
      </div>
    </section>

    <!-- CARD 4: presets & reset -->
    <section class="card" aria-labelledby="h-presets">
      <header class="card-head">
        <h2 id="h-presets"><i class="codicon codicon-bookmark"></i>4. Presets</h2>
        <span class="muted small">Frame + grays · every window</span>
      </header>
      <div id="presetGrid" class="preset-grid"></div>
      <form id="presetForm" class="row save-row divider">
        <input id="presetName" type="text" class="text-input" maxlength="40" placeholder="Save current scheme…" aria-label="Preset name">
        <button type="submit" class="btn primary"><i class="codicon codicon-add"></i>Save</button>
      </form>
      <div class="divider">
        ${check('cleanGit', 'Keep colours out of git')}
        <p id="cleanGitHint" class="hint small">Stops git listing <span class="mono">.vscode/settings.json</span> as changed. Only affects your copy of this project.</p>
      </div>
      <button id="resetBtn" type="button" class="btn secondary wide"><i class="codicon codicon-discard"></i><span id="resetLabel">Reset to theme default</span></button>
    </section>
  </fieldset>

  <script nonce="${n}" src="${uri('webview.js')}"></script>
</body>
</html>`;
}
