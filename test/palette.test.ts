import { describe, expect, it } from 'vitest';
import { cssToHsl, hslToHex } from '../src/shared/color';
import {
  FRAME_ZONE_KEYS,
  MANAGED_COLOR_KEYS,
  SURFACE_ZONE_KEYS,
  buildColorCustomizations,
  framePalette,
  surfacePalette,
} from '../src/shared/palette';
import { BUILT_IN_PRESETS } from '../src/shared/presets';
import {
  applyPreset,
  applyQuickGray,
  defaultProfile,
  deriveProfileFromColors,
  normalizeProfile,
} from '../src/shared/profile';

const crimson = () => applyPreset(defaultProfile(), BUILT_IN_PRESETS[0]);

describe('buildColorCustomizations', () => {
  it('writes every managed key when all zones are on', () => {
    const out = buildColorCustomizations(crimson());
    expect(Object.keys(out).sort()).toEqual([...MANAGED_COLOR_KEYS].sort());
    for (const value of Object.values(out)) expect(value).toMatch(/^#[0-9A-F]{6}([0-9A-F]{2})?$/);
  });

  it('never writes chat.background (does not exist in Antigravity)', () => {
    expect(MANAGED_COLOR_KEYS).not.toContain('chat.background');
  });

  it('leaves out keys for switched-off zones', () => {
    const p = crimson();
    p.frame.zones.activityBar = false;
    p.surface.zones.panel = false;
    const out = buildColorCustomizations(p);
    for (const k of FRAME_ZONE_KEYS.activityBar) expect(out).not.toHaveProperty(k);
    for (const k of SURFACE_ZONE_KEYS.panel) expect(out).not.toHaveProperty(k);
    expect(out).toHaveProperty('titleBar.activeBackground');
    expect(out).toHaveProperty('editor.background');
  });

  it('matches the mockup formulas for the crimson preset', () => {
    const out = buildColorCustomizations(crimson());
    expect(out['titleBar.activeBackground']).toBe(hslToHex(0, 70, 36));
    expect(out['activityBar.background']).toBe(hslToHex(0, 70, 29));
    expect(out['statusBar.background']).toBe(hslToHex(0, 70, 29));
    expect(out['window.activeBorder']).toBe(hslToHex(0, 85, 54));
    expect(out['editor.background']).toBe(hslToHex(0, 26, 8));
    expect(out['sideBar.background']).toBe(hslToHex(0, 26, 11));
    expect(out['terminal.background']).toBe(hslToHex(0, 26, 6));
    expect(out['titleBar.activeForeground']).toBe('#FFFFFF');
    expect(out['activityBar.inactiveForeground']).toBe('#FFFFFF99');
  });

  it('uses dark text on a bright amber frame', () => {
    const amber = applyPreset(defaultProfile(), BUILT_IN_PRESETS[3]);
    amber.frame.l = 60;
    expect(buildColorCustomizations(amber)['titleBar.activeForeground']).toBe('#0F172A');
  });

  it('follows the frame hue when linked, and its own hue when not', () => {
    const p = crimson();
    p.surface.h = 200;
    p.surface.linkHue = true;
    expect(cssToHsl(buildColorCustomizations(p)['editor.background'])!.h).toBe(0);
    p.surface.linkHue = false;
    const h = cssToHsl(buildColorCustomizations(p)['editor.background'])!.h;
    expect(Math.abs(h - 200)).toBeLessThanOrEqual(3);
  });
});

describe('surface readability clamp', () => {
  it('keeps the editor between the limits', () => {
    const tooDark = surfacePalette(0, 0, 0, 3, { surfaceLMin: 4, surfaceLMax: 32 });
    const tooLight = surfacePalette(0, 0, 90, 3, { surfaceLMin: 4, surfaceLMax: 32 });
    expect(cssToHsl(tooDark.editor)!.l).toBe(4);
    expect(cssToHsl(tooLight.editor)!.l).toBe(32);
  });

  it('normalizeProfile clamps stored values to the limits', () => {
    const p = normalizeProfile({ surface: { l: 80, s: 99, depth: 50 }, frame: { l: 2, h: 725 } });
    expect(p.surface.l).toBe(32);
    expect(p.surface.s).toBe(55);
    expect(p.surface.depth).toBe(10);
    expect(p.frame.l).toBe(12);
    expect(p.frame.h).toBe(5);
  });
});

describe('framePalette', () => {
  it('keeps a pure-gray frame untinted when inactive', () => {
    const f = framePalette({ h: 220, s: 0, l: 30 });
    expect(cssToHsl(f.inactiveBg)!.s).toBe(0);
  });
});

describe('quick grays', () => {
  it('match the mockup values', () => {
    const base = crimson();
    expect(applyQuickGray(base, 'oled').surface).toMatchObject({ l: 4, s: 10, depth: 3 });
    expect(applyQuickGray(base, 'neutral').surface).toMatchObject({ l: 12, s: 0, depth: 3 });
    expect(applyQuickGray(base, 'tinted').surface).toMatchObject({ linkHue: true, l: 10, s: 30, depth: 4 });
    expect(applyQuickGray(base, 'slate').surface).toMatchObject({ l: 22, s: 14, depth: 4 });
  });
});

describe('deriveProfileFromColors', () => {
  it('recovers slider positions from written colours', () => {
    const original = crimson();
    const colors = buildColorCustomizations(original);
    const back = deriveProfileFromColors(colors, defaultProfile(), { zonesFrom: colors });
    expect(Math.abs(back.frame.l - original.frame.l)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.surface.l - original.surface.l)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.surface.depth - original.surface.depth)).toBeLessThanOrEqual(1);
    expect(back.surface.linkHue).toBe(true);
    expect(back.frame.zones).toEqual(original.frame.zones);
    expect(back.surface.zones).toEqual(original.surface.zones);
  });

  it('reads a stock dark theme (Visual Studio Dark)', () => {
    const theme = {
      'titleBar.activeBackground': '#3C3C3C',
      'editor.background': '#1E1E1E',
      'sideBar.background': '#252526',
    };
    const p = deriveProfileFromColors(theme, defaultProfile());
    expect(p.frame).toMatchObject({ s: 0, l: 24 });
    expect(p.surface).toMatchObject({ s: 0, l: 12, depth: 3, linkHue: true });
  });

  it('switches zones off when their keys are missing', () => {
    const p = deriveProfileFromColors(
      { 'titleBar.activeBackground': '#991B1B' },
      defaultProfile(),
      { zonesFrom: { 'titleBar.activeBackground': '#991B1B' } },
    );
    expect(p.frame.zones).toEqual({ titleBar: true, windowBorder: false, activityBar: false, statusBar: false });
    expect(p.surface.zones).toEqual({ editor: false, sidebars: false, tabs: false, panel: false });
  });
});
