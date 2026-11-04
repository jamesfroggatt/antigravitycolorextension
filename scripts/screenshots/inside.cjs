// Runs inside the IDE (as an "extension test") to stage a screenshot:
// applies a preset + title through the real extension, opens a file and the panel,
// then signals the outside script and waits until it has taken the picture.
const vscode = require('vscode');
const fs = require('node:fs');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

exports.run = async function run() {
  const shot = JSON.parse(process.env.WI_SHOT);
  const ext = vscode.extensions.getExtension('jamesfroggatt.workspace-identity');
  const { controller } = await ext.activate();

  await controller.handle({
    type: 'APPLY_PRESET',
    id: shot.preset,
    profile: { title: { label: shot.label, style: 'block', forceUpper: true, statusPill: true } },
  });

  const run = async (command) => {
    try {
      await vscode.commands.executeCommand(command);
    } catch {
      // Some layout commands don't exist in every IDE build – ignore.
    }
  };

  await run('workbench.action.closeAllEditors');
  await run('workbench.action.closeAuxiliaryBar');
  const folder = vscode.workspace.workspaceFolders[0].uri;
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder, 'src', shot.file));
  await vscode.window.showTextDocument(doc, { preview: false });
  await run(shot.panel ? 'workspaceIdentity.panel.focus' : 'workbench.view.explorer');
  await run('workbench.actions.view.problems');
  await run('workbench.action.focusActiveEditorGroup');
  await wait(1500);
  await run('notifications.clearAll');

  fs.writeFileSync(shot.ready, '');
  const start = Date.now();
  while (!fs.existsSync(shot.done) && Date.now() - start < 120000) await wait(200);
};
