// Renders media/icon.svg to media/icon.png (the store / marketplace icon).
// Run with: npm run icon
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync('media/icon.svg', 'utf8');
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 256 } }).render().asPng();
writeFileSync('media/icon.png', png);
console.log(`media/icon.png written (${png.length} bytes, 256×256)`);
