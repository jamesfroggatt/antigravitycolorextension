// Window-title formatting ("Option A" native prominence styles).
import type { ProminenceStyle, TitleConfig } from './types';

/** Written to `window.titleSeparator` so `${separator}` renders as an em dash. */
export const TITLE_SEPARATOR = ' — ';

/** Everything after the framed label. Also used to recognise titles this extension wrote. */
export const TITLE_SUFFIX = '${separator}${dirty}${activeEditorShort}${separator}${appName}';

/**
 * `$` starts a variable in VS Code's title template, so strip it (and braces) from user text.
 * Also collapses whitespace so the label stays on one line.
 */
export function sanitizeLabel(label: string): string {
  return label.replace(/[${}]/g, '').replace(/\s+/g, ' ').trim();
}

export function formatLabel(label: string, style: ProminenceStyle, forceUpper: boolean): string {
  const clean = sanitizeLabel(label);
  if (!clean) return '';
  const base = forceUpper ? clean.toUpperCase() : clean;
  switch (style) {
    case 'block':
      return `██  ${base}  ██`;
    case 'brackets':
      return `【 ${base} 】`;
    case 'spaced':
      return [...base].join(' ');
    case 'chevrons':
      return `⟫⟫⟫  ${base}  ⟪⟪⟪`;
  }
}

/** The `window.title` template, or undefined when no custom label is set. */
export function buildWindowTitle(title: TitleConfig): string | undefined {
  const framed = formatLabel(title.label, title.style, title.forceUpper);
  return framed ? `${framed}${TITLE_SUFFIX}` : undefined;
}

/** True when `value` looks like a `window.title` this extension wrote. */
export function isOwnTitle(value: unknown): value is string {
  return typeof value === 'string' && value.endsWith(TITLE_SUFFIX);
}

/** What the title bar will roughly show, for the panel's preview line. */
export function previewTitle(title: TitleConfig, fileName: string, appName: string): string {
  const framed = formatLabel(title.label, title.style, title.forceUpper);
  return [framed, fileName, appName].filter(Boolean).join(TITLE_SEPARATOR);
}

/** Text for the status-bar pill (falls back to the folder name). */
export function pillText(title: TitleConfig, folderName: string): string {
  const base = sanitizeLabel(title.label) || folderName;
  return title.forceUpper ? base.toUpperCase() : base;
}
