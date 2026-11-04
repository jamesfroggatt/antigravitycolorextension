// Small, dependency-free colour helpers (HSL <-> hex, CSS parsing, WCAG contrast).
import type { Hsl } from './types';

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/** HSL (h 0–360, s/l 0–100) → `#RRGGBB` (upper case). Ported from the mockup. */
export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 100);
  const ln = clamp(l, 0, 100) / 100;
  const a = (s * Math.min(ln, 1 - ln)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = ln - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parses `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` and `rgba()`. Alpha is ignored. */
export function parseCssColor(input: string | undefined | null): Rgb | undefined {
  if (!input) return undefined;
  const value = input.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3,8})$/.exec(value);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      digits = digits
        .slice(0, 3)
        .split('')
        .map((c) => c + c)
        .join('');
    } else if (digits.length === 6 || digits.length === 8) {
      digits = digits.slice(0, 6);
    } else {
      return undefined;
    }
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
    };
  }

  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(value);
  if (rgb) {
    return {
      r: clamp(Math.round(Number(rgb[1])), 0, 255),
      g: clamp(Math.round(Number(rgb[2])), 0, 255),
      b: clamp(Math.round(Number(rgb[3])), 0, 255),
    };
  }
  return undefined;
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Any supported CSS colour → `#RRGGBB`, or undefined if it can't be parsed. */
export function normalizeHex(input: string | undefined | null): string | undefined {
  const rgb = parseCssColor(input);
  return rgb ? rgbToHex(rgb) : undefined;
}

/** Any supported CSS colour → integer HSL, or undefined. */
export function cssToHsl(input: string | undefined | null): Hsl | undefined {
  const rgb = parseCssColor(input);
  if (!rgb) return undefined;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h) % 360, s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** WCAG 2.x relative luminance (0–1). */
export function relativeLuminance(color: string): number {
  const rgb = parseCssColor(color);
  if (!rgb) return 0;
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const LIGHT_TEXT = '#FFFFFF';
export const DARK_TEXT = '#0F172A';

/** Returns whichever of crisp white or deep charcoal reads better on `background`. */
export function pickForeground(background: string): string {
  return contrastRatio(background, LIGHT_TEXT) >= contrastRatio(background, DARK_TEXT)
    ? LIGHT_TEXT
    : DARK_TEXT;
}
