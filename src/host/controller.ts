// Business logic between the sidebar panel, the settings writer and storage.
import * as vscode from 'vscode';
import { buildColorCustomizations, DEFAULT_LIMITS } from '../shared/palette';
import {
  applyPreset,
  defaultProfile,
  deriveProfileFromColors,
  normalizeProfile,
  profilesEqual,
} from '../shared/profile';
import { buildWindowTitle, isOwnTitle } from '../shared/title';
import type { HostToUi, IdentityProfile, InitState, Limits, ThemeKind, UiToHost } from '../shared/types';
import { setSettingsExcluded } from './gitHygiene';
import type { ProfileStore } from './profileStore';
import { pickManaged, sameColors, type ColorMap } from './settingsMerge';
import type { SettingsWriter } from './settingsWriter';
import type { StatusPill } from './statusPill';

type Poster = (msg: HostToUi) => void;

export class Controller implements vscode.Disposable {
  private post: Poster = () => undefined;
  /** Last profile sent to the panel, so we don't spam identical updates. */
  private lastPosted: string | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly store: ProfileStore,
    private readonly writer: SettingsWriter,
    private readonly pill: StatusPill,
    private readonly log: vscode.OutputChannel,
  ) {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => this.onConfigChanged(e)),
      this.writer.onDidSettle(() => this.reconcile()),
      vscode.window.onDidChangeActiveColorTheme(() => this.sendInit()),
      vscode.window.onDidChangeWindowState((s) => s.focused && this.refreshPresets()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.updatePill();
        this.sendInit();
      }),
    );
    this.updatePill();
  }

  setPoster(post: Poster): void {
    this.post = post;
  }

  // ---- Environment -----------------------------------------------------------

  get limits(): Limits {
    const cfg = vscode.workspace.getConfiguration('workspaceIdentity');
    const a = cfg.get<number>('surfaceLightnessMin', DEFAULT_LIMITS.surfaceLMin);
    const b = cfg.get<number>('surfaceLightnessMax', DEFAULT_LIMITS.surfaceLMax);
    const min = Math.max(0, Math.min(100, Math.round(Math.min(a, b))));
    const max = Math.max(0, Math.min(100, Math.round(Math.max(a, b))));
    return { surfaceLMin: min, surfaceLMax: max };
  }

  private get hasFolder(): boolean {
    return (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
  }

  private get folderName(): string {
    return vscode.workspace.name ?? vscode.workspace.workspaceFolders?.[0]?.name ?? '';
  }

  /** Clean-Git only applies when settings live in a single folder's .vscode/settings.json on disk. */
  private get cleanGitFolder(): vscode.WorkspaceFolder | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length !== 1 || vscode.workspace.workspaceFile) return undefined;
    return folders[0].uri.scheme === 'file' ? folders[0] : undefined;
  }

  private themeKind(): ThemeKind {
    switch (vscode.window.activeColorTheme.kind) {
      case vscode.ColorThemeKind.Light:
        return 'light';
      case vscode.ColorThemeKind.HighContrast:
        return 'hcDark';
      case vscode.ColorThemeKind.HighContrastLight:
        return 'hcLight';
      default:
        return 'dark';
    }
  }

  private workspaceColors(): ColorMap | undefined {
    return vscode.workspace.getConfiguration().inspect<ColorMap>('workbench.colorCustomizations')?.workspaceValue;
  }

  /** A profile reconstructed from managed keys already in settings.json (e.g. committed by someone). */
  private derivedFromSettings(): IdentityProfile | undefined {
    const actual = pickManaged(this.workspaceColors());
    if (Object.keys(actual).length === 0) return undefined;
    return deriveProfileFromColors(actual, defaultProfile(), { zonesFrom: actual, limits: this.limits });
  }

  /** Stored profile, else one derived from settings.json, else null (panel reads the theme). */
  private effectiveProfile(): IdentityProfile | null {
    return this.store.getProfile(this.limits) ?? this.derivedFromSettings() ?? null;
  }

  initState(): InitState {
    return {
      profile: this.hasFolder ? this.effectiveProfile() : null,
      presets: this.store.allPresets(),
      hasFolder: this.hasFolder,
      folderName: this.folderName,
      appName: vscode.env.appName,
      themeKind: this.themeKind(),
      limits: this.limits,
      cleanGit: this.store.getCleanGit(),
      cleanGitAvailable: this.cleanGitFolder !== undefined,
    };
  }

  // ---- Panel messages --------------------------------------------------------

  sendInit(): void {
    const state = this.initState();
    this.lastPosted = JSON.stringify(state.profile);
    this.post({ type: 'INIT_STATE', ...state });
  }

  refreshPresets(): void {
    this.post({ type: 'PRESETS_UPDATED', presets: this.store.allPresets() });
  }

  private postProfile(profile: IdentityProfile | null): void {
    const json = JSON.stringify(profile);
    if (json === this.lastPosted) return;
    this.lastPosted = json;
    this.post({ type: 'STATE_CHANGED', profile });
  }

  private notice(level: 'info' | 'warning' | 'error', text: string): void {
    this.post({ type: 'NOTICE', level, text });
  }

  async handle(msg: UiToHost): Promise<void> {
    try {
      switch (msg?.type) {
        case 'READY':
          this.sendInit();
          return;
        case 'UPDATE_FRAME_COLORS':
        case 'UPDATE_SURFACE_COLORS':
        case 'UPDATE_TITLE':
          this.applyFromPanel(msg.profile);
          return;
        case 'SAVE_PRESET': {
          const name = String(msg.name ?? '').trim();
          if (!name) return;
          await this.store.savePreset(name, normalizeProfile(msg.profile, this.limits));
          this.refreshPresets();
          this.notice('info', `Saved "${name}". It's now available in every window.`);
          return;
        }
        case 'APPLY_PRESET':
          await this.applyPresetById(String(msg.id), normalizeProfile(msg.profile, this.limits));
          return;
        case 'DELETE_PRESET':
          await this.store.deletePreset(String(msg.id));
          this.refreshPresets();
          return;
        case 'SET_CLEAN_GIT':
          await this.setCleanGit(msg.enabled === true);
          return;
        case 'RESET_WORKSPACE':
          await this.reset();
          return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.appendLine(`[handle ${msg?.type}] ${message}`);
      this.notice('error', message);
    }
  }

  /** Slider / title changes from the panel. Writes first, then remembers (latest always wins). */
  private applyFromPanel(raw: unknown): void {
    if (!this.hasFolder) return;
    const profile = normalizeProfile(raw, this.limits);
    void this.writer.apply(profile, this.limits);
    void this.store.setProfile(profile);
    this.lastPosted = JSON.stringify(profile);
    this.updatePill(profile);
  }

  /** Applies a profile from the host side (presets) and tells the panel. */
  private async applyFromHost(profile: IdentityProfile): Promise<void> {
    await this.store.setProfile(profile);
    this.updatePill(profile);
    this.postProfile(profile);
    await this.writer.apply(profile, this.limits);
  }

  async applyPresetById(id: string, base?: IdentityProfile): Promise<boolean> {
    if (!this.hasFolder) return false;
    const preset = this.store.findPreset(id);
    if (!preset) return false;
    await this.applyFromHost(applyPreset(base ?? this.effectiveProfile() ?? defaultProfile(), preset, this.limits));
    return true;
  }

  async reset(): Promise<void> {
    await this.writer.reset();
    await this.store.setProfile(undefined);
    this.updatePill(undefined);
    this.postProfile(null);
  }

  private async setCleanGit(enabled: boolean): Promise<void> {
    const folder = this.cleanGitFolder;
    if (!folder) {
      this.notice('warning', 'Keeping colours out of git only works when a single folder is open (not a multi-folder workspace).');
    } else {
      const result = await setSettingsExcluded(folder.uri.fsPath, enabled);
      if (result.ok) await this.store.setCleanGit(enabled);
      this.notice(result.level, result.message);
    }
    this.post({ type: 'CLEAN_GIT_CHANGED', enabled: this.store.getCleanGit() });
  }

  // ---- Commands ---------------------------------------------------------------

  async pickAndApplyPreset(id?: unknown): Promise<void> {
    if (!this.hasFolder) {
      void vscode.window.showWarningMessage('Workspace Identity: open a folder first.');
      return;
    }
    if (typeof id === 'string') {
      await this.applyPresetById(id);
      return;
    }
    const picked = await vscode.window.showQuickPick(
      this.store.allPresets().map((p) => ({
        label: p.name,
        description: p.builtIn ? 'built-in' : 'saved',
        id: p.id,
      })),
      { placeHolder: 'Choose a colour scheme for this window' },
    );
    if (picked) await this.applyPresetById(picked.id);
  }

  async resetCommand(skipConfirm?: unknown): Promise<void> {
    if (skipConfirm !== true) {
      const RESET = 'Reset';
      const choice = await vscode.window.showWarningMessage(
        "Reset this window's colours and title back to the theme default?",
        { modal: true },
        RESET,
      );
      if (choice !== RESET) return;
    }
    await this.reset();
  }

  // ---- Keeping in sync with settings.json -----------------------------------

  private onConfigChanged(e: vscode.ConfigurationChangeEvent): void {
    if (e.affectsConfiguration('workspaceIdentity')) {
      const profile = this.store.getProfile(this.limits);
      if (profile) void this.writer.apply(profile, this.limits);
      this.sendInit();
      return;
    }
    if (e.affectsConfiguration('workbench.colorCustomizations') || e.affectsConfiguration('window.title')) {
      // Our own writes echo back here; wait until they've settled, then compare.
      if (!this.writer.busy) this.reconcile();
    }
  }

  /** Detects hand edits to settings.json and moves the sliders to match (FR-1.3). */
  private reconcile(): void {
    if (!this.hasFolder || this.writer.busy) return;
    const limits = this.limits;
    const stored = this.store.getProfile(limits);
    if (!stored) {
      this.postProfile(this.derivedFromSettings() ?? null);
      return;
    }

    const cfg = vscode.workspace.getConfiguration();
    const actual = pickManaged(this.workspaceColors());
    const wsTitle = cfg.inspect<string>('window.title')?.workspaceValue;
    const expected = buildColorCustomizations(stored, limits);

    if (Object.keys(actual).length === 0 && wsTitle === undefined) {
      // Someone deleted everything by hand – same as a reset.
      void this.store.setProfile(undefined);
      this.updatePill(undefined);
      this.postProfile(null);
      return;
    }

    let next = stored;
    if (!sameColors(actual, expected)) {
      // Only re-read the main colours that actually changed, so sliders don't drift by rounding.
      const changed: Record<string, string> = {};
      for (const key of ['titleBar.activeBackground', 'editor.background', 'sideBar.background']) {
        if (actual[key] && actual[key] !== expected[key]) changed[key] = actual[key];
      }
      next = deriveProfileFromColors(changed, stored, { zonesFrom: actual, limits });
    }
    if (buildWindowTitle(next.title) !== undefined && !isOwnTitle(wsTitle)) {
      // Our title was removed or replaced by hand – stop managing it.
      next = { ...next, title: { ...next.title, label: '' } };
    }
    if (!profilesEqual(next, stored)) {
      this.log.appendLine('[sync] settings.json was edited outside the panel; updating sliders.');
      void this.store.setProfile(next);
      this.updatePill(next);
      this.postProfile(next);
    }
  }

  private updatePill(profile: IdentityProfile | undefined = this.store.getProfile(this.limits)): void {
    this.pill.update(this.hasFolder ? profile : undefined, this.folderName);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
