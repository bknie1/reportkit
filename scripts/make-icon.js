// Draws the app icon and writes build/icon.png and build/icon.ico (an ICO that wraps the PNG).
// Needs Chrome, Edge or Chromium for the one screenshot. Run: node scripts/make-icon.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { findBrowser } = require('../src/pdf');

const browser = findBrowser();
if (!browser) { console.error('No Chrome, Edge or Chromium found.'); process.exit(1); }

const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
<rect width="256" height="256" rx="52" fill="#1e3a5f"/>
<rect x="0" y="236" width="256" height="20" fill="#e0a526"/>
<g fill="#ffffff"><rect x="58" y="118" width="30" height="86" rx="7"/><rect x="104" y="80" width="30" height="124" rx="7"/><rect x="150" y="44" width="30" height="160" rx="7"/></g>
</svg>`;
const tmp = path.join(os.tmpdir(), 'reportkit-icon.html');
fs.writeFileSync(tmp, html);
const png = path.join(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(png), { recursive: true });
spawnSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', '--window-size=256,256', '--screenshot=' + png, 'file:///' + tmp.replace(/\\/g, '/')], { stdio: 'ignore' });
if (!fs.existsSync(png)) { console.error('Screenshot failed.'); process.exit(1); }

const data = fs.readFileSync(png);
const head = Buffer.alloc(22);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head.writeUInt8(0, 6); head.writeUInt8(0, 7); head.writeUInt8(0, 8); head.writeUInt8(0, 9);
head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(data.length, 14); head.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.ico'), Buffer.concat([head, data]));
console.log('Wrote build/icon.png and build/icon.ico');
