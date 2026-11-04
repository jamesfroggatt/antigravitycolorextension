import { describe, expect, it } from 'vitest';
import { LatestWinsQueue } from '../src/host/latestWinsQueue';
import { mergeManaged, pickManaged, sameColors, sameJson, stripManaged } from '../src/host/settingsMerge';

describe('mergeManaged / stripManaged', () => {
  const existing = {
    'editorCursor.foreground': '#FF00FF',
    'titleBar.activeBackground': '#123456',
    '[Visual Studio Dark]': { 'editor.background': '#000000' },
  };

  it('keeps unrelated keys and theme-scoped blocks', () => {
    const merged = mergeManaged(existing, { 'titleBar.activeBackground': '#991B1B' });
    expect(merged).toEqual({
      'editorCursor.foreground': '#FF00FF',
      '[Visual Studio Dark]': { 'editor.background': '#000000' },
      'titleBar.activeBackground': '#991B1B',
    });
  });

  it('removes managed keys that are no longer wanted', () => {
    const merged = mergeManaged({ ...existing, 'statusBar.background': '#111111' }, {});
    expect(merged).not.toHaveProperty('statusBar.background');
    expect(merged).not.toHaveProperty('titleBar.activeBackground');
  });

  it('strip leaves only what we do not own', () => {
    expect(stripManaged(existing)).toEqual({
      'editorCursor.foreground': '#FF00FF',
      '[Visual Studio Dark]': { 'editor.background': '#000000' },
    });
    expect(stripManaged(undefined)).toEqual({});
  });
});

describe('pickManaged / sameColors', () => {
  it('normalises case so hand-typed lower case still matches', () => {
    const picked = pickManaged({ 'editor.background': '#140c0c', 'editorCursor.foreground': '#fff' });
    expect(picked).toEqual({ 'editor.background': '#140C0C' });
    expect(sameColors(picked, { 'editor.background': '#140C0C' })).toBe(true);
    expect(sameColors(picked, { 'editor.background': '#140C0D' })).toBe(false);
    expect(sameColors(picked, {})).toBe(false);
  });

  it('keeps alpha on 8-digit colours', () => {
    expect(pickManaged({ 'activityBar.inactiveForeground': '#ffffff99' })).toEqual({
      'activityBar.inactiveForeground': '#FFFFFF99',
    });
  });
});

describe('sameJson', () => {
  it('ignores key order', () => {
    expect(sameJson({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
    expect(sameJson({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe('LatestWinsQueue', () => {
  it('runs one job at a time and skips stale requests', async () => {
    const seen: number[] = [];
    let concurrent = 0;
    let maxConcurrent = 0;
    const queue = new LatestWinsQueue<number>(async (n) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 5));
      seen.push(n);
      concurrent--;
    });
    for (let i = 1; i <= 10; i++) queue.push(i);
    expect(queue.busy).toBe(true);
    await queue.whenIdle();
    expect(queue.busy).toBe(false);
    expect(maxConcurrent).toBe(1);
    expect(seen[0]).toBe(1);
    expect(seen[seen.length - 1]).toBe(10);
    expect(seen.length).toBe(2);
  });

  it('keeps going after a failed job', async () => {
    const errors: unknown[] = [];
    const done: number[] = [];
    const queue = new LatestWinsQueue<number>(
      async (n) => {
        if (n === 1) throw new Error('boom');
        done.push(n);
      },
      (e) => errors.push(e),
    );
    queue.push(1);
    await queue.whenIdle();
    queue.push(2);
    await queue.whenIdle();
    expect(errors).toHaveLength(1);
    expect(done).toEqual([2]);
  });
});
