import { describe, expect, it } from 'vitest';
import {
  TITLE_SUFFIX,
  buildWindowTitle,
  formatLabel,
  isOwnTitle,
  pillText,
  previewTitle,
  sanitizeLabel,
} from '../src/shared/title';
import type { TitleConfig } from '../src/shared/types';

const title = (over: Partial<TitleConfig> = {}): TitleConfig => ({
  label: 'Payments API [prod]',
  style: 'block',
  forceUpper: true,
  statusPill: true,
  ...over,
});

describe('formatLabel', () => {
  it('formats all four prominence styles', () => {
    expect(formatLabel('Payments API', 'block', true)).toBe('██  PAYMENTS API  ██');
    expect(formatLabel('Payments API', 'brackets', true)).toBe('【 PAYMENTS API 】');
    expect(formatLabel('Payments API', 'spaced', true)).toBe('P A Y M E N T S   A P I');
    expect(formatLabel('Payments API', 'chevrons', true)).toBe('⟫⟫⟫  PAYMENTS API  ⟪⟪⟪');
  });

  it('respects Force ALL CAPS being off', () => {
    expect(formatLabel('Payments', 'block', false)).toBe('██  Payments  ██');
  });

  it('returns empty for an empty label', () => {
    expect(formatLabel('   ', 'block', true)).toBe('');
  });
});

describe('sanitizeLabel', () => {
  it('removes characters that would break the title template', () => {
    expect(sanitizeLabel('my ${rootName} app')).toBe('my rootName app');
    expect(sanitizeLabel('  two\n lines ')).toBe('two lines');
  });
});

describe('buildWindowTitle', () => {
  it('builds a template using VS Code variables', () => {
    expect(buildWindowTitle(title())).toBe(`██  PAYMENTS API [PROD]  ██${TITLE_SUFFIX}`);
    expect(buildWindowTitle(title())).toContain('${appName}');
  });

  it('returns undefined when there is no label (leave the IDE title alone)', () => {
    expect(buildWindowTitle(title({ label: '' }))).toBeUndefined();
  });

  it('recognises its own titles only', () => {
    expect(isOwnTitle(buildWindowTitle(title()))).toBe(true);
    expect(isOwnTitle('${dirty}${activeEditorShort}${separator}${rootName}')).toBe(false);
    expect(isOwnTitle(undefined)).toBe(false);
  });
});

describe('previewTitle / pillText', () => {
  it('shows a readable preview', () => {
    expect(previewTitle(title(), 'server.ts', 'Antigravity IDE')).toBe(
      '██  PAYMENTS API [PROD]  ██ — server.ts — Antigravity IDE',
    );
    expect(previewTitle(title({ label: '' }), 'server.ts', 'Antigravity IDE')).toBe('server.ts — Antigravity IDE');
  });

  it('falls back to the folder name for the pill', () => {
    expect(pillText(title({ label: '' }), 'payments-api')).toBe('PAYMENTS-API');
    expect(pillText(title({ forceUpper: false }), 'x')).toBe('Payments API [prod]');
  });
});
