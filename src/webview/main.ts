// Sidebar panel behaviour. Owns a working copy of the profile, updates its own preview instantly,
// and posts changes to the extension host (throttled to ≤40 ms while dragging).
import { clamp, hslToHex } from '../shared/color';
import { DEFAULT_LIMITS, framePalette, profileSurfacePalette, surfaceHue } from '../shared/palette';
import {
  applyQuickGray,
  defaultProfile,
  deriveProfileFromColors,
  normalizeProfile,
  type QuickGray,
} from '../shared/profile';
import { previewTitle } from '../shared/title';
import type {
  FrameZones,
  HostToUi,
  IdentityProfile,
  Limits,
  NoticeLevel,
  Preset,
  ProminenceStyle,
  SurfaceZones,
  ThemeKind,
  UiToHost,
} from '../shared/types';

declare function acquireVsCodeApi(): { postMessage(msg: UiToHost): void };
const vscode = acquireVsCodeApi();
const send = (msg: UiToHost) => vscode.postMessage(msg);

// Forward any panel errors to the "Workspace Identity" output channel so problems are visible.
window.addEventListener('error', (e) => send({ type: 'LOG', text: `Error: ${e.message} (${e.filename}:${e.lineno})` }));
window.addEventListener('unhandledrejection', (e) => send({ type: 'LOG', text: `Unhandled: ${String(e.reason)}` }));

// ---- State -------------------------------------------------------------------

interface UiState {
  profile: IdentityProfile;
  /** True once this workspace has an identity; until then the sliders mirror the theme. */
  applied: boolean;
  presets: Preset[];
  hasFolder: boolean;
  folderName: string;
  appName: string;
  themeKind: ThemeKind;
  limits: Limits;
  cleanGit: boolean;
  cleanGitAvailable: boolean;
  ready: boolean;
}

const state: UiState = {
  profile: defaultProfile(),
  applied: false,
  presets: [],
  hasFolder: false,
  folderName: '',
  appName: 'Antigravity IDE',
  themeKind: 'dark',
  limits: DEFAULT_LIMITS,
  cleanGit: false,
  cleanGitAvailable: false,
  ready: false,
};

// ---- DOM helpers -------------------------------------------------------------

const $ = <T extends HTMLElement = HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
};
const input = (id: string) => $<HTMLInputElement>(id);

const els = {
  controls: $<HTMLFieldSetElement>('controls'),
  noFolder: $('noFolder'),
  notice: $('notice'),
  noticeText: $('noticeText'),
  noticeIcon: $('noticeIcon'),
  folderBadge: $('folderBadge'),
  titleInput: input('titleInput'),
  titlePreview: $('titlePreview'),
  forceUpper: input('forceUpper'),
  statusPill: input('statusPill'),
  frameH: input('frameH'),
  frameS: input('frameS'),
  frameL: input('frameL'),
  frameHex: $('frameHex'),
  frameSwatch: $('frameSwatch'),
  surfaceHex: $('surfaceHex'),
  surfaceSwatch: $('surfaceSwatch'),
  lightThemeNote: $('lightThemeNote'),
  linkHue: input('linkHue'),
  hueStatus: $('hueStatus'),
  surfaceH: input('surfaceH'),
  surfaceL: input('surfaceL'),
  surfaceS: input('surfaceS'),
  depth: input('depth'),
  scaleMin: $('scaleMin'),
  scaleMax: $('scaleMax'),
  presetGrid: $('presetGrid'),
  presetForm: $<HTMLFormElement>('presetForm'),
  presetName: input('presetName'),
  cleanGit: input('cleanGit'),
  cleanGitHint: $('cleanGitHint'),
  resetBtn: $<HTMLButtonElement>('resetBtn'),
  resetLabel: $('resetLabel'),
};

const frameZoneInputs: Record<keyof FrameZones, HTMLInputElement> = {
  titleBar: input('zTitleBar'),
  windowBorder: input('zWindowBorder'),
  activityBar: input('zActivityBar'),
  statusBar: input('zStatusBar'),
};
const surfaceZoneInputs: Record<keyof SurfaceZones, HTMLInputElement> = {
  editor: input('zEditor'),
  sidebars: input('zSidebars'),
  tabs: input('zTabs'),
  panel: input('zPanel'),
};

// ---- Timing helpers ----------------------------------------------------------

/** Leading + trailing throttle: fires at most every `ms`, always with the latest state. */
function throttle(fn: () => void, ms: number): { (): void; flush(): void } {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    timer = undefined;
    last = Date.now();
    fn();
  };
  const call = () => {
    const wait = ms - (Date.now() - last);
    if (wait <= 0) {
      if (timer) clearTimeout(timer);
      run();
    } else if (!timer) {
      timer = setTimeout(run, wait);
    }
  };
  call.flush = () => {
    if (timer) {
      clearTimeout(timer);
      run();
    }
  };
  return call;
}

function debounce(fn: () => void, ms: number): { (): void; flush(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const call = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn();
    }, ms);
  };
  call.flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
      fn();
    }
  };
  return call;
}

const sendFrame = throttle(() => send({ type: 'UPDATE_FRAME_COLORS', profile: state.profile }), 40);
const sendSurface = throttle(() => send({ type: 'UPDATE_SURFACE_COLORS', profile: state.profile }), 40);
const sendTitle = debounce(() => send({ type: 'UPDATE_TITLE', profile: state.profile }), 250);

/** Any user edit gives the workspace an identity, so stop mirroring the theme. */
function edited(): void {
  state.applied = true;
}

// ---- Reading the theme (FR-1) -------------------------------------------------

function themeVar(key: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(`--vscode-${key.replace(/\./g, '-')}`)
    .trim();
}

function profileFromTheme(): IdentityProfile {
  const colors = {
    'titleBar.activeBackground': themeVar('titleBar.activeBackground'),
    'editor.background': themeVar('editor.background'),
    'sideBar.background': themeVar('sideBar.background'),
  };
  return deriveProfileFromColors(colors, defaultProfile(), { limits: state.limits });
}

// ---- Rendering ---------------------------------------------------------------

function setSlider(el: HTMLInputElement, value: number, label: string): void {
  if (el.value !== String(value)) el.value = String(value);
  $(`${el.id}Val`).textContent = label;
}

function render(): void {
  const p = state.profile;
  const { limits } = state;
  const sHue = surfaceHue(p);

  els.noFolder.hidden = !state.ready || state.hasFolder;
  els.controls.disabled = !state.ready || !state.hasFolder;
  els.folderBadge.textContent = state.folderName || 'no folder';
  els.folderBadge.title = state.folderName;

  // Card 1
  if (document.activeElement !== els.titleInput) els.titleInput.value = p.title.label;
  els.titleInput.placeholder = state.folderName ? `e.g. ${state.folderName.toUpperCase()} [DEV]` : 'Workspace name…';
  els.forceUpper.checked = p.title.forceUpper;
  els.statusPill.checked = p.title.statusPill;
  document.querySelectorAll<HTMLButtonElement>('.style-btn').forEach((btn) => {
    const active = btn.dataset.style === p.title.style;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  const preview = previewTitle(p.title, 'server.ts', state.appName);
  els.titlePreview.textContent = p.title.label.trim() ? preview : 'Type a name to customise the title bar';
  els.titlePreview.classList.toggle('muted', !p.title.label.trim());

  // Card 2
  const f = framePalette(p.frame);
  setSlider(els.frameH, p.frame.h, `${p.frame.h}°`);
  setSlider(els.frameS, p.frame.s, `${p.frame.s}%`);
  setSlider(els.frameL, p.frame.l, `${p.frame.l}%`);
  els.frameS.style.background = `linear-gradient(to right, hsl(${p.frame.h},0%,${p.frame.l}%), hsl(${p.frame.h},100%,${p.frame.l}%))`;
  els.frameL.style.background = `linear-gradient(to right, hsl(${p.frame.h},${p.frame.s}%,12%), hsl(${p.frame.h},${p.frame.s}%,50%), hsl(${p.frame.h},${p.frame.s}%,85%))`;
  els.frameHex.textContent = f.primary;
  els.frameSwatch.style.backgroundColor = f.primary;
  (Object.keys(frameZoneInputs) as Array<keyof FrameZones>).forEach((k) => {
    frameZoneInputs[k].checked = p.frame.zones[k];
  });

  // Card 3
  const sp = profileSurfacePalette(p, limits);
  els.surfaceL.min = String(limits.surfaceLMin);
  els.surfaceL.max = String(limits.surfaceLMax);
  els.scaleMin.textContent = `${limits.surfaceLMin}% black`;
  els.scaleMax.textContent = `${limits.surfaceLMax}% slate`;
  els.linkHue.checked = p.surface.linkHue;
  els.hueStatus.textContent = p.surface.linkHue ? `Synced (${sHue}°)` : `Custom (${sHue}°)`;
  setSlider(els.surfaceH, sHue, `${sHue}°`);
  setSlider(els.surfaceL, p.surface.l, `${p.surface.l}%`);
  setSlider(els.surfaceS, p.surface.s, `${p.surface.s}%`);
  setSlider(els.depth, p.surface.depth, `${p.surface.depth > 0 ? '+' : ''}${p.surface.depth}%`);
  const sl = p.surface.l;
  els.surfaceL.style.background = `linear-gradient(to right, hsl(${sHue},${p.surface.s}%,${limits.surfaceLMin}%), hsl(${sHue},${p.surface.s}%,16%), hsl(${sHue},${p.surface.s}%,${limits.surfaceLMax}%))`;
  els.surfaceS.style.background = `linear-gradient(to right, hsl(${sHue},0%,${sl + 8}%), hsl(${sHue},55%,${sl + 8}%))`;
  els.depth.style.background = `linear-gradient(to right, hsl(${sHue},${p.surface.s}%,${clamp(sl - 6, 2, 45)}%), hsl(${sHue},${p.surface.s}%,${clamp(sl + 10, 2, 45)}%))`;
  els.surfaceHex.textContent = sp.editor;
  els.surfaceSwatch.style.backgroundColor = sp.editor;
  els.lightThemeNote.hidden = !(state.themeKind === 'light' || state.themeKind === 'hcLight');
  (Object.keys(surfaceZoneInputs) as Array<keyof SurfaceZones>).forEach((k) => {
    surfaceZoneInputs[k].checked = p.surface.zones[k];
  });

  // Card 4
  els.cleanGit.checked = state.cleanGit;
  els.cleanGit.disabled = !state.cleanGitAvailable;
  els.cleanGitHint.classList.toggle('muted', !state.cleanGitAvailable);
}

function renderPresets(): void {
  const grid = els.presetGrid;
  grid.replaceChildren();
  for (const preset of state.presets) {
    const item = document.createElement('div');
    item.className = 'preset';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-btn';
    btn.title = `Apply "${preset.name}"`;
    btn.addEventListener('click', () => {
      edited();
      sendFrame.flush();
      sendSurface.flush();
      sendTitle.flush();
      send({ type: 'APPLY_PRESET', id: preset.id, profile: state.profile });
    });

    const swatch = document.createElement('span');
    swatch.className = 'duo';
    const a = document.createElement('span');
    a.style.backgroundColor = hslToHex(preset.frame.h, preset.frame.s, preset.frame.l);
    const b = document.createElement('span');
    const sh = preset.surface.linkHue ? preset.frame.h : preset.surface.h;
    b.style.backgroundColor = hslToHex(sh, preset.surface.s, clamp(preset.surface.l, state.limits.surfaceLMin, state.limits.surfaceLMax));
    swatch.append(a, b);

    const name = document.createElement('span');
    name.className = 'preset-name';
    name.textContent = preset.name;
    btn.append(swatch, name);
    item.append(btn);

    if (!preset.builtIn) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn preset-del';
      del.title = `Delete "${preset.name}"`;
      del.setAttribute('aria-label', `Delete preset ${preset.name}`);
      const icon = document.createElement('i');
      icon.className = 'codicon codicon-close';
      del.append(icon);
      del.addEventListener('click', () => send({ type: 'DELETE_PRESET', id: preset.id }));
      item.append(del);
      item.classList.add('user');
    }
    grid.append(item);
  }
}

let noticeTimer: ReturnType<typeof setTimeout> | undefined;
function showNotice(level: NoticeLevel, text: string): void {
  els.notice.hidden = false;
  els.notice.dataset.level = level;
  els.noticeText.textContent = text;
  els.noticeIcon.className = `codicon codicon-${level === 'info' ? 'info' : level === 'warning' ? 'warning' : 'error'}`;
  if (noticeTimer) clearTimeout(noticeTimer);
  if (level === 'info') noticeTimer = setTimeout(() => (els.notice.hidden = true), 6000);
}

// ---- Event wiring ------------------------------------------------------------

const intOf = (el: HTMLInputElement) => parseInt(el.value, 10);

// Card 1 – title
els.titleInput.addEventListener('input', () => {
  edited();
  state.profile.title.label = els.titleInput.value;
  render();
  sendTitle();
});
els.titleInput.addEventListener('change', () => sendTitle.flush());
document.querySelectorAll<HTMLButtonElement>('.style-btn').forEach((btn) =>
  btn.addEventListener('click', () => {
    edited();
    state.profile.title.style = btn.dataset.style as ProminenceStyle;
    render();
    sendTitle();
    sendTitle.flush();
  }),
);
els.forceUpper.addEventListener('change', () => {
  edited();
  state.profile.title.forceUpper = els.forceUpper.checked;
  render();
  sendTitle();
  sendTitle.flush();
});
els.statusPill.addEventListener('change', () => {
  edited();
  state.profile.title.statusPill = els.statusPill.checked;
  render();
  sendTitle();
  sendTitle.flush();
});

// Card 2 – frame
els.frameH.addEventListener('input', () => {
  edited();
  const p = state.profile;
  p.frame.h = intOf(els.frameH);
  // A hue means nothing on a gray frame – give it some colour so the drag visibly does something.
  if (p.frame.s < 10) p.frame.s = 65;
  if (p.surface.linkHue) p.surface.h = p.frame.h;
  render();
  sendFrame();
});
els.frameS.addEventListener('input', () => {
  edited();
  state.profile.frame.s = intOf(els.frameS);
  render();
  sendFrame();
});
els.frameL.addEventListener('input', () => {
  edited();
  state.profile.frame.l = intOf(els.frameL);
  render();
  sendFrame();
});
(Object.keys(frameZoneInputs) as Array<keyof FrameZones>).forEach((k) =>
  frameZoneInputs[k].addEventListener('change', () => {
    edited();
    state.profile.frame.zones[k] = frameZoneInputs[k].checked;
    render();
    sendFrame();
  }),
);

// Card 3 – surfaces
els.linkHue.addEventListener('change', () => {
  edited();
  const p = state.profile;
  p.surface.linkHue = els.linkHue.checked;
  if (p.surface.linkHue) p.surface.h = p.frame.h;
  render();
  sendSurface();
});
els.surfaceH.addEventListener('input', () => {
  edited();
  const p = state.profile;
  // Dragging the undertone hue unlinks it from the header (as in the mockup).
  p.surface.linkHue = false;
  p.surface.h = intOf(els.surfaceH);
  if (p.surface.s === 0) p.surface.s = 20;
  render();
  sendSurface();
});
els.surfaceL.addEventListener('input', () => {
  edited();
  state.profile.surface.l = intOf(els.surfaceL);
  render();
  sendSurface();
});
els.surfaceS.addEventListener('input', () => {
  edited();
  state.profile.surface.s = intOf(els.surfaceS);
  render();
  sendSurface();
});
els.depth.addEventListener('input', () => {
  edited();
  state.profile.surface.depth = intOf(els.depth);
  render();
  sendSurface();
});
document.querySelectorAll<HTMLButtonElement>('[data-gray]').forEach((btn) =>
  btn.addEventListener('click', () => {
    edited();
    state.profile = applyQuickGray(state.profile, btn.dataset.gray as QuickGray, state.limits);
    render();
    sendSurface();
  }),
);
(Object.keys(surfaceZoneInputs) as Array<keyof SurfaceZones>).forEach((k) =>
  surfaceZoneInputs[k].addEventListener('change', () => {
    edited();
    state.profile.surface.zones[k] = surfaceZoneInputs[k].checked;
    render();
    sendSurface();
  }),
);

// Card 4 – presets, clean-git, reset
els.presetForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = els.presetName.value.trim();
  if (!name) {
    els.presetName.focus();
    return;
  }
  send({ type: 'SAVE_PRESET', name, profile: state.profile });
  els.presetName.value = '';
});
els.cleanGit.addEventListener('change', () => {
  send({ type: 'SET_CLEAN_GIT', enabled: els.cleanGit.checked });
});

let resetArmed: ReturnType<typeof setTimeout> | undefined;
els.resetBtn.addEventListener('click', () => {
  if (!resetArmed) {
    els.resetBtn.classList.add('armed');
    els.resetLabel.textContent = 'Click again to reset';
    resetArmed = setTimeout(disarmReset, 3000);
    return;
  }
  disarmReset();
  send({ type: 'RESET_WORKSPACE' });
});
function disarmReset(): void {
  if (resetArmed) clearTimeout(resetArmed);
  resetArmed = undefined;
  els.resetBtn.classList.remove('armed');
  els.resetLabel.textContent = 'Reset to theme default';
}

$('noticeClose').addEventListener('click', () => (els.notice.hidden = true));

// ---- Messages from the host ---------------------------------------------------

function adoptProfile(profile: IdentityProfile | null): void {
  state.applied = profile !== null;
  state.profile = profile ? normalizeProfile(profile, state.limits) : profileFromTheme();
}

window.addEventListener('message', (event: MessageEvent<HostToUi>) => {
  const msg = event.data;
  switch (msg?.type) {
    case 'INIT_STATE':
      state.presets = msg.presets;
      state.hasFolder = msg.hasFolder;
      state.folderName = msg.folderName;
      state.appName = msg.appName;
      state.themeKind = msg.themeKind;
      state.limits = msg.limits;
      state.cleanGit = msg.cleanGit;
      state.cleanGitAvailable = msg.cleanGitAvailable;
      state.ready = true;
      adoptProfile(msg.profile);
      render();
      renderPresets();
      break;
    case 'STATE_CHANGED':
      adoptProfile(msg.profile);
      render();
      break;
    case 'PRESETS_UPDATED':
      state.presets = msg.presets;
      renderPresets();
      break;
    case 'CLEAN_GIT_CHANGED':
      state.cleanGit = msg.enabled;
      render();
      break;
    case 'NOTICE':
      showNotice(msg.level, msg.text);
      break;
  }
});

// While nothing is applied, keep the sliders matched to the theme (e.g. right after a reset,
// the theme's CSS variables arrive a moment after the settings change).
new MutationObserver(() => {
  if (state.ready && !state.applied) {
    state.profile = profileFromTheme();
    render();
  }
}).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });

render();
send({ type: 'READY' });
