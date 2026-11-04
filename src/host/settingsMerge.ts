// Pure helpers for merging our colour keys into an existing `workbench.colorCustomizations`
// object without disturbing anything we don't own. No `vscode` import, so it is unit-testable.
import { normalizeHex } from '../shared/color';
import { MANAGED_COLOR_KEYS } from '../shared/palette';

export type ColorMap = Record<string, unknown>;

const MANAGED = new Set(MANAGED_COLOR_KEYS);

/** Copy of `existing` with every managed key removed. Theme-scoped blocks (`"[Theme]": {…}`) are kept. */
export function stripManaged(existing: ColorMap | undefined | null): ColorMap {
  const out: ColorMap = {};
  for (const [key, value] of Object.entries(existing ?? {})) {
    if (!MANAGED.has(key)) out[key] = value;
  }
  return out;
}

/** Unrelated keys first (original order), then our managed keys. */
export function mergeManaged(existing: ColorMap | undefined | null, managed: Record<string, string>): ColorMap {
  return { ...stripManaged(existing), ...managed };
}

/** Just the managed keys that hold a string value, normalised to upper-case hex where possible. */
export function pickManaged(existing: ColorMap | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(existing ?? {})) {
    if (MANAGED.has(key) && typeof value === 'string') {
      out[key] = normalizeHexKeepAlpha(value);
    }
  }
  return out;
}

function normalizeHexKeepAlpha(value: string): string {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{8}$/.test(v)) return v.toUpperCase();
  return normalizeHex(v) ?? v;
}

/** True when both maps hold the same keys with the same colours (case-insensitive). */
export function sameColors(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => typeof b[k] === 'string' && normalizeHexKeepAlpha(a[k]) === normalizeHexKeepAlpha(b[k]));
}

export function isEmptyObject(value: ColorMap): boolean {
  return Object.keys(value).length === 0;
}

/** Order-insensitive JSON comparison, used to skip writes that would change nothing. */
export function sameJson(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
