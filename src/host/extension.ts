// Entry point: wires up the sidebar panel, settings writer, status pill and commands.
import * as vscode from 'vscode';
import { Controller } from './controller';
import { IdentityViewProvider } from './IdentityViewProvider';
import { ProfileStore } from './profileStore';
import { SettingsWriter } from './settingsWriter';
import { StatusPill } from './statusPill';
import { checkTitleBarStyle } from './titleBarCheck';

/** Small surface returned from activate() so integration tests can drive the extension. */
export interface WorkspaceIdentityApi {
  controller: Controller;
}

export function activate(ctx: vscode.ExtensionContext): WorkspaceIdentityApi {
  const log = vscode.window.createOutputChannel('Workspace Identity');
  const store = new ProfileStore(ctx);
  const writer = new SettingsWriter(log);
  const pill = new StatusPill();
  const controller = new Controller(store, writer, pill, log);
  const provider = new IdentityViewProvider(ctx.extensionUri, controller);

  ctx.subscriptions.push(
    log,
    writer,
    pill,
    controller,
    vscode.window.registerWebviewViewProvider(IdentityViewProvider.viewType, provider),
    vscode.commands.registerCommand('workspaceIdentity.applyPreset', (id?: unknown) =>
      controller.pickAndApplyPreset(id),
    ),
    vscode.commands.registerCommand('workspaceIdentity.reset', (skipConfirm?: unknown) =>
      controller.resetCommand(skipConfirm),
    ),
  );

  void checkTitleBarStyle(ctx);
  return { controller };
}

export function deactivate(): void {
  // Everything is disposed through ctx.subscriptions.
}
