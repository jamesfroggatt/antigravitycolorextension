// Coloured title bars only work with the IDE's custom title bar. `window.titleBarStyle` can only be
// set at user level (not per workspace), so we check it once and offer to switch.
import * as vscode from 'vscode';

const DISMISSED_KEY = 'workspaceIdentity.titleBarCheckDismissed';

export async function checkTitleBarStyle(ctx: vscode.ExtensionContext): Promise<void> {
  if (ctx.globalState.get<boolean>(DISMISSED_KEY)) return;
  const style = vscode.workspace.getConfiguration().inspect<string>('window.titleBarStyle');
  if (style?.globalValue !== 'native') return;

  const SWITCH = 'Switch to custom title bar';
  const NEVER = "Don't ask again";
  const choice = await vscode.window.showInformationMessage(
    'Workspace Identity: your title bar is set to "native", so its colour and custom title can\'t be shown. ' +
      'Switch to the custom title bar? (The IDE will ask to restart.)',
    SWITCH,
    NEVER,
  );
  if (choice === SWITCH) {
    await vscode.workspace
      .getConfiguration()
      .update('window.titleBarStyle', 'custom', vscode.ConfigurationTarget.Global);
  } else if (choice === NEVER) {
    await ctx.globalState.update(DISMISSED_KEY, true);
  }
}
