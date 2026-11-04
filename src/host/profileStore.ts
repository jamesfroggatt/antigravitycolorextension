// Where things are remembered:
//   workspaceState – this workspace's slider positions and Clean-Git flag (never in the repo)
//   globalState    – saved presets, shared by every window (and synced by Settings Sync)
import * as vscode from 'vscode';
import { BUILT_IN_PRESETS } from '../shared/presets';
import { isValidPreset, normalizeProfile, presetFromProfile } from '../shared/profile';
import { PROMINENCE_STYLES, type IdentityProfile, type Limits, type Preset } from '../shared/types';

const PROFILE_KEY = 'workspaceIdentity.profile';
const CLEAN_GIT_KEY = 'workspaceIdentity.cleanGit';
const PRESETS_KEY = 'workspaceIdentity.userPresets';

export class ProfileStore {
  constructor(private readonly ctx: vscode.ExtensionContext) {
    ctx.globalState.setKeysForSync([PRESETS_KEY]);
  }

  getProfile(limits: Limits): IdentityProfile | undefined {
    const raw = this.ctx.workspaceState.get<unknown>(PROFILE_KEY);
    return raw ? normalizeProfile(raw, limits) : undefined;
  }

  async setProfile(profile: IdentityProfile | undefined): Promise<void> {
    await this.ctx.workspaceState.update(PROFILE_KEY, profile);
  }

  getCleanGit(): boolean {
    return this.ctx.workspaceState.get<boolean>(CLEAN_GIT_KEY) === true;
  }

  async setCleanGit(enabled: boolean): Promise<void> {
    await this.ctx.workspaceState.update(CLEAN_GIT_KEY, enabled || undefined);
  }

  /** Read fresh every time – another window may have just saved one. */
  userPresets(): Preset[] {
    const raw = this.ctx.globalState.get<unknown>(PRESETS_KEY);
    if (!Array.isArray(raw)) return [];
    return raw.filter(isValidPreset).map((p) => ({
      ...p,
      builtIn: false,
      style: PROMINENCE_STYLES.includes(p.style) ? p.style : 'block',
    }));
  }

  allPresets(): Preset[] {
    return [...BUILT_IN_PRESETS, ...this.userPresets()];
  }

  findPreset(id: string): Preset | undefined {
    return this.allPresets().find((p) => p.id === id);
  }

  /** Saves the current colours under `name`. A user preset with the same name is replaced. */
  async savePreset(name: string, profile: IdentityProfile): Promise<Preset> {
    const presets = this.userPresets();
    const existing = presets.findIndex((p) => p.name.toLowerCase() === name.trim().toLowerCase());
    const id = existing >= 0 ? presets[existing].id : `user:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const preset = presetFromProfile(id, name, profile);
    if (existing >= 0) presets[existing] = preset;
    else presets.push(preset);
    await this.ctx.globalState.update(PRESETS_KEY, presets);
    return preset;
  }

  async deletePreset(id: string): Promise<void> {
    const presets = this.userPresets().filter((p) => p.id !== id);
    await this.ctx.globalState.update(PRESETS_KEY, presets);
  }
}
