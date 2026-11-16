// ReportKit spreadsheet reader: .xlsx, .csv and .tsv in, plain rows and a typed table out.
// No dependencies. An .xlsx file is a zip of XML parts, read here with the platform inflate
// (DecompressionStream in the browser and Electron, zlib in older node), so it runs unchanged in both.
//   const { readWorkbook, toTable } = require('./sheet');
//   const wb = await readWorkbook(bytes, 'plan.xlsx');   // { sheets: [{ name, rows }] }
//   const table = toTable(wb.sheets[0].rows);            // { columns: [{ name, type, values }], length }
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReportKitSheet = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  // ---- values ----------------------------------------------------------------------------
  function ymd(y, m, d) {
    const t = Date.UTC(y, m, d), x = new Date(t);
    return x.getUTCFullYear() === y && x.getUTCMonth() === m && x.getUTCDate() === d ? t : null;
  }

  // Text to a UTC timestamp, or null. Only unambiguous shapes are accepted: 2026-03-14, 3/14/2026,
  // 14 Mar 2026, Mar 14, 2026. Slash dates are month first unless the first number cannot be a month.
  function parseDate(s) {
    s = String(s).trim();
    let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]\d{1,2}:\d{2}.*)?$/))) return ymd(+m[1], m[2] - 1, +m[3]);
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/))) {
      let y = +m[3]; if (y < 100) y += y < 70 ? 2000 : 1900;
      return +m[1] > 12 ? ymd(y, m[2] - 1, +m[1]) : ymd(y, m[1] - 1, +m[2]);
    }
    if ((m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3,9})\.?,?[ -](\d{4})$/))) {
      const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
      return mi < 0 ? null : ymd(+m[3], mi, +m[1]);
    }
    if ((m = s.match(/^([A-Za-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/))) {
      const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
      return mi < 0 ? null : ymd(+m[3], mi, +m[2]);
    }
    return null;
  }

  function parseNumber(s) {
    s = String(s).trim();
    if (!s) return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/^[$€£]\s?/, '').replace(/,/g, '').replace(/%$/, '');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
    return neg ? -+s : +s;
  }

  const colLetter = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
  const colIndex = ref => { let n = 0; for (const ch of ref.replace(/[^A-Za-z]/g, '').toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

  // ---- CSV -------------------------------------------------------------------------------
  function parseCsv(text, delimiter) {
    text = String(text).replace(/^﻿/, '');
    if (!delimiter) {
      const first = text.split(/\r?\n/, 5).join('\n');
      let best = ',', top = 0;
      for (const d of [',', '\t', ';', '|']) {
        const n = first.replace(/"[^"]*"/g, '').split(d).length - 1;
        if (n > top) { top = n; best = d; }
      }
      delimiter = best;
    }
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"' && cell === '') q = true;
      else if (ch === delimiter) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = ''; rows.push(row); row = [];
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  // ---- zip and xlsx ----------------------------------------------------------------------
  async function inflateRaw(u8) {
    if (typeof DecompressionStream === 'function') {
      const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    return new Uint8Array(require('zlib').inflateRawSync(u8));
  }

  function openZip(buf) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let e = buf.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('This is not a readable .xlsx file. Save the sheet as .xlsx or CSV and try again.');
    const count = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    const entries = {}, utf8 = new TextDecoder();
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const name = utf8.decode(buf.subarray(p + 46, p + 46 + nlen));
      entries[name] = { method: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), offset: dv.getUint32(p + 42, true) };
      p += 46 + nlen + elen + clen;
    }
    return {
      has: name => !!entries[name],
      async text(name) {
        const en = entries[name];
        if (!en) return null;
        const start = en.offset + 30 + dv.getUint16(en.offset + 26, true) + dv.getUint16(en.offset + 28, true);
        const data = buf.subarray(start, start + en.size);
        return utf8.decode(en.method === 0 ? data : await inflateRaw(data));
      },
    };
  }

  const unxml = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()];
  });
  const attrs = s => { const o = {}; s.replace(/([\w:]+)\s*=\s*"([^"]*)"/g, (_, k, v) => { o[k] = unxml(v); }); return o; };
  const textOf = xml => { let t = ''; xml.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g, (_, v) => { t += unxml(v); }); return t; };

  const BUILTIN_DATE_FMTS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

  function dateStyles(xml) {
    const out = [];
    if (!xml) return out;
    const custom = {};
    xml.replace(/<numFmt\b([^>]*?)\/?>/g, (_, a) => { const o = attrs(a); custom[o.numFmtId] = o.formatCode || ''; });
    const block = (xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/) || [])[1] || '';
    block.replace(/<xf\b([^>]*?)(?:\/>|>)/g, (_, a) => {
      const id = +attrs(a).numFmtId;
      let isDate = BUILTIN_DATE_FMTS.has(id);
      if (!isDate && custom[id] != null) isDate = /[dmyhs]/i.test(custom[id].replace(/"[^"]*"|\[[^\]]*\]|\\./g, ''));
      out.push(isDate);
    });
    return out;
  }

  async function readXlsx(buf) {
    const zip = openZip(buf);
    const wbXml = await zip.text('xl/workbook.xml');
    if (!wbXml) throw new Error('This .xlsx has no workbook in it. Save the sheet as .xlsx or CSV and try again.');
    const rels = {};
    ((await zip.text('xl/_rels/workbook.xml.rels')) || '').replace(/<Relationship\b([^>]*?)\/?>/g, (_, a) => { const o = attrs(a); rels[o.Id] = o.Target; });
    const epoch1904 = /<workbookPr\b[^>]*date1904="(1|true)"/.test(wbXml);
    const shared = [];
    const ss = await zip.text('xl/sharedStrings.xml');
    if (ss) ss.replace(/<si\b[^>]*>([\s\S]*?)<\/si>/g, (_, si) => { shared.push(textOf(si.replace(/<rPh\b[\s\S]*?<\/rPh>/g, ''))); });
    const isDate = dateStyles(await zip.text('xl/styles.xml'));

    const sheets = [];
    const found = [];
    wbXml.replace(/<sheet\b([^>]*?)\/?>/g, (_, a) => { found.push(attrs(a)); });
    for (const sh of found) {
      if (/hidden/i.test(sh.state || '')) continue;
      let target = rels[sh['r:id']] || '';
      target = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
      const xml = await zip.text(target);
      if (!xml) continue;
      const rows = [];
      let seq = 0;
      xml.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (_, a, inner) => {
        const at = attrs(a);
        let r, c;
        if (at.r) { r = +at.r.replace(/\D/g, '') - 1; c = colIndex(at.r); } else { r = 0; c = seq; }
        seq = c + 1;
        if (inner == null) return;
        const v = (inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/) || [])[1];
        let val = null;
        if (at.t === 's') val = v != null ? shared[+v] : null;
        else if (at.t === 'inlineStr') val = textOf(inner);
        else if (at.t === 'str') val = v != null ? unxml(v) : null;
        else if (at.t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
        else if (at.t === 'e') val = null;
        else if (at.t === 'd') { const t = v != null ? parseDate(v) : null; val = t == null ? v : new Date(t); }
        else if (v != null && v !== '') {
          const n = +v;
          if (isDate[+at.s]) val = new Date(Math.round((n - (epoch1904 ? 24107 : 25569)) * 864e5));
          else val = n;
        }
        if (val === null || val === undefined) return;
        (rows[r] = rows[r] || [])[c] = val;
      });
      for (let i = 0; i < rows.length; i++) rows[i] = rows[i] ? Array.from(rows[i], x => (x === undefined ? null : x)) : [];
      sheets.push({ name: sh.name || 'Sheet' + (sheets.length + 1), rows });
    }
    if (!sheets.length) throw new Error('No visible sheets were found in that workbook.');
    return sheets;
  }

  // Reads a spreadsheet file. `input` is a Uint8Array, ArrayBuffer or node Buffer.
  async function readWorkbook(input, filename) {
    const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
    const name = String(filename || 'Sheet1').replace(/^.*[\\/]/, '');
    const base = name.replace(/\.[^.]+$/, '') || 'Sheet1';
    if (buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0) {
      throw new Error('That is an older .xls file or a password-protected workbook. Save it as .xlsx or CSV and try again.');
    }
    if (buf[0] === 0x50 && buf[1] === 0x4B) return { sheets: await readXlsx(buf) };
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('windows-1252').decode(buf); }
    const tab = /\.tsv$/i.test(name) ? '\t' : null;
    return { sheets: [{ name: base, rows: parseCsv(text, tab) }] };
  }

  // ---- typed table -----------------------------------------------------------------------
  const blank = v => v == null || (typeof v === 'string' && !v.trim());

  // Rows (arrays of cells) to columns with a name, a type and typed values. The first non-empty
  // row is the header. Type is number, date or text: a column takes a type when 90% of its
  // filled cells fit it. Dates are UTC millisecond timestamps; blanks are null.
  function toTable(rows) {
    rows = (rows || []).filter(r => r && r.some(v => !blank(v)));
    if (!rows.length) return { columns: [], length: 0 };
    let width = 0;
    rows.forEach(r => { for (let i = r.length - 1; i >= 0; i--) if (!blank(r[i])) { width = Math.max(width, i + 1); break; } });
    const header = rows[0], data = rows.slice(1);
    const seen = {};
    const columns = [];
    for (let c = 0; c < width; c++) {
      const raw = data.map(r => (blank(r[c]) ? null : r[c]));
      const filled = raw.filter(v => v !== null);
      if (!filled.length && blank(header[c])) continue;
      let name = blank(header[c]) ? 'Column ' + colLetter(c) : String(header[c] instanceof Date ? header[c].toISOString().slice(0, 10) : header[c]).trim();
      if (seen[name]) name += ' ' + (++seen[name]); else seen[name] = 1;
      const dates = filled.filter(v => v instanceof Date || (typeof v === 'string' && parseDate(v) !== null)).length;
      const nums = filled.filter(v => typeof v === 'number' || (typeof v === 'string' && parseNumber(v) !== null)).length;
      let type = 'text';
      if (filled.length && dates / filled.length >= 0.9) type = 'date';
      else if (filled.length && nums / filled.length >= 0.9) type = 'number';
      const values = raw.map(v => {
        if (v === null) return null;
        if (type === 'date') return v instanceof Date ? +v : parseDate(v);
        if (type === 'number') return typeof v === 'number' ? v : parseNumber(v);
        return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim();
      });
      columns.push({ name, type, values, index: columns.length });
    }
    return { columns, length: data.length };
  }

  return { readWorkbook, parseCsv, toTable, parseDate, parseNumber };
});
