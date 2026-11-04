// Turns an IdentityProfile into `workbench.colorCustomizations` entries.
// Formulas follow the approved mockup; foregrounds use a WCAG contrast pick.
import { LIGHT_TEXT, clamp, hslToHex, pickForeground } from './color';
import type { FrameZones, Hsl, IdentityProfile, Limits, SurfaceZones } from './types';

export const DEFAULT_LIMITS: Limits = { surfaceLMin: 4, surfaceLMax: 32 };

/** Slider ranges (from the mockup). Surface lightness uses `Limits` instead. */
export const RANGES = {
  frameS: { min: 0, max: 100 },
  frameL: { min: 12, max: 85 },
  surfaceS: { min: 0, max: 55 },
  depth: { min: -6, max: 10 },
} as const;

export const FRAME_ZONE_KEYS: Record<keyof FrameZones, readonly string[]> = {
  titleBar: [
    'titleBar.activeBackground',
    'titleBar.activeForeground',
    'titleBar.inactiveBackground',
    'titleBar.inactiveForeground',
  ],
  windowBorder: ['window.activeBorder', 'window.inactiveBorder'],
  activityBar: [
    'activityBar.background',
    'activityBar.foreground',
    'activityBar.inactiveForeground',
    'activityBar.activeBorder',
  ],
  statusBar: ['statusBar.background', 'statusBar.foreground'],
};

export const SURFACE_ZONE_KEYS: Record<keyof SurfaceZones, readonly string[]> = {
  editor: ['editor.background', 'editorGutter.background', 'breadcrumb.background'],
  sidebars: [
    'sideBar.background',
    'sideBarTitle.background',
    'sideBarSectionHeader.background',
    'editorWidget.background',
  ],
  tabs: ['editorGroupHeader.tabsBackground', 'tab.activeBackground', 'tab.inactiveBackground'],
  panel: ['panel.background', 'terminal.background'],
};

/** Every colour key this extension owns. Used for both writing and resetting. */
export const MANAGED_COLOR_KEYS: readonly string[] = [
  ...Object.values(FRAME_ZONE_KEYS).flat(),
  ...Object.values(SURFACE_ZONE_KEYS).flat(),
];

export interface FramePalette {
  primary: string;
  foreground: string;
  darker: string;
  darkerForeground: string;
  border: string;
  activeIndicator: string;
  inactiveBg: string;
  inactiveFg: string;
}

export function framePalette({ h, s, l }: Hsl): FramePalette {
  const primary = hslToHex(h, s, l);
  const darker = hslToHex(h, s, Math.max(10, l - 7));
  const border = hslToHex(h, Math.min(100, s + 15), Math.min(70, l + 18));
  const inactiveBg = hslToHex(h, Math.min(s, Math.max(15, s - 35)), Math.max(12, l - 14));
  const darkerForeground = pickForeground(darker);
  const inactiveFg =
    pickForeground(inactiveBg) === LIGHT_TEXT
      ? hslToHex(h, Math.min(s, 25), 78)
      : hslToHex(h, Math.min(s, 30), 22);
  return {
    primary,
    foreground: pickForeground(primary),
    darker,
    darkerForeground,
    border,
    // A light tint reads well on dark bars; on light bars fall back to the text colour.
    activeIndicator: darkerForeground === LIGHT_TEXT ? border : darkerForeground,
    inactiveBg,
    inactiveFg,
  };
}

export interface SurfacePalette {
  editor: string;
  breadcrumb: string;
  sidebar: string;
  sidebarHeader: string;
  tabs: string;
  terminal: string;
}

export function surfaceHue(profile: IdentityProfile): number {
  return profile.surface.linkHue ? profile.frame.h : profile.surface.h;
}

export function surfacePalette(
  hue: number,
  s: number,
  l: number,
  depth: number,
  limits: Limits = DEFAULT_LIMITS,
): SurfacePalette {
  const base = clamp(l, limits.surfaceLMin, limits.surfaceLMax);
  const at = (delta: number) => hslToHex(hue, s, clamp(base + delta, 2, 45));
  return {
    editor: at(0),
    breadcrumb: at(1),
    sidebar: at(depth),
    sidebarHeader: at(depth + 3),
    tabs: at(depth + 1),
    terminal: at(-2),
  };
}

export function profileSurfacePalette(profile: IdentityProfile, limits: Limits = DEFAULT_LIMITS): SurfacePalette {
  const { s, l, depth } = profile.surface;
  return surfacePalette(surfaceHue(profile), s, l, depth, limits);
}

/** The managed colour keys for every enabled zone of `profile`. */
export function buildColorCustomizations(
  profile: IdentityProfile,
  limits: Limits = DEFAULT_LIMITS,
): Record<string, string> {
  const out: Record<string, string> = {};
  const fz = profile.frame.zones;
  const sz = profile.surface.zones;
  const f = framePalette(profile.frame);
  const p = profileSurfacePalette(profile, limits);

  if (fz.titleBar) {
    out['titleBar.activeBackground'] = f.primary;
    out['titleBar.activeForeground'] = f.foreground;
    out['titleBar.inactiveBackground'] = f.inactiveBg;
    out['titleBar.inactiveForeground'] = f.inactiveFg;
  }
  if (fz.windowBorder) {
    out['window.activeBorder'] = f.border;
    out['window.inactiveBorder'] = f.inactiveBg;
  }
  if (fz.activityBar) {
    out['activityBar.background'] = f.darker;
    out['activityBar.foreground'] = f.darkerForeground;
    out['activityBar.inactiveForeground'] = `${f.darkerForeground}99`;
    out['activityBar.activeBorder'] = f.activeIndicator;
  }
  if (fz.statusBar) {
    out['statusBar.background'] = f.darker;
    out['statusBar.foreground'] = f.darkerForeground;
  }

  if (sz.editor) {
    out['editor.background'] = p.editor;
    out['editorGutter.background'] = p.editor;
    out['breadcrumb.background'] = p.breadcrumb;
  }
  if (sz.sidebars) {
    out['sideBar.background'] = p.sidebar;
    out['sideBarTitle.background'] = p.sidebar;
    out['sideBarSectionHeader.background'] = p.sidebarHeader;
    out['editorWidget.background'] = p.sidebar;
  }
  if (sz.tabs) {
    out['editorGroupHeader.tabsBackground'] = p.tabs;
    out['tab.activeBackground'] = p.editor;
    out['tab.inactiveBackground'] = p.tabs;
  }
  if (sz.panel) {
    out['panel.background'] = p.terminal;
    out['terminal.background'] = p.terminal;
  }
  return out;
}
