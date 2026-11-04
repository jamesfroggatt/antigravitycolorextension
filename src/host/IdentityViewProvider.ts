// Hosts the sidebar webview and forwards messages to the controller.
import * as vscode from 'vscode';
import type { HostToUi, UiToHost } from '../shared/types';
import type { Controller } from './controller';
import { getWebviewHtml } from './webviewHtml';

export class IdentityViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'workspaceIdentity.panel';
  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly controller: Controller,
    private readonly log: vscode.OutputChannel,
  ) {
    controller.setPoster((msg) => this.post(msg));
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.log.appendLine('[panel] Opening the sidebar panel…');
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')],
    };
    view.webview.html = getWebviewHtml(view.webview, this.extensionUri);
    view.webview.onDidReceiveMessage((msg: UiToHost) => void this.controller.handle(msg));
    view.onDidChangeVisibility(() => {
      if (view.visible) this.controller.refreshPresets();
    });
    view.onDidDispose(() => {
      if (this.view === view) this.view = undefined;
    });
  }

  private post(msg: HostToUi): void {
    void this.view?.webview.postMessage(msg);
  }
}
