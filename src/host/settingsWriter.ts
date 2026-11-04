// Writes the managed colour keys and window title to the *workspace* settings layer.
import * as vscode from 'vscode';
import { buildColorCustomizations, DEFAULT_LIMITS } from '../shared/palette';
import { TITLE_SEPARATOR, buildWindowTitle, isOwnTitle } from '../shared/title';
import type { IdentityProfile, Limits } from '../shared/types';
import { LatestWinsQueue } from './latestWinsQueue';
import { isEmptyObject, mergeManaged, sameJson, type ColorMap } from './settingsMerge';

interface WriteRequest {
  /** `null` = strip everything we manage (reset). */
  profile: IdentityProfile | null;
  limits: Limits;
}

/** How long after the last write before we treat further config events as someone else's edit. */
const SETTLE_MS = 250;

export class SettingsWriter implements vscode.Disposable {
  private readonly queue: LatestWinsQueue<WriteRequest>;
  private settleTimer: ReturnType<typeof setTimeout> | undefined;
  private lastErrorAt = 0;
  private readonly settled = new vscode.EventEmitter<void>();
  /** Fires once writes have stopped for a moment – a good time to re-check settings.json. */
  readonly onDidSettle = this.settled.event;

  constructor(private readonly log: vscode.OutputChannel) {
    this.queue = new LatestWinsQueue((req) => this.write(req), (err) => this.reportError(err));
  }

  /** True while writes are queued, running, or have only just finished. */
  get busy(): boolean {
    return this.queue.busy || this.settleTimer !== undefined;
  }

  apply(profile: IdentityProfile, limits: Limits): Promise<void> {
    this.queue.push({ profile, limits });
    return this.queue.whenIdle();
  }

  reset(): Promise<void> {
    this.queue.push({ profile: null, limits: DEFAULT_LIMITS });
    return this.queue.whenIdle();
  }

  private async write({ profile, limits }: WriteRequest): Promise<void> {
    const cfg = vscode.workspace.getConfiguration();
    const target = vscode.ConfigurationTarget.Workspace;

    // Only ever read the workspace layer, so user-level colours aren't copied into the project.
    const current = cfg.inspect<ColorMap>('workbench.colorCustomizations')?.workspaceValue;
    const next = mergeManaged(current, profile ? buildColorCustomizations(profile, limits) : {});
    if (!sameJson(current ?? {}, next)) {
      await cfg.update('workbench.colorCustomizations', isEmptyObject(next) ? undefined : next, target);
    }

    const currentTitle = cfg.inspect<string>('window.title')?.workspaceValue;
    const currentSep = cfg.inspect<string>('window.titleSeparator')?.workspaceValue;
    const title = profile ? buildWindowTitle(profile.title) : undefined;
    if (title !== undefined) {
      if (currentSep !== TITLE_SEPARATOR) await cfg.update('window.titleSeparator', TITLE_SEPARATOR, target);
      if (currentTitle !== title) await cfg.update('window.title', title, target);
    } else if (isOwnTitle(currentTitle)) {
      // Only remove a title we wrote; never touch one the user set themselves.
      await cfg.update('window.title', undefined, target);
      if (currentSep === TITLE_SEPARATOR) await cfg.update('window.titleSeparator', undefined, target);
    }

    this.armSettle();
  }

  private armSettle(): void {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.settleTimer = undefined;
      if (!this.queue.busy) this.settled.fire();
    }, SETTLE_MS);
  }

  private reportError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.log.appendLine(`[write] ${message}`);
    this.armSettle();
    // Don't spam a toast on every slider tick if settings.json is broken.
    if (Date.now() - this.lastErrorAt > 5000) {
      this.lastErrorAt = Date.now();
      void vscode.window.showErrorMessage(`Workspace Identity couldn't save your colours: ${message}`);
    }
  }

  dispose(): void {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settled.dispose();
  }
}
