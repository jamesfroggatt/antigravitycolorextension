// Types shared by the extension host and the sidebar webview.

export type ProminenceStyle = 'block' | 'brackets' | 'spaced' | 'chevrons';
export const PROMINENCE_STYLES: readonly ProminenceStyle[] = ['block', 'brackets', 'spaced', 'chevrons'];

export interface FrameZones {
  titleBar: boolean;
  windowBorder: boolean;
  activityBar: boolean;
  statusBar: boolean;
}

export interface SurfaceZones {
  editor: boolean;
  /** Explorer sidebar AND the secondary sidebar where Claude Code docks (they share `sideBar.background`). */
  sidebars: boolean;
  tabs: boolean;
  panel: boolean;
}

export interface TitleConfig {
  /** Custom workspace label. Empty = leave the IDE's default window title alone. */
  label: string;
  style: ProminenceStyle;
  forceUpper: boolean;
  statusPill: boolean;
}

export interface FrameConfig {
  h: number;
  s: number;
  l: number;
  zones: FrameZones;
}

export interface SurfaceConfig {
  /** When true the surface hue follows the frame hue. */
  linkHue: boolean;
  h: number;
  s: number;
  l: number;
  /** Lightness step (percentage points) between the editor and the sidebars / Claude Code panel. */
  depth: number;
  zones: SurfaceZones;
}

export interface IdentityProfile {
  title: TitleConfig;
  frame: FrameConfig;
  surface: SurfaceConfig;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export interface Preset {
  id: string;
  name: string;
  builtIn?: boolean;
  frame: Hsl;
  surface: { linkHue: boolean; h: number; s: number; l: number; depth: number };
  style: ProminenceStyle;
}

export interface Limits {
  surfaceLMin: number;
  surfaceLMax: number;
}

export type ThemeKind = 'dark' | 'light' | 'hcDark' | 'hcLight';

export interface InitState {
  /** Stored or derived-from-settings profile. `null` = nothing applied yet; the panel reads the theme's colours. */
  profile: IdentityProfile | null;
  presets: Preset[];
  hasFolder: boolean;
  folderName: string;
  appName: string;
  themeKind: ThemeKind;
  limits: Limits;
  cleanGit: boolean;
  /** Clean-Git only makes sense when settings live in `.vscode/settings.json` of a single folder. */
  cleanGitAvailable: boolean;
}

// ---- Webview → host messages -------------------------------------------------
export type UiToHost =
  | { type: 'READY' }
  | { type: 'LOG'; text: string }
  | { type: 'UPDATE_FRAME_COLORS'; profile: IdentityProfile }
  | { type: 'UPDATE_SURFACE_COLORS'; profile: IdentityProfile }
  | { type: 'UPDATE_TITLE'; profile: IdentityProfile }
  | { type: 'SAVE_PRESET'; name: string; profile: IdentityProfile }
  | { type: 'APPLY_PRESET'; id: string; profile: IdentityProfile }
  | { type: 'DELETE_PRESET'; id: string }
  | { type: 'SET_CLEAN_GIT'; enabled: boolean }
  | { type: 'RESET_WORKSPACE' };

// ---- Host → webview messages -------------------------------------------------
export type NoticeLevel = 'info' | 'warning' | 'error';

export type HostToUi =
  | ({ type: 'INIT_STATE' } & InitState)
  | { type: 'STATE_CHANGED'; profile: IdentityProfile | null }
  | { type: 'PRESETS_UPDATED'; presets: Preset[] }
  | { type: 'CLEAN_GIT_CHANGED'; enabled: boolean }
  | { type: 'NOTICE'; level: NoticeLevel; text: string };
