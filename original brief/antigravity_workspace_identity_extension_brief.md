# Project Brief: Workspace Identity & Colorizer Extension
**Target Host:** Antigravity IDE & Visual Studio Code (OpenVSX / VSIX)  
**Architecture Strategy:** Option A (100% Native Workbench APIs & Safe Title Prominence)  
**Document Purpose:** Baseline functional and product specification for technical architecture design.

---

## 1. Executive Summary & Objective
Developers frequently run multiple instances of Antigravity IDE simultaneously across monitors or virtual desktops (e.g., Frontend, Backend API, Microservice, or Production vs. Staging). By default, every instance shares the same user theme and identical dark/gray editor backgrounds, making windows visually indistinguishable at a glance.

**Objective:** Build a lightweight, zero-latency sidebar extension that allows users to:
1. Inspect the active workspace's current window frame, header, and inner background ("gray") colors.
2. Adjust both the **Outer Window Frame** (Title Bar, Activity Bar, Borders, Status Bar) and the **Inner Workspace Surfaces ("The Grays")** (Code Editor window, Claude Code / AI Agent panel, Sidebars, Tabs, and Terminal) live using intuitive sliders.
3. Customize the top window title (`[Workspace] - Antigravity IDE`) and amplify its visual prominence using native, warning-free workbench techniques.
4. Persist configurations per workspace and save reusable full-workspace color schemes (presets) accessible across all open IDE instances.

---

## 2. Target Platform & Technical Stack
* **Runtime Engine:** VS Code Extension Host (Node.js) compatible with Antigravity IDE $\ge 1.85.0$.
* **Backend Language:** TypeScript (compiled via `esbuild` or `webpack`).
* **Frontend UI:** VS Code Webview View API (`vscode.WebviewViewProvider`) built with HTML5, CSS3, and vanilla TypeScript (or lightweight Preact/React).
* **Configuration API:** `vscode.workspace.getConfiguration()` targeting `workbench.colorCustomizations` and `window.title`.
* **Global Storage API:** `ExtensionContext.globalState` for cross-instance preset synchronization and optional Git-clean workspace persistence.

---

## 3. Core Functional Requirements

### FR-1: Live Theme Initialization & Sync
* **Behavior:** When the user opens the *Workspace Identity* sidebar panel, all sliders and swatches automatically initialize with the current workspace's active frame colors and inner editor/panel background grays.
* **Mechanism:**
  1. Check `.vscode/settings.json` (`workbench.colorCustomizations`) for existing overrides (`titleBar.activeBackground`, `editor.background`, `sideBar.background`, `panel.background`).
  2. If no custom override exists, read the active theme's computed values from the Webview's injected CSS variables (`--vscode-titleBar-activeBackground`, `--vscode-editor-background`, `--vscode-sideBar-background`), convert Hex to HSL, and position both the Frame and Surface sliders accordingly.
  3. Listen to `vscode.workspace.onDidChangeConfiguration` so external edits to `settings.json` immediately update the extension UI.

### FR-2: Dual-Layer Real-Time Color Manipulation (Outer Frame + Inner "Grays")
To make an entire IDE instance unmistakable—even when looking purely at the code canvas or the Claude Code panel—the extension provides two coordinated slider groups:

#### Layer A: Outer Window Frame Sliders
* **Controls:** **Frame Hue ($0^\circ\text{--}360^\circ$)**, **Frame Saturation ($0\%\text{--}100\%$)**, and **Frame Lightness ($10\%\text{--}90\%$)**.
* **Target Zones:**
  * **Title Bar / Window Header** (`titleBar.activeBackground`, `titleBar.inactiveBackground`)
  * **Activity Bar** (`activityBar.background`, `activityBar.activeBorder`)
  * **Window Active Border** (`window.activeBorder`, `window.inactiveBorder`)
  * **Status Bar** (`statusBar.background`)
* **Auto-Contrast Guard:** Calculates relative luminance ($L$) of the header background and automatically sets foreground text (`titleBar.activeForeground`, `activityBar.foreground`, `statusBar.foreground`) to crisp white (`#FFFFFF`) when $L < 0.54$ or deep charcoal (`#0F172A`) when $L \ge 0.54$.

#### Layer B: Inner Workspace Surfaces ("The Grays" — Editor, Claude Code, Sidebars, Terminal)
* **Controls:**
  * **Link Hue to Header Toggle:** When enabled, the inner workspace grays automatically adopt the same Hue angle as the outer frame so the editor canvas and Claude Code window share a cohesive undertone. When disabled, users can set an independent **Surface Hue ($0^\circ\text{--}360^\circ$)** slider.
  * **Surface Tint / Saturation ($0\%\text{--}50\%$):** At $0\%$, backgrounds are pure neutral grays (from pitch black to slate gray). Increasing saturation infuses the grays with a subtle, eye-friendly color tint (e.g., deep obsidian-crimson, midnight-cobalt, or forest-slate).
  * **Base Gray Level / Lightness ($4\%\text{--}32\%$):** Shifts the entire inner workspace from OLED pitch-black ($4\%$) through standard dark-theme charcoal ($10\%\text{--}16\%$) up to lighter slate gray ($25\%\text{--}32\%$).
  * **Panel Depth Separation ($0\%\text{--}8\%$):** Automatically steps the lightness between the **Code Editor** (base level), **Claude Code / Secondary AI Sidebar & Explorer** (slightly darker/lighter by $\Delta L$), and **Tab Bar / Breadcrumbs** so visual boundaries between panels remain crisp.
* **Per-Surface Override Mode:** Users can switch from *Synced Surfaces* to *Individual Surface Tuning* to independently adjust:
  1. **Code Editor Canvas & Gutter** (`editor.background`, `editorGutter.background`, `breadcrumb.background`)
  2. **Claude Code / AI Agent & Sidebars** (`sideBar.background`, `sideBarSectionHeader.background`, `chat.background`, `editorWidget.background`)
  3. **Editor Tabs & Group Headers** (`editorGroupHeader.tabsBackground`, `tab.activeBackground`, `tab.inactiveBackground`)
  4. **Bottom Panel & Terminal** (`panel.background`, `terminal.background`)

### FR-3: Native Title Customization & Visual Prominence (Option A)
Because Electron/VS Code does not expose a native font-size key exclusively for the top OS/Custom Title Bar without modifying internal application CSS files, this extension uses a **three-part native prominence system**:
1. **Custom Title Template (`window.title`):** Users enter a custom workspace label (e.g., `PAYMENTS API [PROD]`).
2. **Native High-Visibility Framing Presets:** One-click prominence formatters that wrap and expand the title string in the header bar for maximum visual footprint:
   * *Solid Block Banner:* `██  PAYMENTS API [PROD]  ██ — Antigravity IDE`
   * *Heavy Bracket Badge:* `【 PAYMENTS API [PROD] 】 — Antigravity IDE`
   * *Wide-Tracked Uppercase:* `P A Y M E N T S   A P I   —   Antigravity IDE`
   * *Alert Chevrons:* `⟫⟫⟫  PAYMENTS API [PROD]  ⟪⟪⟪ — Antigravity IDE`
3. **High-Contrast Status Bar Pill (Optional Mirror):** Creates a high-priority `vscode.StatusBarItem` aligned to the far-left of the bottom bar using the workspace's custom badge.

### FR-4: Workspace Persistence & Git Hygiene Toggle
* **Standard Mode (`.vscode/settings.json`):** Writes `workbench.colorCustomizations` and `window.title` directly to `vscode.ConfigurationTarget.Workspace`. Ensures `"window.titleBarStyle": "custom"` is enabled.
* **Clean-Git Mode (Optional Toggle):** Stores the workspace's color profile in `context.globalState` keyed by `workspace.uri.fsPath` or appends `.vscode/settings.json` to `.git/info/exclude` so personal colors never pollute `git status`.

### FR-5: Cross-Instance Preset Library
* **Save Complete Theme Preset:** Saves both the **Outer Frame** and **Inner Gray/Surface** settings together under a custom preset name (e.g., *"Crimson Prod + Obsidian Canvas"*, *"Cobalt + Slate Gray"*).
* **Cross-Instance Availability:** Stored in `ExtensionContext.globalState` so presets are immediately available across all open Antigravity IDE instances.

---

## 4. Target Workbench Configuration Keys
When sliders are adjusted, the extension writes a debounced ($\le 40\text{ ms}$) payload to `.vscode/settings.json` covering both the outer frame and inner gray surfaces:

```json
{
  "window.titleBarStyle": "custom",
  "window.title": "██  PAYMENTS API [PROD]  ██ — ${dirty}${activeEditorShort} — Antigravity IDE",
  "workbench.colorCustomizations": {
    "titleBar.activeBackground": "#991B1B",
    "titleBar.activeForeground": "#FFFFFF",
    "titleBar.inactiveBackground": "#5C1414",
    "titleBar.inactiveForeground": "#FCA5A5",
    "window.activeBorder": "#EF4444",
    "window.inactiveBorder": "#5C1414",
    "activityBar.background": "#7F1D1D",
    "activityBar.foreground": "#FFFFFF",
    "activityBar.activeBorder": "#EF4444",
    "statusBar.background": "#7F1D1D",
    "statusBar.foreground": "#FFFFFF",

    "editor.background": "#140C0C",
    "editorGutter.background": "#140C0C",
    "breadcrumb.background": "#180E0E",
    "editorGroupHeader.tabsBackground": "#1C1010",
    "tab.activeBackground": "#140C0C",
    "tab.inactiveBackground": "#1C1010",
    "sideBar.background": "#190F0F",
    "sideBarSectionHeader.background": "#221313",
    "editorWidget.background": "#190F0F",
    "panel.background": "#110A0A",
    "terminal.background": "#110A0A"
  }
}
```

---

## 5. User Interface & UX Specification (Sidebar Panel)
The sidebar Webview is organized into four clean cards:

1. **Header Title & Prominence Card**
   * Custom Workspace Display Name input + Native Prominence Style selector (`Block ██`, `Brackets 【 】`, `Wide Text`, `Chevrons ⟫⟫`).
2. **Outer Frame Color Sliders Card**
   * Hue, Saturation, and Lightness sliders for Title Bar, Window Border, Activity Bar, and Status Bar.
3. **Inner Surfaces / "The Grays" Sliders Card**
   * **Link Hue to Frame** checkbox + **Surface Hue** slider.
   * **Gray Level / Darkness** slider ($4\%$ OLED Black $\rightarrow 32\%$ Slate Gray).
   * **Surface Color Tint** slider ($0\%$ Pure Neutral Gray $\rightarrow 50\%$ Tinted Gray).
   * **Panel Depth Offset** slider (controls visual separation between the Code Editor, Claude Code / AI panel, and Sidebar).
   * **Per-Surface Checkboxes & Individual Fine-Tune:** `[x] Code Editor`, `[x] Claude Code / AI Sidebar`, `[x] Explorer & Sidebars`, `[x] Tabs & Terminal`.
4. **Global Presets & Workspace Reset Footer**
   * One-click preset swatches (storing both Frame and Inner Gray configurations) + `Reset Workspace to Theme Default`.

---

## 6. Extension Host $\leftrightarrow$ Webview Message Contract

| Direction | Command | Payload | Description |
| :--- | :--- | :--- | :--- |
| **Host $\rightarrow$ UI** | `INIT_STATE` | `{ frameHsl, surfaceConfig, currentTitle, presets }` | Sent when Webview resolves; hydrates Frame and Surface sliders. |
| **UI $\rightarrow$ Host** | `UPDATE_FRAME_COLORS` | `{ hsl, zones, contrastMode }` | Sent (debounced) when user drags Outer Frame sliders. |
| **UI $\rightarrow$ Host** | `UPDATE_SURFACE_COLORS` | `{ linkHue, surfaceHsl, depthStep, surfaceZones, perSurfaceOverrides }` | Sent (debounced) when user drags Inner Gray / Surface sliders. |
| **UI $\rightarrow$ Host** | `UPDATE_TITLE` | `{ label, prominenceStyle, forceUpper }` | Sent when user edits custom title text or prominence style. |
| **UI $\rightarrow$ Host** | `SAVE_PRESET` | `{ id, name, frameHsl, surfaceConfig, prominenceStyle }` | Saves complete Frame + Surface preset to `globalState`. |
| **UI $\rightarrow$ Host** | `RESET_WORKSPACE` | `{}` | Removes all managed keys from `workbench.colorCustomizations` and `window.title`. |

---

## 7. Acceptance Criteria for MVP
1. **Complete Surface Coverage:** Adjusting the Inner Surface ("Grays") sliders visibly updates the Code Editor background, Gutter, Tabs, Explorer Sidebar, Terminal, and docked AI/Extension panels (such as Claude Code).
2. **Readability Safeguard:** Inner surface lightness is clamped to a configurable safe range (default $4\%\text{--}32\%$ for dark themes) so syntax highlighting inside the code editor and text inside Claude Code remain crisp and legible.
3. **Zero-Latency Live Feedback:** Dragging either the Frame or Surface sliders updates the Antigravity IDE workspace smoothly in real time.
4. **Clean Reset:** Clicking *Reset to Theme Default* cleanly strips both Frame and Surface overrides from `.vscode/settings.json`.