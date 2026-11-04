# Building, installing and publishing

## 1. Build the installable file

```
npm install
npm run package
```

This runs the type check and unit tests, then creates **`workspace-identity-0.1.0.vsix`** in this folder. That one file is the whole extension.

## 2. Try it on your own computer

**Antigravity IDE:** open the Extensions view, click the **⋯** menu, choose **Install from VSIX…** and pick the `.vsix` file. Or, from a terminal:

```
"%LOCALAPPDATA%\Programs\Antigravity IDE\bin\antigravity-ide.cmd" --install-extension workspace-identity-0.1.0.vsix
```

**VS Code:**

```
code --install-extension workspace-identity-0.1.0.vsix
```

Then reload the window. The Workspace Identity icon appears in the activity bar.

## 3. Publish to Open VSX

Open VSX (open-vsx.org) is the store that Antigravity IDE searches. Once the extension is published there, anyone using Antigravity, VSCodium or Cursor can find and install it.

**One-time setup:**

1. Push this repository to GitHub, so the screenshot in the README shows on the store page.
2. Go to **https://open-vsx.org** and sign in with GitHub.
3. In your profile settings, link an **Eclipse account** (it's free) and sign the **Publisher Agreement**.
4. Under **Access Tokens**, create a token and copy it somewhere safe. Never commit it to git.
5. Create your publisher name. It must match `"publisher"` in `package.json`, which is `jamesfroggatt`:

   ```
   npx ovsx create-namespace jamesfroggatt -p YOUR_TOKEN
   ```

**Publish:**

```
npx ovsx publish workspace-identity-0.1.0.vsix -p YOUR_TOKEN
```

It usually shows up within a few minutes at `https://open-vsx.org/extension/jamesfroggatt/workspace-identity`.

## 4. Releasing an update

1. Change `"version"` in `package.json`, for example to `0.1.1`. Open VSX won't accept the same version twice.
2. Add a note to `CHANGELOG.md`.
3. Run `npm run package`, then `npx ovsx publish workspace-identity-<version>.vsix -p YOUR_TOKEN`.

## Optional: Microsoft's VS Code Marketplace

This is a separate store that VS Code itself uses. It needs a publisher created at **https://marketplace.visualstudio.com/manage** and an Azure DevOps access token. Then run:

```
npx vsce publish -p YOUR_AZURE_TOKEN
```

## Developer checks

| Command | What it does |
|---|---|
| `npm test` | Unit tests for the colour maths, titles and settings merging |
| `npm run test:integration` | Opens a throwaway Antigravity window and checks what the extension writes to `settings.json` |
| `set WI_IDE=vscode&& npm run test:integration` | The same checks, in VS Code |
| **F5** in the editor | Starts a development window with `test-fixtures/sample-workspace` |
