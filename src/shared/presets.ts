// Built-in colour schemes (copied from the approved mockup). Read-only.
import type { Preset } from './types';

const builtIn = (
  id: string,
  name: string,
  h: number,
  s: number,
  l: number,
  surfS: number,
  surfL: number,
  depth: number,
  style: Preset['style'],
): Preset => ({
  id: `builtin:${id}`,
  name,
  builtIn: true,
  frame: { h, s, l },
  surface: { linkHue: true, h, s: surfS, l: surfL, depth },
  style,
});

export const BUILT_IN_PRESETS: readonly Preset[] = [
  builtIn('crimson', 'Crimson + Obsidian', 0, 70, 36, 26, 8, 3, 'block'),
  builtIn('cobalt', 'Cobalt + Navy Slate', 212, 78, 34, 32, 11, 4, 'brackets'),
  builtIn('emerald', 'Emerald + Pine Gray', 152, 68, 28, 22, 9, 3, 'chevrons'),
  builtIn('amber', 'Amber + Warm Charcoal', 36, 88, 42, 18, 12, 3, 'block'),
  builtIn('violet', 'Violet + Deep Dusk', 268, 65, 35, 28, 10, 4, 'spaced'),
  builtIn('stealth', 'Stealth Neutral Gray', 220, 15, 24, 0, 13, 3, 'brackets'),
];
