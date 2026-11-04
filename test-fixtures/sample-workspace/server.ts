// Sample file for trying Workspace Identity in a development window (F5).
// Colours you pick are saved to this folder's .vscode/settings.json, which git ignores.
import { createServer } from 'node:http';

export function handleWebhook(body: string, signature: string | undefined): number {
  if (!signature || signature.length < 10) {
    return 401;
  }
  return body.length > 0 ? 200 : 400;
}

createServer((req, res) => {
  res.end(String(handleWebhook('ping', req.headers['x-signature'] as string | undefined)));
}).listen(4000);
