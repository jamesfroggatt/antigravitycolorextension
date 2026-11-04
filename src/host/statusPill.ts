// The optional workspace badge at the far left of the status bar.
import * as vscode from 'vscode';
import { pillText, sanitizeLabel } from '../shared/title';
import type { IdentityProfile } from '../shared/types';

export const PANEL_FOCUS_COMMAND = 'workspaceIdentity.panel.focus';

export class StatusPill implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(
    'workspaceIdentity.pill',
    vscode.StatusBarAlignment.Left,
    10000,
  );

  constructor() {
    this.item.name = 'Workspace Identity';
    this.item.command = PANEL_FOCUS_COMMAND;
  }

  /** Only shown for workspaces that have actually been given an identity. */
  update(profile: IdentityProfile | undefined, folderName: string): void {
    if (!profile || !profile.title.statusPill) {
      this.item.hide();
      return;
    }
    const text = pillText(profile.title, sanitizeLabel(folderName));
    if (!text) {
      this.item.hide();
      return;
    }
    this.item.text = `$(window) ${text}`;
    this.item.tooltip = `${text} — click to open Workspace Identity`;
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
