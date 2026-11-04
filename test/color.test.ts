import { describe, expect, it } from 'vitest';
import {
  DARK_TEXT,
  LIGHT_TEXT,
  contrastRatio,
  cssToHsl,
  hslToHex,
  normalizeHex,
  parseCssColor,
  pickForeground,
} from '../src/shared/color';

describe('hslToHex', () => {
  it('converts primaries and grays', () => {
    expect(hslToHex(0, 100, 50)).toBe('#FF0000');
    expect(hslToHex(120, 100, 50)).toBe('#00FF00');
    expect(hslToHex(240, 100, 50)).toBe('#0000FF');
    expect(hslToHex(0, 0, 0)).toBe('#000000');
    expect(hslToHex(0, 0, 100)).toBe('#FFFFFF');
    expect(hslToHex(200, 0, 50)).toBe('#808080');
  });

  it('wraps hue and clamps out-of-range values', () => {
    expect(hslToHex(360, 100, 50)).toBe('#FF0000');
    expect(hslToHex(-120, 100, 50)).toBe('#0000FF');
    expect(hslToHex(0, 150, 50)).toBe('#FF0000');
    expect(hslToHex(0, 50, -10)).toBe('#000000');
  });
});

describe('parseCssColor / normalizeHex', () => {
  it('accepts every form a webview CSS variable can take', () => {
    expect(normalizeHex('#abc')).toBe('#AABBCC');
    expect(normalizeHex('#abcd')).toBe('#AABBCC');
    expect(normalizeHex('#1e1e1e')).toBe('#1E1E1E');
    expect(normalizeHex('#1e1e1e80')).toBe('#1E1E1E');
    expect(normalizeHex('rgb(30, 30, 30)')).toBe('#1E1E1E');
    expect(normalizeHex('rgba(255,0,0,0.5)')).toBe('#FF0000');
    expect(normalizeHex('rgb(255 0 0 / 50%)')).toBe('#FF0000');
    expect(normalizeHex('  #FFFFFF ')).toBe('#FFFFFF');
  });

  it('rejects junk', () => {
    expect(parseCssColor('')).toBeUndefined();
    expect(parseCssColor(undefined)).toBeUndefined();
    expect(parseCssColor('red')).toBeUndefined();
    expect(parseCssColor('#12345')).toBeUndefined();
  });
});

describe('cssToHsl', () => {
  it('round-trips through hslToHex within one step', () => {
    const samples: Array<[number, number, number]> = [
      [0, 70, 36],
      [212, 78, 34],
      [152, 68, 28],
      [36, 88, 42],
      [268, 65, 35],
      [220, 15, 24],
      [0, 26, 8],
      [212, 32, 11],
    ];
    for (const [h, s, l] of samples) {
      const back = cssToHsl(hslToHex(h, s, l))!;
      expect(Math.abs(back.l - l)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.s - s)).toBeLessThanOrEqual(2);
      const hueDiff = Math.abs(((back.h - h + 540) % 360) - 180);
      expect(hueDiff).toBeLessThanOrEqual(2);
    }
  });

  it('gives zero saturation for grays', () => {
    expect(cssToHsl('#1E1E1E')).toEqual({ h: 0, s: 0, l: 12 });
  });
});

describe('pickForeground', () => {
  it('uses white on dark colours', () => {
    expect(pickForeground('#991B1B')).toBe(LIGHT_TEXT);
    expect(pickForeground('#1E1E1E')).toBe(LIGHT_TEXT);
    expect(pickForeground('#0000FF')).toBe(LIGHT_TEXT);
  });

  it('uses charcoal on bright colours, including orange and yellow', () => {
    expect(pickForeground('#FFFFFF')).toBe(DARK_TEXT);
    expect(pickForeground('#F59E0B')).toBe(DARK_TEXT);
    expect(pickForeground('#FACC15')).toBe(DARK_TEXT);
  });

  // The worst case for a white-or-charcoal pick is ~4.22:1 (where both options tie).
  it('always reaches at least 4.2:1 across hues and the frame lightness range', () => {
    for (let h = 0; h < 360; h += 15) {
      for (let l = 12; l <= 85; l += 1) {
        const bg = hslToHex(h, 80, l);
        expect(contrastRatio(bg, pickForeground(bg))).toBeGreaterThanOrEqual(4.2);
      }
    }
  });
});
