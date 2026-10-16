// ReportKit renderer: "markdown+" in, a styled report (HTML) out.
// Pure function, no file or DOM access, so it runs unchanged in node and in the browser.
//   const { document } = require('./render');  document(md, { template, mermaid })
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReportKit = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const COLORS = ['blue', 'gold', 'green', 'sage', 'amber', 'red', 'grey'];
  const ALIAS = { yellow: 'gold', orange: 'amber', gray: 'grey', quad: 'green', info: 'blue', good: 'green', warn: 'amber', bad: 'red' };
  const color = (c, dflt) => { c = (c || '').toLowerCase(); c = ALIAS[c] || c; return COLORS.includes(c) ? c : dflt; };

  const PILL_AUTO = [
    [/^(done|complete|completed|passed|pass|merged|closed|resolved|live|deployed|approved|yes)$/i, 'green'],
    [/^(in review|review|testing|ready|signed off)$/i, 'blue'],
    [/^(in progress|active|pending|waiting|partial|at risk)$/i, 'amber'],
    [/^(blocked|failed|fail|rejected|overdue|no)$/i, 'red'],
    [/^(new|todo|to do|not started|backlog|draft|parked|n\/a)$/i, 'grey'],
  ];

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const num = n => (Math.round(n * 10) / 10).toString();
  const clampPct = p => Math.max(0, Math.min(100, p));

  function pill(text, c) {
    c = color(c, null);
    if (!c) { const hit = PILL_AUTO.find(([re]) => re.test(text.trim())); c = hit ? hit[1] : 'blue'; }
    return `<span class="pill ${c}">${esc(text)}</span>`;
  }

  function safeHref(u) {
    return /^(https?:|mailto:|#|\.{0,2}\/|[\w.-]+(\/|$))/i.test(u) && !/^javascript:/i.test(u) ? esc(u) : '#';
  }

  function inline(s) {
    const stash = [];
    const keep = h => '\u0000' + (stash.push(h) - 1) + '\u0000';
    s = s.replace(/`([^`]+)`/g, (_, c) => keep('<code>' + esc(c) + '</code>'));
    s = s.replace(/\[\[([^\]|]+?)(?:\|(\w+))?\]\]/g, (_, t, c) => keep(pill(t, c)));
    s = esc(s);
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${safeHref(u.replace(/&amp;/g, '&'))}">${t}</a>`);
    return s.replace(/\u0000(\d+)\u0000/g, (_, n) => stash[+n]);
  }

  // [70%] or [45/60], optional trailing {color}. Returns null when the text is not a meter.
  function meterSpec(text) {
    let m = text.match(/^\[(\d+(?:\.\d+)?)%\]\s*(.*?)\s*(?:\{(\w+)\})?\s*$/);
    if (m) return { pct: clampPct(+m[1]), value: num(+m[1]) + '%', label: m[2], color: color(m[3], 'blue') };
    m = text.match(/^\[(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\]\s*(.*?)\s*(?:\{(\w+)\})?\s*$/);
    if (m && +m[2] > 0) return { pct: clampPct((+m[1] / +m[2]) * 100), value: `${m[1]} of ${m[2]}`, label: m[3], color: color(m[4], 'blue') };
    return null;
  }

  const meterHtml = (label, pct, value, c) =>
    `<div class="meter"><div class="m-top"><span>${inline(label)}</span><b>${esc(value)}</b></div>` +
    `<div class="m-track"><div class="m-fill fill-${c}" style="width:${num(pct)}%"></div></div></div>`;

  function renderMeterItem(spec) { return meterHtml(spec.label, spec.pct, spec.value, spec.color); }

  const splitRow = r => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

  function tableCell(c) {
    const spec = meterSpec(c);
    if (spec && !spec.label) {
      return `<div class="cell-bar"><div class="m-track"><div class="m-fill fill-${spec.color}" style="width:${num(spec.pct)}%"></div></div><b>${esc(spec.value)}</b></div>`;
    }
    return inline(c);
  }

  function stripBullet(l) { return l.replace(/^\s*([-*]|\d+\.)\s+/, ''); }
  function trailingColor(t) {
    const m = t.match(/^(.*?)\s*\{(\w+)\}\s*$/);
    return m ? { text: m[1], color: color(m[2], null) } : { text: t, color: null };
  }

  function container(kind, args, body, state) {
    const rows = body.map(l => l.trim()).filter(Boolean);
    if (kind === 'stats' || kind === 'cards') {
      const cards = rows.map(stripBullet).map(r => {
        const [n, t = '', p = '', c = ''] = r.split('|').map(x => x.trim());
        return `<div class="card ${color(c, 'blue')}"><div class="n">${inline(n)}</div><div class="t">${inline(t)}</div>${p ? `<div class="p">${inline(p)}</div>` : ''}</div>`;
      });
      const cols = Math.min(Math.max(cards.length, 1), 4);
      return `<div class="cards c${cols}">${cards.join('')}</div>`;
    }
    if (kind === 'bar') {
      const segs = rows.map(stripBullet).map((r, idx) => {
        const tc = trailingColor(r);
        const m = tc.text.match(/^(\d+(?:\.\d+)?)\s+(.*)$/);
        if (!m) return null;
        return { v: +m[1], label: m[2], c: tc.color || COLORS[idx % COLORS.length] };
      }).filter(Boolean);
      const total = segs.reduce((a, s) => a + s.v, 0) || 1;
      const bar = segs.map(s => {
        const p = (s.v / total) * 100;
        return `<div class="fill-${s.c}" style="width:${num(p)}%">${p >= 6 ? Math.round(p) + '%' : ''}</div>`;
      }).join('');
      const legend = segs.map(s => `<div class="it"><span class="dot fill-${s.c}"></span>${inline(s.label)} &ndash; ${num(s.v)}</div>`).join('');
      return `<div class="statbar">${args ? `<div class="bar-title">${inline(args)}</div>` : ''}<div class="bar">${bar}</div><div class="legend">${legend}</div></div>`;
    }
    if (kind === 'hero') {
      const m = args.match(/^(\d+(?:\.\d+)?)%\s*(?:\|\s*(.*))?$/) || [null, '0', ''];
      const p = clampPct(+m[1]);
      const off = (389.6 * (1 - p / 100)).toFixed(1);
      const [head, ...rest] = rows;
      const para = rest.join(' ');
      return `<div class="hero"><div class="ring"><svg width="150" height="150" viewBox="0 0 150 150">` +
        `<circle cx="75" cy="75" r="62" fill="none" stroke="var(--track)" stroke-width="16"/>` +
        `<circle cx="75" cy="75" r="62" fill="none" stroke="var(--primary)" stroke-width="16" stroke-linecap="round" stroke-dasharray="389.6" stroke-dashoffset="${off}" transform="rotate(-90 75 75)"/>` +
        `<text class="big" x="75" y="72" text-anchor="middle"${p >= 100 ? ' style="font-size:30px"' : ''}>${num(p)}%</text>` +
        `<text class="lbl" x="75" y="90" text-anchor="middle">${esc((m[2] || '').toUpperCase())}</text></svg></div>` +
        `<div class="heroText"><h2>${inline(head || '')}</h2>${para ? `<p>${inline(para)}</p>` : ''}</div></div>`;
    }
    if (kind === 'defs') {
      const defs = rows.map(stripBullet).map(r => {
        const i = r.indexOf('::');
        return i < 0 ? null : `<div class="def"><b>${inline(r.slice(0, i).trim())}</b> &ndash; ${inline(r.slice(i + 2).trim())}</div>`;
      }).filter(Boolean);
      return `<div class="defs">${defs.join('')}</div>`;
    }
    if (kind === 'example') {
      return `<div class="example${/\bstack\b/i.test(args) ? ' stack' : ''}"><div class="ex-src"><div class="ex-label">You write</div><pre class="code">${esc(body.join('\n').replace(/^\n+|\n+$/g, ''))}</pre></div>` +
        `<div class="ex-res"><div class="ex-label ex-get">You get</div><div class="ex-out">${renderBlocks(body, state)}</div></div></div>`;
    }
    if (kind === 'panel') {
      return `<div class="panel">${args ? `<h3>${inline(args)}</h3>` : ''}${renderBlocks(body, state)}</div>`;
    }
    if (kind === 'columns') {
      return `<div class="cols">${body.join('\n').split(/\n\s*\|\|\|\s*\n/).map(c => `<div>${renderBlocks(c.split('\n'), state)}</div>`).join('')}</div>`;
    }
    state.warnings.push(`Unknown block ":::${kind}"`);
    return `<div class="callout warn"><b>Unknown block.</b> ":::${esc(kind)}" is not part of the notation.</div>`;
  }

  const CALLOUT = { note: 'note', info: 'note', tip: 'good', good: 'good', done: 'good', warn: 'warn', warning: 'warn', important: 'warn', caution: 'warn', bad: 'bad', danger: 'bad', error: 'bad', blocker: 'bad' };

  function renderBlocks(lines, state) {
    let html = '', i = 0, m;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }

      if (/^<!--\s*pagebreak\s*-->\s*$/.test(line)) { html += '<div class="pagebreak"></div>'; i++; continue; }
      if (/^<!--/.test(line)) { while (i < lines.length && !/-->/.test(lines[i])) i++; i++; continue; }

      if ((m = line.match(/^```\s*(\w*)/))) {
        const body = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
        i++;
        if (m[1].toLowerCase() === 'mermaid') { state.mermaid = true; html += `<div class="diagram"><pre class="mermaid">${esc(body.join('\n'))}</pre></div>`; }
        else html += `<pre class="code">${esc(body.join('\n'))}</pre>`;
        continue;
      }

      if ((m = line.match(/^(:{3,})\s*(\w+)\s*(.*)$/))) {
        // A block closes on a line of exactly as many colons as opened it, so a ::::example can hold :::blocks.
        const close = new RegExp('^:{' + m[1].length + '}\\s*$'), body = []; i++;
        while (i < lines.length && !close.test(lines[i])) body.push(lines[i++]);
        i++;
        html += container(m[2].toLowerCase(), m[3].trim(), body, state);
        continue;
      }

      if ((m = line.match(/^(#{1,4})\s+(.*?)\s*#*\s*$/))) {
        const lvl = m[1].length;
        if (lvl === 1 && !state.title) state.title = m[2];
        else if (lvl <= 2) html += `<h2 class="section-title">${inline(m[2])}</h2>`;
        else if (lvl === 3) html += `<h3>${inline(m[2])}</h3>`;
        else html += `<h4>${inline(m[2])}</h4>`;
        i++; continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { html += '<hr>'; i++; continue; }

      if ((m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/))) {
        html += `<figure class="fig"><img src="${esc(m[2])}" alt="${esc(m[1])}">${m[1] ? `<figcaption>${esc(m[1])}</figcaption>` : ''}</figure>`;
        i++; continue;
      }

      if (/^>/.test(line)) {
        const q = [];
        while (i < lines.length && /^>/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
        const tag = q[0].match(/^\[!(\w+)\]\s*(.*)$/);
        if (tag && CALLOUT[tag[1].toLowerCase()]) {
          const body = q.slice(1).join(' ').trim();
          html += `<div class="callout ${CALLOUT[tag[1].toLowerCase()]}">${tag[2] ? `<b>${inline(tag[2])}</b> ` : ''}${inline(body)}</div>`;
        } else html += `<blockquote>${inline(q.join(' '))}</blockquote>`;
        continue;
      }

      if (/^\s*\|/.test(line)) {
        const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
        const head = splitRow(rows[0]);
        const hasRule = rows[1] && /^[\s|:-]+$/.test(rows[1]);
        const body = rows.slice(hasRule ? 2 : 1).map(splitRow);
        html += `<table class="t"><thead><tr>${head.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>` +
          body.map(r => `<tr>${r.map(c => `<td>${tableCell(c)}</td>`).join('')}</tr>`).join('') + `</tbody></table>`;
        continue;
      }

      if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
        const ordered = /^\s*\d+\./.test(line), items = [];
        while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
          let t = stripBullet(lines[i++]);
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) t += ' ' + lines[i++].trim();
          items.push(t);
        }
        const specs = items.map(meterSpec);
        if (!ordered && specs.every(Boolean)) { html += `<div class="meters">${specs.map(renderMeterItem).join('')}</div>`; continue; }
        const li = items.map((t, k) => {
          if (specs[k]) return `<li class="meter-li">${renderMeterItem(specs[k])}</li>`;
          const task = t.match(/^\[( |x|X)\]\s+(.*)$/);
          if (task) return `<li class="task ${task[1] === ' ' ? 'open' : 'done'}">${inline(task[2])}</li>`;
          return `<li>${inline(t)}</li>`;
        }).join('');
        html += ordered ? `<ol class="n">${li}</ol>` : `<ul class="l">${li}</ul>`;
        continue;
      }

      const para = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\||```|>|:::|<!--|\s*([-*]|\d+\.)\s|!\[)/.test(lines[i])) para.push(lines[i++].trim());
      if (!para.length) { para.push(lines[i++]); }
      html += `<p class="lead">${inline(para.join(' '))}</p>`;
    }
    return html;
  }

  function parseFront(md) {
    const meta = {};
    const m = md.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(\n|$)/);
    if (!m) return { meta, body: md };
    m[1].split('\n').forEach(l => { const k = l.match(/^([A-Za-z]\w*):\s*(.*)$/); if (k) meta[k[1].toLowerCase()] = k[2].trim(); });
    return { meta, body: md.slice(m[0].length) };
  }

  function convert(md) {
    md = String(md).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const { meta, body } = parseFront(md);
    const state = { title: meta.title || '', mermaid: false, warnings: [] };
    const html = renderBlocks(body.split('\n'), state);
    return { html, meta, title: state.title || 'Report', mermaid: state.mermaid, warnings: state.warnings };
  }


  // ---- Templates -------------------------------------------------------------------------
  // A template is plain JSON: a palette, a font, a logo and named image assets. Everything the
  // report looks like comes from it, so a template file can be shared, imported and exported.
  const DEFAULT_TEMPLATE = {
    format: 'reportkit-template', version: 1, name: 'Default',
    colors: { primary: '#1e3a5f', primary2: '#2f5d8a', accent: '#e0a526', accentDeep: '#8a6410', ink: '#1c2530', muted: '#5b6774',
      success: '#2e9e4f', sage: '#7cc9a0', warning: '#e08a1a', danger: '#d93a46', info: '#1f64c4', grey: '#c4c9cf' },
    font: '"Segoe UI",Arial,Helvetica,sans-serif',
    logo: { svg: '<svg viewBox="0 0 150 30" role="img" aria-label="ReportKit"><g fill="currentColor"><rect x="0" y="12" width="6" height="18" rx="1.5"/><rect x="9" y="6" width="6" height="24" rx="1.5"/><rect x="18" y="0" width="6" height="30" rx="1.5"/></g><text x="32" y="23" font-family="Segoe UI,Arial,sans-serif" font-size="21" font-weight="700" fill="currentColor">ReportKit</text></svg>', height: 26, color: '#ffffff' },
    assets: {},
  };
  const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
  const DATA_IMG = /^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/i;

  function cleanSvg(svg) {
    if (typeof svg !== 'string' || !/^\s*<svg[\s>]/i.test(svg)) return '';
    return svg.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '').replace(/javascript:/gi, '').replace(/<\?xml[^>]*>/, '').trim();
  }

  // Merges any partial or untrusted template over the default and drops values that are not safe to emit.
  function normalizeTemplate(raw) {
    const base = DEFAULT_TEMPLATE;
    const t = { format: base.format, version: 1, name: 'Untitled', colors: Object.assign({}, base.colors), font: base.font, logo: JSON.parse(JSON.stringify(base.logo)), assets: {} };
    if (!raw || typeof raw !== 'object') { t.name = base.name; return t; }
    if (typeof raw.name === 'string' && raw.name.trim()) t.name = raw.name.trim().slice(0, 60);
    if (raw.colors && typeof raw.colors === 'object') for (const k of Object.keys(base.colors)) if (HEX.test(raw.colors[k] || '')) t.colors[k] = raw.colors[k];
    if (typeof raw.font === 'string' && /^[\w\s,"'.-]{1,120}$/.test(raw.font)) t.font = raw.font;
    if (raw.logo === null) t.logo = null;
    else if (raw.logo && typeof raw.logo === 'object') {
      const l = {};
      const svg = cleanSvg(raw.logo.svg);
      if (svg) l.svg = svg; else if (typeof raw.logo.src === 'string' && DATA_IMG.test(raw.logo.src)) l.src = raw.logo.src;
      if (l.svg || l.src) {
        l.height = Math.max(12, Math.min(80, +raw.logo.height || 26));
        l.color = HEX.test(raw.logo.color || '') ? raw.logo.color : '#ffffff';
        t.logo = l;
      }
    }
    if (raw.assets && typeof raw.assets === 'object') for (const k of Object.keys(raw.assets)) {
      const v = raw.assets[k];
      if (/^[\w-]{1,40}$/.test(k) && typeof v === 'string' && DATA_IMG.test(v) && v.length < 12e6) t.assets[k] = v;
    }
    return t;
  }

  function templateCss(t) {
    const c = t.colors;
    return ':root{--primary:' + c.primary + ';--primary-2:' + c.primary2 + ';--accent:' + c.accent + ';--accent-deep:' + c.accentDeep +
      ';--ink:' + c.ink + ';--muted:' + c.muted + ';--success:' + c.success + ';--success-2:' + c.sage + ';--warning:' + c.warning +
      ';--danger:' + c.danger + ';--info:' + c.info + ';--grey:' + c.grey + ';--font:' + t.font +
      (t.logo ? ';--logo-h:' + t.logo.height + 'px;--logo-color:' + t.logo.color : '') + ';}';
  }

  const CSS = `
@page{ size:Letter portrait; margin:0.5in; }
*{ box-sizing:border-box; margin:0; padding:0; }
:root{
  --ink-2:color-mix(in srgb,var(--ink) 88%,white); --faint:color-mix(in srgb,var(--muted) 65%,white);
  --line:color-mix(in srgb,var(--primary) 10%,white); --track:color-mix(in srgb,var(--primary) 8%,white);
  --tint:color-mix(in srgb,var(--primary) 5%,white); --tint-2:color-mix(in srgb,var(--primary) 3%,white);
  --primary-bg:color-mix(in srgb,var(--primary) 12%,white); --primary-ink:color-mix(in srgb,var(--primary) 85%,black);
  --accent-bg:color-mix(in srgb,var(--accent) 16%,white); --accent-ink:color-mix(in srgb,var(--accent-deep) 85%,black);
  --success-bg:color-mix(in srgb,var(--success) 14%,white); --success-ink:color-mix(in srgb,var(--success) 62%,black);
  --success-2-ink:color-mix(in srgb,var(--success-2) 45%,black);
  --warning-bg:color-mix(in srgb,var(--warning) 14%,white); --warning-ink:color-mix(in srgb,var(--warning) 68%,black);
  --danger-bg:color-mix(in srgb,var(--danger) 12%,white); --danger-ink:color-mix(in srgb,var(--danger) 70%,black);
  --grey-bg:color-mix(in srgb,var(--grey) 30%,white); --grey-ink:color-mix(in srgb,var(--grey) 40%,black);
}
html,body{ font-family:var(--font); color:var(--ink); -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.doc{ width:7.5in; }
@media screen{ body{ background:var(--track); padding:20px 12px; } .doc{ margin:0 auto; background:#fff; padding:0.5in; box-shadow:0 2px 14px color-mix(in srgb,var(--primary) 22%,transparent); width:auto; max-width:8.5in; } }
.fill-blue{ background:var(--primary); } .fill-gold{ background:var(--accent); color:var(--accent-ink); }
.fill-green{ background:var(--success); } .fill-sage{ background:var(--success-2); color:var(--success-2-ink); }
.fill-amber{ background:var(--warning); } .fill-red{ background:var(--danger); } .fill-grey{ background:var(--grey); color:var(--grey-ink); }
header.band{ background:linear-gradient(100deg,var(--primary),var(--primary-2)); color:#fff; border-radius:12px; padding:20px 26px 22px; position:relative; overflow:hidden; }
header.band::after{ content:""; position:absolute; left:0; right:0; bottom:0; height:5px; background:var(--accent); }
header.band .wordmark{ color:var(--logo-color,#fff); height:var(--logo-h,26px); margin-bottom:14px; } header.band .wordmark svg, header.band .wordmark img{ height:var(--logo-h,26px); width:auto; display:block; }
header.band .kicker{ font-size:12px; letter-spacing:.16em; text-transform:uppercase; color:var(--accent); font-weight:600; }
header.band h1{ font-size:27px; font-weight:700; margin-top:4px; letter-spacing:-.01em; }
header.band .sub{ font-size:12.5px; opacity:.92; margin-top:7px; }
.hero{ display:flex; gap:22px; align-items:center; margin-top:22px; page-break-inside:avoid; }
.ring .big{ font-size:38px; font-weight:800; fill:var(--primary); } .ring .lbl{ font-size:9px; fill:var(--muted); letter-spacing:.04em; }
.heroText h2{ font-size:19px; color:var(--primary); font-weight:700; } .heroText p{ font-size:13px; color:var(--ink-2); margin-top:7px; line-height:1.5; }
h2.section-title{ font-size:12px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); margin:24px 0 9px; font-weight:700; page-break-after:avoid; }
h2.section-title::before{ content:""; display:inline-block; width:14px; height:3px; background:var(--accent); vertical-align:middle; margin-right:8px; border-radius:2px; }
h3{ font-size:13.5px; color:var(--primary); font-weight:700; margin-top:16px; page-break-after:avoid; }
h4{ font-size:11.5px; color:var(--muted); font-weight:700; margin-top:12px; text-transform:uppercase; letter-spacing:.05em; page-break-after:avoid; }
p.lead{ font-size:11.5px; color:var(--ink-2); margin-top:8px; line-height:1.55; orphans:3; widows:3; page-break-after:avoid; break-after:avoid-page; }
hr{ border:0; border-top:1px solid var(--line); margin:16px 0; }
blockquote{ margin-top:10px; padding:2px 0 2px 12px; border-left:3px solid var(--grey); color:var(--muted); font-size:11.5px; line-height:1.5; }
code{ font-family:Consolas,monospace; font-size:10px; background:var(--tint); padding:0 3px; border-radius:3px; }
pre.code{ margin-top:8px; font-size:10px; background:var(--tint-2); padding:9px 11px; border-radius:6px; white-space:pre-wrap; font-family:Consolas,monospace; }
a{ color:var(--info); }
.statbar{ margin-top:12px; page-break-inside:avoid; } .bar-title{ font-size:11.5px; font-weight:700; color:var(--primary); margin-bottom:6px; }
.bar{ display:flex; height:34px; border-radius:7px; overflow:hidden; box-shadow:inset 0 0 0 1px rgba(0,0,0,.05); }
.bar > div{ display:flex; align-items:center; justify-content:center; color:#fff; font-size:12px; font-weight:700; }
.bar > div.fill-gold, .bar > div.fill-sage, .bar > div.fill-grey{ color:inherit; }
.legend{ display:flex; gap:16px; flex-wrap:wrap; margin-top:10px; } .legend .it{ display:flex; align-items:center; gap:7px; font-size:11px; color:var(--ink-2); }
.dot{ width:11px; height:11px; border-radius:3px; display:inline-block; }
.cards{ display:grid; gap:11px; margin-top:14px; grid-template-columns:repeat(4,1fr); page-break-inside:avoid; }
.cards.c1{ grid-template-columns:1fr; } .cards.c2{ grid-template-columns:repeat(2,1fr); } .cards.c3{ grid-template-columns:repeat(3,1fr); }
.card{ border:1px solid var(--line); border-radius:9px; padding:12px 13px; }
.card .n{ font-size:26px; font-weight:800; line-height:1; } .card .t{ font-size:11px; color:var(--muted); margin-top:6px; font-weight:600; } .card .p{ font-size:10.5px; color:var(--faint); margin-top:3px; }
.card.blue{ border-top:3px solid var(--primary); } .card.blue .n{ color:var(--primary); }
.card.gold{ border-top:3px solid var(--accent); } .card.gold .n{ color:var(--accent-deep); }
.card.green{ border-top:3px solid var(--success); } .card.green .n{ color:var(--success); }
.card.sage{ border-top:3px solid var(--success-2); } .card.sage .n{ color:var(--success-2-ink); }
.card.amber{ border-top:3px solid var(--warning); } .card.amber .n{ color:var(--warning-ink); }
.card.red{ border-top:3px solid var(--danger); } .card.red .n{ color:var(--danger-ink); }
.card.grey{ border-top:3px solid var(--grey); } .card.grey .n{ color:var(--grey-ink); }
.meters{ margin-top:10px; display:grid; gap:9px; page-break-inside:avoid; }
.meter .m-top{ display:flex; justify-content:space-between; gap:12px; font-size:11.5px; color:var(--ink-2); margin-bottom:4px; } .meter .m-top b{ color:var(--primary); white-space:nowrap; }
.m-track{ height:9px; background:var(--track); border-radius:5px; overflow:hidden; } .m-fill{ height:100%; border-radius:5px; }
.cell-bar{ display:flex; align-items:center; gap:8px; } .cell-bar .m-track{ flex:1; min-width:46px; height:7px; } .cell-bar b{ font-size:10.5px; color:var(--primary); white-space:nowrap; }
li.meter-li{ list-style:none; padding-left:0 !important; } li.meter-li::before{ display:none; }
.panel{ margin-top:16px; background:var(--tint-2); border:1px solid var(--line); border-radius:9px; padding:12px 15px 14px; page-break-inside:avoid; } .panel h3{ margin:0 0 4px; }
.cols{ display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-top:6px; }
.callout{ margin-top:12px; border-radius:8px; padding:10px 14px; font-size:11.5px; line-height:1.5; background:var(--tint); border-left:4px solid var(--primary); page-break-inside:avoid; }
.callout b{ color:var(--primary); }
.callout.warn{ background:var(--warning-bg); border-left-color:var(--warning); } .callout.warn b{ color:var(--warning-ink); }
.callout.good{ background:var(--success-bg); border-left-color:var(--success); } .callout.good b{ color:var(--success-ink); }
.callout.bad{ background:var(--danger-bg); border-left-color:var(--danger); } .callout.bad b{ color:var(--danger-ink); }
table.t{ width:100%; border-collapse:collapse; margin-top:10px; font-size:11px; }
table.t th{ background:var(--primary); color:#fff; text-align:left; padding:6px 9px; font-weight:600; font-size:10.5px; }
table.t td{ padding:6px 9px; border-bottom:1px solid var(--line); vertical-align:top; line-height:1.4; }
table.t tr:nth-child(even) td{ background:var(--tint-2); } table.t tr{ page-break-inside:avoid; }
ul.l, ol.n{ margin:6px 0 0 0; } ul.l{ list-style:none; }
ul.l li, ol.n li{ font-size:11.5px; color:var(--ink-2); line-height:1.5; margin-top:4px; }
ul.l li{ padding-left:15px; position:relative; }
ul.l li::before{ content:""; position:absolute; left:0; top:7px; width:6px; height:6px; border-radius:2px; background:var(--accent); }
ul.l li.task::before{ width:10px; height:10px; top:4px; border-radius:2px; background:#fff; border:1.5px solid var(--primary); }
ul.l li.task.done::before{ background:var(--success); border-color:var(--success); }
ul.l li.task.done::after{ content:""; position:absolute; left:3px; top:5px; width:3px; height:6px; border:solid #fff; border-width:0 2px 2px 0; transform:rotate(40deg); }
ol.n{ padding-left:20px; }
.pill{ display:inline-block; padding:1px 8px; border-radius:10px; font-size:10px; font-weight:700; }
.pill.gold{ background:var(--accent-bg); color:var(--accent-ink); } .pill.blue{ background:var(--primary-bg); color:var(--primary-ink); } .pill.green, .pill.sage{ background:var(--success-bg); color:var(--success-ink); }
.pill.amber{ background:var(--warning-bg); color:var(--warning-ink); } .pill.red{ background:var(--danger-bg); color:var(--danger-ink); } .pill.grey{ background:var(--grey-bg); color:var(--grey-ink); }
.defs{ margin-top:14px; display:grid; grid-template-columns:1fr 1fr; gap:9px; }
.def{ border:1px solid var(--line); border-radius:8px; padding:10px 12px; font-size:11.5px; line-height:1.5; page-break-inside:avoid; } .def b{ color:var(--primary); }
figure.fig{ margin-top:12px; page-break-inside:avoid; } figure.fig img{ display:block; max-width:100%; border:1px solid var(--line); border-radius:8px; }
figure.fig figcaption{ font-size:10px; color:var(--muted); margin-top:4px; }
.diagram{ margin-top:12px; border:1px solid var(--line); border-radius:8px; padding:8px; page-break-inside:avoid; } .diagram svg{ height:auto; max-height:5.6in; display:block; margin:0 auto; }
.diagram pre.mermaid{ font-family:Consolas,monospace; font-size:10px; white-space:pre-wrap; }
.example{ margin-top:14px; border:1px solid var(--line); border-radius:10px; overflow:hidden; display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.25fr); page-break-inside:avoid; }
.example.stack{ grid-template-columns:minmax(0,1fr); }
.example .ex-src{ border-right:1px solid var(--line); } .example.stack .ex-src{ border-right:0; }
.example.stack .ex-get{ border-top:1px solid var(--line); }
.example:not(.stack) .ex-get{ border-top:0; }
.example:not(.stack) .cards{ grid-template-columns:repeat(2,1fr); }
.example:not(.stack) .def, .example:not(.stack) .defs{ grid-template-columns:1fr; }
.example .ex-out .section-title{ margin-top:10px; }
@media screen and (max-width:640px){ .example{ grid-template-columns:minmax(0,1fr); } }
.example .ex-label{ font-size:9.5px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); background:var(--tint); padding:5px 12px; }
.example .ex-get{ background:var(--accent-bg); color:var(--accent-deep); border-top:1px solid var(--line); }
.example pre.code{ margin:0; border-radius:0; background:#fff; padding:9px 12px; font-size:10px; }
.example .ex-out{ padding:2px 14px 14px; }
.example .ex-out > :first-child{ margin-top:10px; }
.pagebreak{ break-after:page; page-break-after:always; height:0; }
.footer{ margin-top:26px; font-size:9.5px; color:var(--faint); border-top:1px solid var(--line); padding-top:7px; display:flex; justify-content:space-between; gap:16px; position:relative; }
.footer::before{ content:""; position:absolute; top:-1px; left:0; width:40px; height:2px; background:var(--accent); }
`;

  function document_(md, opts) {
    opts = opts || {};
    const tpl = normalizeTemplate(opts.template || DEFAULT_TEMPLATE);
    const r = convert(md);
    const m = r.meta;
    const c = tpl.colors;
    // The library is inlined so the report opens offline; "<!--" and "<script" are escaped so the HTML parser keeps the block whole.
    const mermaid = r.mermaid && opts.mermaid
      ? `<script>${opts.mermaid.replace(/<!--/g, '<\\x21--').replace(/<(\/?)script/gi, '<$1scr\\x69pt')}</script>` +
        `<script>mermaid.initialize({startOnLoad:true,theme:"base",themeVariables:{fontFamily:"Segoe UI, Arial",primaryColor:"#eef3f9",primaryBorderColor:"${c.primary}",lineColor:"${c.muted}",clusterBkg:"#fdf8ea",clusterBorder:"${c.accent}"}});</script>`
      : '';
    if (r.mermaid && !opts.mermaid) r.warnings.push('Diagram library not found; diagrams show as text');
    const footer = (m.source || m.footer)
      ? `<div class="footer"><span>${m.source ? 'Source: ' + inline(m.source) : ''}</span><span>${inline(m.footer || '')}</span></div>` : '';
    const logo = !tpl.logo ? '' : `<div class="wordmark">${tpl.logo.svg || `<img src="${esc(tpl.logo.src)}" alt="">`}</div>`;
    const band = `<header class="band">${logo}` +
      `${m.kicker ? `<div class="kicker">${inline(m.kicker)}</div>` : ''}<h1>${esc(r.title)}</h1>` +
      `${m.subtitle ? `<div class="sub">${inline(m.subtitle)}</div>` : ''}</header>`;
    const body = r.html.replace(/src="asset:([\w-]+)"/g, (all, name) => {
      if (tpl.assets[name]) return `src="${esc(tpl.assets[name])}"`;
      r.warnings.push('Image asset "' + name + '" is not in the template');
      return 'src=""';
    });
    return {
      html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(r.title)}</title><style>${templateCss(tpl)}${CSS}</style>${mermaid}</head><body><div class="doc">${band}${body}${footer}</div></body></html>`,
      warnings: r.warnings,
      title: r.title,
    };
  }

  return { convert, document: document_, CSS, inline, DEFAULT_TEMPLATE, normalizeTemplate, templateCss };
});
