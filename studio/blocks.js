// Block editing logic for the Studio: read one block of markdown+ into plain fields, write it back,
// and move, copy or delete blocks by line range. Pure functions, so node can test them.
//   parse(text) -> { type, ...fields }     build(model) -> text
//   moveBlock / duplicateBlock / removeBlock / replaceBlock / insertAt work on [start, end) line ranges
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../src/sheet'), require('../src/charts'));
  else root.ReportKitBlocks = factory(root.ReportKitSheet, root.ReportKitCharts);
})(typeof self !== 'undefined' ? self : this, function (Sheet, Charts) {

  const CALLOUT_KIND = { note: 'note', info: 'note', tip: 'good', good: 'good', done: 'good', warn: 'warn', warning: 'warn', important: 'warn', caution: 'warn', bad: 'bad', danger: 'bad', error: 'bad', blocker: 'bad' };
  const CHART_TYPES = Charts.TYPES.map(t => t.id);
  const SPECIAL = /^(#{1,4}\s|\||```|>|:::|<!--|\s*([-*]|\d+\.)\s|!\[)/;
  const stripBullet = l => l.replace(/^\s*([-*]|\d+\.)\s+/, '');

  // ---- line operations (0-based, [s, e) ranges) ----
  const trailBlank = (L, e) => { let k = e; while (k < L.length && !L[k].trim()) k++; return k; };

  // Moves the block at [s, e) so it sits before line t (t = line count means the end of the report).
  function moveBlock(md, s, e, t) {
    const L = md.split('\n'), e2 = trailBlank(L, e);
    if (t >= s && t <= e2) return md;
    const chunk = L.slice(s, e);
    L.splice(s, e2 - s);
    if (t > s) t -= e2 - s;
    if (t >= L.length && L.length && L[L.length - 1] === '') t = L.length - 1;
    const ins = [];
    if (t > 0 && L[t - 1] !== undefined && L[t - 1].trim()) ins.push('');
    ins.push(...chunk);
    if (t < L.length && L[t].trim()) ins.push('');
    L.splice(t, 0, ...ins);
    return L.join('\n');
  }
  function duplicateBlock(md, s, e) {
    const L = md.split('\n');
    L.splice(e, 0, '', ...L.slice(s, e));
    return L.join('\n');
  }
  function removeBlock(md, s, e) {
    const L = md.split('\n');
    L.splice(s, trailBlank(L, e) - s);
    return L.join('\n');
  }
  function replaceBlock(md, s, e, text) {
    const L = md.split('\n');
    L.splice(s, e - s, ...text.replace(/\n+$/, '').split('\n'));
    return L.join('\n');
  }
  // Inserts a block of text before line t with a blank line on each side.
  function insertAt(md, t, text) {
    const L = md.split('\n');
    t = Math.max(0, Math.min(t, L.length));
    if (t >= L.length && L.length && L[L.length - 1] === '') t = L.length - 1;
    const ins = [];
    if (t > 0 && L[t - 1].trim()) ins.push('');
    ins.push(...text.replace(/^\n+|\n+$/g, '').split('\n'));
    if (t < L.length && L[t].trim()) ins.push('');
    L.splice(t, 0, ...ins);
    return L.join('\n');
  }
  const lineOffset = (md, line) => md.split('\n').slice(0, line).reduce((n, l) => n + l.length + 1, 0);

  // ---- header block ----
  const FRONT_FIELDS = [
    ['title', 'Title'], ['kicker', 'Kicker (small text above the title)'], ['subtitle', 'Subtitle'],
    ['cover', 'Cover page', [['', 'No cover page'], ['full', 'Full-page cover']]], ['tagline', 'Tagline (on the cover)'], ['author', 'Author (on the cover)'],
    ['version', 'Version (on the cover)'], ['date', 'Date (on the cover)'],
    ['contents', 'Contents page', [['', 'No contents page'], ['yes', 'Add a contents page']]], ['source', 'Source line (bottom)'], ['footer', 'Footer text (bottom)'],
  ];
  function readFront(md) {
    const m = md.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(\n|$)/);
    const values = {};
    if (m) m[1].split('\n').forEach(l => { const k = l.match(/^([A-Za-z]\w*):\s*(.*)$/); if (k) values[k[1].toLowerCase()] = k[2].trim(); });
    return { values, length: m ? m[0].length : 0, has: !!m, raw: m ? m[1].split('\n') : [] };
  }
  // Sets header keys; an empty value removes the key. Keys it does not know about are kept as written.
  function setFront(md, values) {
    const f = readFront(md);
    const lines = f.raw.slice();
    Object.keys(values).forEach(k => {
      const i = lines.findIndex(l => new RegExp('^' + k + '[ \\t]*:', 'i').test(l));
      const v = String(values[k] == null ? '' : values[k]).trim();
      if (i >= 0) { if (v) lines[i] = k + ': ' + v; else lines.splice(i, 1); }
      else if (v) lines.push(k + ': ' + v);
    });
    const body = md.slice(f.length);
    if (!lines.length) return body.replace(/^\n+/, '');
    return '---\n' + lines.join('\n') + '\n---\n' + (f.has ? '' : '\n') + body;
  }
  // The first "# Heading" of a report without a title key acts as its title.
  function leadHeading(md) {
    const f = readFront(md), body = md.slice(f.length), L = body.split('\n');
    const i = L.findIndex(l => l.trim());
    const m = i >= 0 && L[i].match(/^#\s+(.*?)\s*#*\s*$/);
    return m ? { text: m[1], line: md.slice(0, f.length).split('\n').length - 1 + i } : null;
  }

  // ---- reading a block ----
  const splitRow = r => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
  const METER = /^\[(\d+(?:\.\d+)?%|\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?)\]\s*(.*?)\s*(?:\{(\w+)\})?\s*$/;

  function parseChart(args, body) {
    const m = String(args).match(/^(\w+)\s*(.*)$/);
    const isType = m && CHART_TYPES.includes(m[1].toLowerCase());
    const opts = {};
    let i = 0;
    for (; i < body.length; i++) {
      if (!body[i].trim()) continue;
      const o = body[i].match(/^\s*([a-z]+)\s*:\s*(.*?)\s*$/i);
      if (o && Charts.OPTION_KEYS.includes(o[1].toLowerCase())) opts[o[1].toLowerCase()] = o[2]; else break;
    }
    const rows = Sheet.parseCsv(body.slice(i).join('\n').replace(/\n+$/, ''));
    const head = rows[0] || [];
    const idx = ref => {
      if (ref == null) return null;
      ref = String(ref).trim();
      const k = head.findIndex(h => String(h).trim().toLowerCase() === ref.toLowerCase());
      if (k >= 0) return k;
      return /^[A-Za-z]$/.test(ref) && ref.toUpperCase().charCodeAt(0) - 65 < head.length ? ref.toUpperCase().charCodeAt(0) - 65 : null;
    };
    const sel = {};
    ['task', 'start', 'end', 'duration', 'group', 'progress', 'x'].forEach(k => { sel[k] = idx(opts[k]); });
    const y = opts.y ? opts.y.split(',').map(idx).filter(v => v != null) : [];
    return {
      type: 'chart', ctype: isType ? m[1].toLowerCase() : 'bar', title: isType ? m[2].trim() : String(args).trim(),
      sel, y, today: !/^(no|false|off)$/i.test(opts.today || ''), dates: /^(yes|true|on)$/i.test(opts.dates || ''), sort: opts.sort ? opts.sort.toLowerCase() : '',
      subtitle: opts.subtitle || '', height: opts.height || '', rows: rows.length ? rows : [[''], ['']],
    };
  }

  function parseContainer(kind, args, body) {
    const rows = body.map(l => l.trim()).filter(Boolean);
    let m;
    if (kind === 'hero') {
      m = args.match(/^(\d+(?:\.\d+)?)%\s*(?:\|\s*(.*))?$/) || [null, '0', ''];
      return { type: 'hero', pct: m[1], label: m[2] || '', headline: rows[0] || '', paragraph: rows.slice(1).join(' ') };
    }
    if (kind === 'stats' || kind === 'cards') {
      return { type: 'stats', rows: rows.map(stripBullet).map(r => { const p = r.split('|').map(x => x.trim()); return { n: p[0] || '', t: p[1] || '', p: p[2] || '', c: p[3] || '' }; }) };
    }
    if (kind === 'bar') {
      return { type: 'bar', title: args, rows: rows.map(stripBullet).map(r => {
        const c = r.match(/^(.*?)\s*\{(\w+)\}\s*$/), text = c ? c[1] : r, v = text.match(/^(\d+(?:\.\d+)?)\s+(.*)$/);
        return v ? { v: v[1], label: v[2], c: c ? c[2] : '' } : null;
      }).filter(Boolean) };
    }
    if (kind === 'defs') {
      return { type: 'defs', rows: rows.map(stripBullet).map(r => { const i = r.indexOf('::'); return i < 0 ? null : { term: r.slice(0, i).trim(), text: r.slice(i + 2).trim() }; }).filter(Boolean) };
    }
    if (kind === 'panel') return { type: 'panel', title: args, body: body.join('\n').replace(/^\n+|\n+$/g, '') };
    if (kind === 'columns') return { type: 'columns', parts: body.join('\n').split(/\n\s*\|\|\|\s*\n/).map(p => p.replace(/^\n+|\n+$/g, '')) };
    if (kind === 'chart') return parseChart(args, body);
    return null;
  }

  function parse(text) {
    text = String(text).replace(/\n+$/, '');
    const L = text.split('\n'), first = L[0];
    let m;
    if (L.length === 1) {
      if (/^<!--\s*pagebreak\s*-->\s*$/.test(first)) return { type: 'pagebreak' };
      if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(first)) return { type: 'divider' };
      if (/^\s*\[\[_TOC_\]\]\s*$/.test(first)) return { type: 'toc' };
      if ((m = first.match(/^(#{1,4})\s+(.*?)\s*#*\s*$/))) return { type: 'heading', level: m[1].length, text: m[2] };
      if ((m = first.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/))) return { type: 'image', alt: m[1], src: m[2] };
    }
    if (L.every(l => /^>/.test(l))) {
      const q = L.map(l => l.replace(/^>\s?/, ''));
      const tag = q[0].match(/^\[!(\w+)\]\s*(.*)$/);
      if (tag && CALLOUT_KIND[tag[1].toLowerCase()]) return { type: 'callout', kind: CALLOUT_KIND[tag[1].toLowerCase()], title: tag[2], body: q.slice(1).join('\n') };
      return { type: 'quote', body: q.join('\n') };
    }
    if ((m = first.match(/^(:{3,})\s*(\w+)\s*(.*)$/)) && L.length >= 2 && new RegExp('^:{' + m[1].length + '}\\s*$').test(L[L.length - 1])) {
      const model = parseContainer(m[2].toLowerCase(), m[3].trim(), L.slice(1, -1));
      if (model) return model;
      return { type: 'raw', kind: m[2].toLowerCase(), text };
    }
    if (/^```/.test(first)) return { type: 'raw', kind: /^```\s*mermaid/i.test(first) ? 'diagram' : 'code', text };
    if (L.every(l => /^\s*\|/.test(l))) {
      const rows = L.map(splitRow);
      const rule = rows[1] && /^[\s|:-]+$/.test(L[1]);
      const all = rows.filter((r, i) => !(rule && i === 1));
      const w = Math.max(...all.map(r => r.length));
      return { type: 'table', rows: all.map(r => r.concat(Array(w - r.length).fill(''))) };
    }
    if (L.every(l => /^\s*([-*]|\d+\.)\s+/.test(l))) {
      const items = L.map(stripBullet);
      if (items.every(t => METER.test(t))) return { type: 'meters', rows: items.map(t => { const k = t.match(METER); return { value: k[1], label: k[2], c: k[3] || '' }; }) };
      if (items.every(t => /^\[( |x|X)\]\s+/.test(t))) return { type: 'checklist', rows: items.map(t => { const k = t.match(/^\[( |x|X)\]\s+(.*)$/); return { done: k[1] !== ' ', text: k[2] }; }) };
      if (L.every(l => /^\s*\d+\./.test(l))) return { type: 'steps', rows: items.map(t => ({ text: t })) };
      if (L.every(l => /^\s*[-*]\s/.test(l))) return { type: 'bullets', rows: items.map(t => ({ text: t })) };
    }
    if (L.every(l => l.trim() && !SPECIAL.test(l))) return { type: 'paragraph', text };
    return { type: 'raw', kind: 'text', text };
  }

  // ---- writing a block ----
  const csvCell = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const quote = t => String(t).split('\n').map(l => '> ' + l).join('\n');
  const mdRow = r => '| ' + r.join(' | ') + ' |';

  function build(b) {
    switch (b.type) {
      case 'pagebreak': return '<!-- pagebreak -->';
      case 'divider': return '***';
      case 'toc': return '[[_TOC_]]';
      case 'heading': return '#'.repeat(b.level) + ' ' + b.text;
      case 'image': return '![' + b.alt + '](' + b.src + ')';
      case 'paragraph': return b.text.replace(/\n{2,}/g, '\n');
      case 'callout': return '> [!' + b.kind + '] ' + b.title + (b.body ? '\n' + quote(b.body) : '');
      case 'quote': return quote(b.body);
      case 'hero': return ':::hero ' + (parseFloat(b.pct) || 0) + '% | ' + b.label + '\n' + b.headline + (b.paragraph ? '\n' + b.paragraph : '') + '\n:::';
      case 'stats': return ':::stats\n' + b.rows.map(r => '- ' + (r.c ? [r.n, r.t, r.p, r.c] : r.p ? [r.n, r.t, r.p] : [r.n, r.t]).join(' | ').replace(/ \| {2}\|/g, ' | |')).join('\n') + '\n:::';
      case 'bar': return ':::bar' + (b.title ? ' ' + b.title : '') + '\n' + b.rows.map(r => '- ' + r.v + ' ' + r.label + (r.c ? ' {' + r.c + '}' : '')).join('\n') + '\n:::';
      case 'defs': return ':::defs\n' + b.rows.map(r => '- ' + r.term + ' :: ' + r.text).join('\n') + '\n:::';
      case 'panel': return ':::panel' + (b.title ? ' ' + b.title : '') + '\n' + b.body + '\n:::';
      case 'columns': return ':::columns\n' + b.parts.join('\n|||\n') + '\n:::';
      case 'table': {
        const w = b.rows[0].length;
        return [mdRow(b.rows[0]), '|' + Array(w).fill('---').join('|') + '|'].concat(b.rows.slice(1).map(mdRow)).join('\n');
      }
      case 'meters': return b.rows.map(r => '- [' + r.value + '] ' + r.label + (r.c ? ' {' + r.c + '}' : '')).join('\n');
      case 'checklist': return b.rows.map(r => '- [' + (r.done ? 'x' : ' ') + '] ' + r.text).join('\n');
      case 'steps': return b.rows.map((r, i) => (i + 1) + '. ' + r.text).join('\n');
      case 'bullets': return b.rows.map(r => '- ' + r.text).join('\n');
      case 'chart': {
        const name = i => (i == null || !b.rows[0] || b.rows[0][i] == null ? null : String(b.rows[0][i]).trim());
        const o = [];
        const add = (k, v) => { if (v != null && v !== '') o.push(k + ': ' + v); };
        if (b.ctype === 'gantt') {
          ['task', 'start', 'end', 'duration', 'group', 'progress'].forEach(k => add(k, name(b.sel[k])));
          if (b.sort === 'start') add('sort', 'start');
          if (!b.today) add('today', 'no');
          if (b.dates) add('dates', 'yes');
        } else {
          add('x', name(b.sel.x)); add('y', b.y.map(name).filter(Boolean).join(', '));
          if (b.ctype === 'hbar' && b.sort === 'sheet') add('sort', 'sheet');
        }
        add('subtitle', b.subtitle); add('height', b.height);
        return ':::chart ' + b.ctype + (b.title ? ' ' + b.title : '') + '\n' + o.join('\n') + '\n\n' + b.rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n:::';
      }
      default: return b.text;
    }
  }

  // Rows the form editors show, by type, so the Studio can label them.
  const LABELS = {
    heading: 'Heading', paragraph: 'Paragraph', image: 'Image', callout: 'Callout', quote: 'Quote', hero: 'Headline number', stats: 'Stat cards', bar: 'Stacked bar',
    defs: 'Definitions', panel: 'Boxed panel', columns: 'Columns', table: 'Table', meters: 'Progress bars', checklist: 'Checklist', steps: 'Numbered steps', bullets: 'Bulleted list',
    chart: 'Chart', pagebreak: 'Page break', divider: 'Divider', toc: 'Contents list', raw: 'Block',
  };

  return { parse, build, moveBlock, duplicateBlock, removeBlock, replaceBlock, insertAt, lineOffset, readFront, setFront, leadHeading, FRONT_FIELDS, LABELS, CHART_TYPES };
});
