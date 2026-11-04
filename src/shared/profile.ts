// Profile helpers: defaults, validation, presets, quick grays and reading colours back.
import { clamp, cssToHsl } from './color';
import { DEFAULT_LIMITS, RANGES } from './palette';
import {
  PROMINENCE_STYLES,
  type IdentityProfile,
  type Limits,
  type Preset,
  type ProminenceStyle,
} from './types';

export function defaultProfile(): IdentityProfile {
  return {
    title: { label: '', style: 'block', forceUpper: true, statusPill: true },
    frame: {
      h: 220,
      s: 18,
      l: 24,
      zones: { titleBar: true, windowBorder: true, activityBar: true, statusBar: true },
    },
    surface: {
      linkHue: true,
      h: 220,
      s: 0,
      l: 12,
      depth: 3,
      zones: { editor: true, sidebars: true, tabs: true, panel: true },
    },
  };
}

const num = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(Math.round(value), min, max) : fallback;

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const hue = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? ((Math.round(value) % 360) + 360) % 360 : fallback;

const style = (value: unknown, fallback: ProminenceStyle): ProminenceStyle =>
  PROMINENCE_STYLES.includes(value as ProminenceStyle) ? (value as ProminenceStyle) : fallback;

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

/** Fills gaps and clamps every value, so stored or posted data can always be trusted. */
export function normalizeProfile(raw: unknown, limits: Limits = DEFAULT_LIMITS): IdentityProfile {
  const d = defaultProfile();
  const r = obj(raw);
  const t = obj(r.title);
  const f = obj(r.frame);
  const fz = obj(f.zones);
  const s = obj(r.surface);
  const sz = obj(s.zones);
  return {
    title: {
      label: typeof t.label === 'string' ? t.label.slice(0, 80) : d.title.label,
      style: style(t.style, d.title.style),
      forceUpper: bool(t.forceUpper, d.title.forceUpper),
      statusPill: bool(t.statusPill, d.title.statusPill),
    },
    frame: {
      h: hue(f.h, d.frame.h),
      s: num(f.s, d.frame.s, RANGES.frameS.min, RANGES.frameS.max),
      l: num(f.l, d.frame.l, RANGES.frameL.min, RANGES.frameL.max),
      zones: {
        titleBar: bool(fz.titleBar, true),
        windowBorder: bool(fz.windowBorder, true),
        activityBar: bool(fz.activityBar, true),
        statusBar: bool(fz.statusBar, true),
      },
    },
    surface: {
      linkHue: bool(s.linkHue, d.surface.linkHue),
      h: hue(s.h, d.surface.h),
      s: num(s.s, d.surface.s, RANGES.surfaceS.min, RANGES.surfaceS.max),
      l: num(s.l, d.surface.l, limits.surfaceLMin, limits.surfaceLMax),
      depth: num(s.depth, d.surface.depth, RANGES.depth.min, RANGES.depth.max),
      zones: {
        editor: bool(sz.editor, true),
        sidebars: bool(sz.sidebars, true),
        tabs: bool(sz.tabs, true),
        panel: bool(sz.panel, true),
      },
    },
  };
}

/** Applies a preset's colours and title style; keeps the label, zones and pill setting. */
export function applyPreset(base: IdentityProfile, preset: Preset, limits: Limits = DEFAULT_LIMITS): IdentityProfile {
  return normalizeProfile(
    {
      ...base,
      title: { ...base.title, style: preset.style },
      frame: { ...base.frame, ...preset.frame },
      surface: { ...base.surface, ...preset.surface },
    },
    limits,
  );
}

export function presetFromProfile(id: string, name: string, profile: IdentityProfile): Preset {
  const { frame, surface, title } = profile;
  return {
    id,
    name: name.trim().slice(0, 40),
    frame: { h: frame.h, s: frame.s, l: frame.l },
    surface: {
      linkHue: surface.linkHue,
      h: surface.linkHue ? frame.h : surface.h,
      s: surface.s,
      l: surface.l,
      depth: surface.depth,
    },
    style: title.style,
  };
}

export function isValidPreset(value: unknown): value is Preset {
  const p = obj(value);
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof obj(p.frame).h === 'number' &&
    typeof obj(p.surface).l === 'number'
  );
}

export type QuickGray = 'oled' | 'neutral' | 'tinted' | 'slate';

/** The mockup's one-click gray flavours. */
export function applyQuickGray(base: IdentityProfile, mode: QuickGray, limits: Limits = DEFAULT_LIMITS): IdentityProfile {
  const surface = { ...base.surface };
  switch (mode) {
    case 'oled':
      Object.assign(surface, { l: 4, s: 10, depth: 3 });
      break;
    case 'neutral':
      Object.assign(surface, { l: 12, s: 0, depth: 3 });
      break;
    case 'tinted':
      Object.assign(surface, { linkHue: true, h: base.frame.h, l: 10, s: 30, depth: 4 });
      break;
    case 'slate':
      Object.assign(surface, { l: 22, s: 14, depth: 4 });
      break;
  }
  return normalizeProfile({ ...base, surface }, limits);
}

export interface DeriveOptions {
  /** If given, each zone is switched on only when its main key is present in this map. */
  zonesFrom?: Record<string, unknown>;
  limits?: Limits;
}

/**
 * Rebuilds slider positions from existing colours – used for hand-edited settings.json
 * and for reading the current theme on first open (FR-1).
 */
export function deriveProfileFromColors(
  colors: Record<string, string | undefined>,
  base: IdentityProfile,
  options: DeriveOptions = {},
): IdentityProfile {
  const limits = options.limits ?? DEFAULT_LIMITS;
  const next: IdentityProfile = structuredClone(base);

  const frame = cssToHsl(colors['titleBar.activeBackground']);
  if (frame) Object.assign(next.frame, frame);

  const editor = cssToHsl(colors['editor.background']);
  const sidebar = cssToHsl(colors['sideBar.background']);
  if (editor) {
    next.surface.s = editor.s;
    next.surface.l = editor.l;
    next.surface.h = editor.h;
    if (sidebar) next.surface.depth = sidebar.l - editor.l;
  } else if (sidebar) {
    next.surface.s = sidebar.s;
    next.surface.l = sidebar.l - next.surface.depth;
    next.surface.h = sidebar.h;
  }
  if (editor || sidebar) {
    // Grays have no meaningful hue, so treat them as following the frame.
    const hueDiff = Math.abs(((next.surface.h - next.frame.h + 540) % 360) - 180);
    next.surface.linkHue = next.surface.s < 3 || hueDiff <= 3;
    if (next.surface.linkHue) next.surface.h = next.frame.h;
  }

  if (options.zonesFrom) {
    const present = options.zonesFrom;
    const has = (key: string) => typeof present[key] === 'string';
    next.frame.zones = {
      titleBar: has('titleBar.activeBackground'),
      windowBorder: has('window.activeBorder'),
      activityBar: has('activityBar.background'),
      statusBar: has('statusBar.background'),
    };
    next.surface.zones = {
      editor: has('editor.background'),
      sidebars: has('sideBar.background'),
      tabs: has('editorGroupHeader.tabsBackground'),
      panel: has('panel.background') || has('terminal.background'),
    };
  }
  return normalizeProfile(next, limits);
}

export function profilesEqual(a: IdentityProfile | null | undefined, b: IdentityProfile | null | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
