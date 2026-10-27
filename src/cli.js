#!/usr/bin/env node
/*
 * ReportKit command line.
 *
 *   reportkit <in.md> [out.html|out.pdf] [--template file.rktemplate.json]
 *   reportkit --export-template [out.rktemplate.json]
 *
 * With no output name the HTML is written beside the input. A .pdf output needs Chrome,
 * Edge or Chromium installed. Reports with a mermaid block carry the bundled diagram
 * library, so the finished file opens offline.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const kit = require('./render');
const { htmlToPdf } = require('./pdf');

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, v && !v.startsWith('--') ? 2 : 1); return v && !v.startsWith('--') ? v : true; };
const fail = msg => { console.error(msg); process.exit(1); };

const exportTpl = flag('--export-template');
const tplPath = flag('--template');

if (exportTpl) {
  const out = path.resolve(typeof exportTpl === 'string' ? exportTpl : 'default.rktemplate.json');
  fs.writeFileSync(out, JSON.stringify(kit.DEFAULT_TEMPLATE, null, 2) + '\n', 'utf8');
  console.log('Wrote ' + out);
  process.exit(0);
}

const [input, output] = args;
if (!input) fail('Usage: reportkit <in.md> [out.html|out.pdf] [--template file.rktemplate.json]\n       reportkit --export-template [out.json]');
if (!fs.existsSync(input)) fail('Input not found: ' + path.resolve(input));

let template = null;
if (tplPath) {
  if (!fs.existsSync(tplPath)) fail('Template not found: ' + path.resolve(tplPath));
  try { template = JSON.parse(fs.readFileSync(tplPath, 'utf8')); } catch (e) { fail('Template is not valid JSON: ' + e.message); }
  if (template.format !== 'reportkit-template') fail('Not a ReportKit template: ' + tplPath);
}

const md = fs.readFileSync(input, 'utf8');
const libPath = path.join(__dirname, '..', 'vendor', 'mermaid.min.js');
const mermaid = /^(```|:{3,})\s*mermaid/m.test(md) && fs.existsSync(libPath) ? fs.readFileSync(libPath, 'utf8') : '';
const { html, warnings } = kit.document(md, { template, mermaid });
warnings.forEach(w => console.warn('warning: ' + w));

const out = path.resolve(output || input.replace(/\.(md|markdown|txt)$/i, '') + '.html');
if (/\.pdf$/i.test(out)) {
  const tmp = path.join(os.tmpdir(), 'reportkit-' + process.pid + '.html');
  fs.writeFileSync(tmp, html, 'utf8');
  try { console.log('Wrote ' + htmlToPdf(tmp, out)); } catch (e) { fail(e.message); } finally { fs.unlinkSync(tmp); }
} else {
  fs.writeFileSync(out, html, 'utf8');
  console.log('Wrote ' + out);
}
