// "Keep colours out of git": adds .vscode/settings.json to this clone's private ignore list
// (.git/info/exclude). Nothing is committed, and other people's clones are unaffected.
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export const EXCLUDE_MARKER = '# Added by Workspace Identity (keeps personal window colours out of git)';
export const EXCLUDE_LINE = '/.vscode/settings.json';

export interface GitResult {
  ok: boolean;
  level: 'info' | 'warning' | 'error';
  message: string;
}

function git(args: string[], cwd: string): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, windowsHide: true, timeout: 10000 }, (err, stdout) => {
      resolve({ ok: !err, stdout: String(stdout ?? '') });
    });
  });
}

/** Adds (enabled) or removes (disabled) our line in .git/info/exclude. */
export async function setSettingsExcluded(folder: string, enabled: boolean): Promise<GitResult> {
  const where = await git(['rev-parse', '--git-path', 'info/exclude'], folder);
  if (!where.ok || !where.stdout.trim()) {
    return {
      ok: false,
      level: 'warning',
      message: "This folder isn't a git repository (or git isn't installed), so there's nothing to keep the colours out of.",
    };
  }
  const excludePath = path.resolve(folder, where.stdout.trim());

  let text = '';
  try {
    text = await fs.readFile(excludePath, 'utf8');
  } catch {
    // File doesn't exist yet – that's fine.
  }
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.length ? text.split(/\r?\n/) : [];

  if (enabled) {
    const alreadyIgnored = lines.some((l) => {
      const t = l.trim();
      return t === EXCLUDE_LINE || t === '.vscode/settings.json';
    });
    if (!alreadyIgnored) {
      const prefix = text.length && !text.endsWith('\n') ? eol : '';
      await fs.mkdir(path.dirname(excludePath), { recursive: true });
      await fs.writeFile(excludePath, `${text}${prefix}${EXCLUDE_MARKER}${eol}${EXCLUDE_LINE}${eol}`, 'utf8');
    }
    const tracked = await git(['ls-files', '--error-unmatch', '.vscode/settings.json'], folder);
    if (tracked.ok) {
      return {
        ok: true,
        level: 'warning',
        message:
          "Done – but .vscode/settings.json is already committed to this repository, so git will still notice changes to it. " +
          'To stop that, the file would need to be removed from the repository (git rm --cached .vscode/settings.json, then commit), ' +
          'which also removes it for everyone else who uses this repository.',
      };
    }
    return { ok: true, level: 'info', message: 'Your window colours will now stay out of git for this project.' };
  }

  // Disabling: remove only the two lines we added.
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === EXCLUDE_MARKER && lines[i + 1]?.trim() === EXCLUDE_LINE) {
      i++;
      continue;
    }
    out.push(lines[i]);
  }
  if (out.length !== lines.length) {
    await fs.writeFile(excludePath, out.join(eol), 'utf8');
  }
  return { ok: true, level: 'info', message: 'Git will see .vscode/settings.json again for this project.' };
}
