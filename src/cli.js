#!/usr/bin/env node
/*
 * ReportKit command line.
 *
 *   reportkit <in.md> [out.html|out.pdf] [--template file.rktemplate.json]
 *   reportkit --export-template [out.rktemplate.json]
 *   reportkit chart <data.xlsx|data.csv> [out.svg|out.html|out.pdf] [--type gantt] [--task Col --start Col --end Col]
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

// reportkit chart <data.xlsx|csv> [out.svg|html|pdf]: one chart from a spreadsheet, no report around it.
if (args[0] === 'chart') {
  args.shift();
  const opt = {};
  for (const k of ['type', 'title', 'subtitle', 'sheet', 'header', 'task', 'start', 'end', 'duration', 'group', 'progress', 'x', 'y', 'sort']) { const v = flag('--' + k); if (typeof v === 'string') opt[k] = v; }
  const noToday = flag('--no-today'), dates = flag('--dates');
  const [data, dest] = args;
  if (!data || !fs.existsSync(data)) fail('Usage: reportkit chart <data.xlsx|data.csv> [out.svg|out.html|out.pdf] [--type gantt|bar|hbar|stacked|line|area|share]\n' +
    '       Gantt: --task Col --start Col --end Col [--duration Col] [--group Col] [--progress Col] [--dates] [--no-today]\n' +
    '       Others: --x Col --y "Col,Col"      Also: --title T --subtitle S --sheet Name --header N --template file');
  const Sheet = kit.Sheet, Charts = kit.Charts;
  Sheet.readWorkbook(fs.readFileSync(data), data).then(book => {
    const sh = opt.sheet ? book.sheets.find(s => s.name.toLowerCase() === opt.sheet.toLowerCase()) : book.sheets[0];
    if (!sh) fail('Sheet not found. Sheets in this file: ' + book.sheets.map(s => s.name).join(', '));
    const rows = sh.rows.filter(r => r && r.some(v => v != null && String(v).trim() !== ''));
    const table = Sheet.toTable(rows.slice(Math.max(0, (+opt.header || 1) - 1)));
    if (!table.columns.length) fail('No data found in sheet "' + sh.name + '".');
    const options = Object.assign({}, opt);
    delete options.type; delete options.title; delete options.sheet; delete options.header;
    if (noToday) options.today = 'no';
    if (dates) options.dates = 'yes';
    const { spec, problems } = Charts.fromBlock(table, (opt.type || Charts.autoSpec(table).type) + ' ' + (opt.title || ''), options);
    problems.forEach(p => console.warn('warning: ' + p));
    const r = Charts.render(table, spec, Charts.paletteFromTemplate(tplPath ? kit.normalizeTemplate(JSON.parse(fs.readFileSync(tplPath, "utf8"))) : null), { responsive: !/\.svg$/i.test(dest || '') && !!dest });
    r.warnings.forEach(w => console.warn('warning: ' + w));
    const out = path.resolve(dest || data.replace(/\.[^.]+$/, '') + '.svg');
    if (/\.svg$/i.test(out)) { fs.writeFileSync(out, r.svg, 'utf8'); console.log('Wrote ' + out); return; }
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + (spec.title || 'Chart').replace(/</g, '&lt;') + '</title><style>@page{size:Letter ' +
      (r.width >= r.height ? 'landscape' : 'portrait') + ';margin:.5in}body{margin:0}svg{width:100%;height:auto;display:block}</style></head><body>' + r.svg + '</body></html>';
    if (/\.pdf$/i.test(out)) {
      const tmp = path.join(os.tmpdir(), 'reportkit-' + process.pid + '.html');
      fs.writeFileSync(tmp, html, 'utf8');
      try { console.log('Wrote ' + htmlToPdf(tmp, out)); } catch (e) { fail(e.message); } finally { fs.unlinkSync(tmp); }
    } else { fs.writeFileSync(out, html, 'utf8'); console.log('Wrote ' + out); }
  }).catch(e => fail(e.message));
} else {
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
}
