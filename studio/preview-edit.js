// Edit the report where it is drawn: hover a block for a toolbar, click it to edit, drag it to move it,
// drop a component from the toolbar between blocks. Every change is written back into the markdown.
// Runs after the editor, the component menu and the block logic are defined.
const Blocks = ReportKitBlocks;
let rkDoc = null, rk = null, rkHover = null, rkDrag = null, ed = null, dlgEl = null;

const EL = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = txt; return x; };
const totalLines = () => src.value.split('\n').length;
const blockEls = () => (rkDoc ? [...rkDoc.querySelectorAll('rk-b')] : []);
const infoOf = el => ({ el, s: +el.dataset.s, e: +el.dataset.e });
function blockInfoFor(el) { const b = el && el.closest ? el.closest('rk-b') : null; return b ? infoOf(b) : null; }

// a block can draw as several elements, so its box is the union of them, in page coordinates
function boxOf(el) {
  const w = rkDoc.defaultView, kids = el.hasAttribute('data-rk') ? [el] : [...el.children];
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  kids.forEach(k => { const q = k.getBoundingClientRect(); if (!q.width && !q.height) return; l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); });
  if (!isFinite(l)) return null;
  return { left: l + w.scrollX, top: t + w.scrollY, right: r + w.scrollX, bottom: b + w.scrollY, width: r - l, height: b - t };
}

// ---- writing back into the markdown ----
function stale() {
  if (src.value === renderedSrc) return false;
  toast('The report is still updating. Try again in a moment.');
  return true;
}
function setSource(md, o) {
  o = o || {};
  const top = src.scrollTop;
  src.focus(); src.select();
  let ok = false;
  try { ok = document.execCommand('insertText', false, md); } catch (err) {}
  if (!ok) src.value = md;
  src.scrollTop = top;
  if (o.line != null) { const off = Math.min(md.length, Blocks.lineOffset(md, o.line)); src.setSelectionRange(off, off); }
  clearTimeout(t); render();
}
function commit(md, msg, line) { if (md === src.value) return; setSource(md, { line }); toast(msg, true); }

// ---- the preview: hover toolbar, outline, drop line ----
const PREVIEW_CSS = `
rk-b{ cursor:pointer; } [data-rk]{ cursor:pointer; }
.rk-ui{ position:absolute; left:0; top:0; width:0; height:0; z-index:2147483000; font:12px "Segoe UI",Arial,sans-serif; }
.rk-box{ position:absolute; display:none; border:2px solid #FFBF00; border-radius:8px; background:rgba(255,191,0,.07); pointer-events:none; box-sizing:border-box; }
.rk-bar{ position:absolute; display:none; gap:2px; background:#022851; border-radius:7px; padding:3px; box-shadow:0 3px 10px rgba(0,0,0,.3); pointer-events:auto; }
.rk-bar button{ font:inherit; color:#fff; background:transparent; border:0; border-radius:5px; padding:4px 8px; cursor:pointer; }
.rk-bar button:hover{ background:rgba(255,255,255,.2); }
.rk-bar button.grip{ background:rgba(255,191,0,.3); cursor:grab; }
.rk-bar button.del:hover{ background:#d93a46; }
.rk-line{ position:absolute; display:none; height:4px; background:#FFBF00; border-radius:2px; box-shadow:0 0 0 3px rgba(255,191,0,.3); pointer-events:none; }
html.rk-drag, html.rk-drag *{ cursor:grabbing !important; user-select:none !important; }
@media print{ .rk-ui{ display:none !important; } }`;

function attachPreview() {
  let d;
  try { d = view.contentDocument; } catch (err) { return; }
  if (!d || !d.body || document.body.dataset.mode === 'chart') return;
  rkDoc = d; rkHover = null; rkDrag = null;
  const st = d.createElement('style'); st.textContent = PREVIEW_CSS; d.head.appendChild(st);
  const ui = d.createElement('div'); ui.className = 'rk-ui';
  const box = d.createElement('div'); box.className = 'rk-box';
  const line = d.createElement('div'); line.className = 'rk-line';
  const bar = d.createElement('div'); bar.className = 'rk-bar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Block tools');
  [['drag', 'Drag', 'grip', 'Drag to move this block'], ['up', 'Up', '', 'Move up'], ['down', 'Down', '', 'Move down'], ['edit', 'Edit', '', 'Edit this block'], ['copy', 'Copy', '', 'Duplicate this block'], ['del', 'Delete', 'del', 'Delete this block']].forEach(([act, label, cls, title]) => {
    const b = d.createElement('button'); b.textContent = label; b.dataset.act = act; b.title = title; if (cls) b.className = cls; bar.appendChild(b);
  });
  ui.append(box, line, bar); d.body.appendChild(ui);
  rk = { ui, box, line, bar };

  d.addEventListener('mousemove', e => {
    if (rkDrag) { dragMove(e); return; }
    if (e.target.closest('.rk-ui')) return;
    hover(e.target.closest('rk-b') || e.target.closest('[data-rk]'));
  });
  d.documentElement.addEventListener('mouseleave', () => { if (!rkDrag) hover(null); });
  d.addEventListener('mousedown', e => { closeMenu(); if (e.target.closest('.rk-bar .grip')) { e.preventDefault(); if (rkHover && !rkHover.hasAttribute('data-rk')) startDrag(rkHover); } });
  d.addEventListener('mouseup', () => { if (rkDrag) endDrag(true); });
  d.addEventListener('keydown', e => { if (e.key === 'Escape' && rkDrag) endDrag(false); });
  d.addEventListener('click', e => {
    const btn = e.target.closest('.rk-bar button');
    if (btn) { e.preventDefault(); barAction(btn.dataset.act); return; }
    if (e.target.closest('.rk-ui')) return;
    e.preventDefault();
    const hdr = e.target.closest('[data-rk]');
    if (hdr) { openHeaderEditor(); return; }
    const bi = blockInfoFor(e.target);
    if (bi) openBlockEditor(bi);
  });
  // a component dragged from the Insert toolbar or the menu lands between blocks
  d.addEventListener('dragover', e => {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes('text/plain')) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
    showSlot(slotAt(e.clientY + d.defaultView.scrollY));
  });
  d.addEventListener('dragleave', e => { if (!e.relatedTarget) hideSlot(); });
  d.addEventListener('drop', e => {
    const text = e.dataTransfer && e.dataTransfer.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    const slot = slotAt(e.clientY + d.defaultView.scrollY);
    hideSlot();
    if (stale()) return;
    const at = slot.before ? +slot.before.dataset.s : totalLines();
    commit(Blocks.insertAt(src.value, at, text.trim()), 'Component added.', at);
  });
}
view.addEventListener('load', attachPreview);
const hideHover = () => hover(null);
window.addEventListener('resize', hideHover);

function hover(el) {
  if (!rk) return;
  rkHover = el;
  if (!el) { rk.box.style.display = 'none'; rk.bar.style.display = 'none'; return; }
  const q = boxOf(el);
  if (!q) { rk.box.style.display = 'none'; rk.bar.style.display = 'none'; return; }
  const isHdr = el.hasAttribute('data-rk');
  Object.assign(rk.box.style, { display: 'block', left: q.left - 6 + 'px', top: q.top - 6 + 'px', width: q.width + 12 + 'px', height: q.height + 12 + 'px' });
  [...rk.bar.children].forEach(b => { b.style.display = isHdr && b.dataset.act !== 'edit' ? 'none' : ''; });
  rk.bar.style.display = 'flex';
  rk.bar.style.left = Math.max(4, q.right + 6 - rk.bar.offsetWidth) + 'px';
  rk.bar.style.top = Math.max(2, q.top - 6 - rk.bar.offsetHeight - 3) + 'px';
}

function barAction(act) {
  const el = rkHover;
  if (!el) return;
  if (act === 'edit') { if (el.hasAttribute('data-rk')) openHeaderEditor(); else openBlockEditor(infoOf(el)); return; }
  if (el.hasAttribute('data-rk') || act === 'drag' || stale()) return;
  const bi = infoOf(el), bs = blockEls(), i = bs.indexOf(el), md = src.value;
  if (act === 'del') { commit(Blocks.removeBlock(md, bi.s, bi.e), 'Block deleted.', bi.s); return; }
  if (act === 'copy') { commit(Blocks.duplicateBlock(md, bi.s, bi.e), 'Block duplicated.', bi.e + 1); return; }
  if (act === 'up') { if (i > 0) commit(Blocks.moveBlock(md, bi.s, bi.e, +bs[i - 1].dataset.s), 'Block moved up.'); return; }
  if (act === 'down') { if (i < bs.length - 1) commit(Blocks.moveBlock(md, bi.s, bi.e, i + 2 < bs.length ? +bs[i + 2].dataset.s : totalLines()), 'Block moved down.'); }
}

// ---- drag to reorder ----
function slotAt(y) {
  const bs = blockEls();
  for (const b of bs) { const q = boxOf(b); if (q && y < q.top + q.height / 2) return { before: b, y: q.top - 9 }; }
  const q = bs.length ? boxOf(bs[bs.length - 1]) : null;
  return { before: null, y: q ? q.bottom + 9 : 20 };
}
function showSlot(slot) {
  const doc = rkDoc.querySelector('.doc'), q = doc ? doc.getBoundingClientRect() : { left: 20, width: 700 };
  Object.assign(rk.line.style, { display: 'block', top: slot.y + 'px', left: q.left + rkDoc.defaultView.scrollX + 20 + 'px', width: q.width - 40 + 'px' });
}
const hideSlot = () => { if (rk) rk.line.style.display = 'none'; };
function startDrag(el) {
  rkDrag = { el, y: 0, slot: null, timer: setInterval(() => {
    const w = rkDoc.defaultView;
    if (rkDrag.y < 50) w.scrollBy(0, -16); else if (rkDrag.y > w.innerHeight - 50) w.scrollBy(0, 16);
  }, 30) };
  rkDoc.documentElement.classList.add('rk-drag');
  [...el.children].forEach(c => { c.style.opacity = '0.4'; });
  rk.box.style.display = 'none'; rk.bar.style.display = 'none';
}
function dragMove(e) {
  rkDrag.y = e.clientY;
  rkDrag.slot = slotAt(e.clientY + rkDoc.defaultView.scrollY);
  showSlot(rkDrag.slot);
}
function endDrag(apply) {
  const dr = rkDrag;
  rkDrag = null;
  clearInterval(dr.timer);
  rkDoc.documentElement.classList.remove('rk-drag');
  [...dr.el.children].forEach(c => { c.style.opacity = ''; });
  hideSlot();
  if (!apply || !dr.slot || stale()) return;
  const bi = infoOf(dr.el), at = dr.slot.before ? +dr.slot.before.dataset.s : totalLines();
  commit(Blocks.moveBlock(src.value, bi.s, bi.e, at), 'Block moved.');
}
document.addEventListener('mouseup', () => { if (rkDrag) endDrag(true); });

// ---- form helpers ----
function uiFld(label, control, hint) { const w = EL('label', 'fld'); w.appendChild(EL('span', 'fl', label)); w.appendChild(control); if (hint) w.appendChild(EL('span', 'fh', hint)); return w; }
function uiTx(get, set, ph) { const i = EL('input'); i.type = 'text'; i.value = get(); if (ph) i.placeholder = ph; i.oninput = () => set(i.value); return i; }
function uiAr(get, set, rows) { const a = EL('textarea'); a.rows = rows || 5; a.value = get(); a.oninput = () => set(a.value); return a; }
function uiSel(opts, get, set) { const s = EL('select'); opts.forEach(([v, l]) => { const o = EL('option', null, l); o.value = v; s.appendChild(o); }); s.value = get(); s.onchange = () => set(s.value); return s; }
function uiChk(label, get, set) { const l = EL('label', 'chk'), i = EL('input'); i.type = 'checkbox'; i.checked = !!get(); i.onchange = () => set(i.checked); l.append(i, ' ' + label); return l; }
const uiMini = (label, fn, cls) => { const b = EL('button', 'mini' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.onclick = fn; return b; };
const COLOR_OPTS = [['', 'Default'], ['blue', 'Blue'], ['gold', 'Gold'], ['green', 'Green'], ['sage', 'Sage'], ['amber', 'Amber'], ['red', 'Red'], ['grey', 'Grey']];

// a list of rows with one input per column, plus move and remove buttons
function rowsEditor(rows, cols, blank, addLabel) {
  const wrap = EL('div'), tb = EL('table', 'rows');
  const hr = EL('tr');
  cols.forEach(c => hr.appendChild(EL('th', null, c.label)));
  hr.appendChild(EL('th'));
  tb.appendChild(hr);
  rows.forEach((row, i) => {
    const tr = EL('tr');
    cols.forEach(c => {
      const td = EL('td');
      if (c.kind === 'select') td.appendChild(uiSel(c.options, () => row[c.key] || '', v => { row[c.key] = v; }));
      else if (c.kind === 'check') { const k = EL('input'); k.type = 'checkbox'; k.checked = !!row[c.key]; k.onchange = () => { row[c.key] = k.checked; }; td.appendChild(k); }
      else td.appendChild(uiTx(() => row[c.key] || '', v => { row[c.key] = v; }, c.ph));
      tr.appendChild(td);
    });
    const act = EL('td', 'act');
    act.append(uiMini('Up', () => { if (i) { rows.splice(i - 1, 2, rows[i], rows[i - 1]); redraw(); } }), ' ', uiMini('Down', () => { if (i < rows.length - 1) { rows.splice(i, 2, rows[i + 1], rows[i]); redraw(); } }), ' ', uiMini('Remove', () => { rows.splice(i, 1); redraw(); }, 'danger'));
    tr.appendChild(act); tb.appendChild(tr);
  });
  wrap.appendChild(tb);
  const add = EL('div'); add.style.marginTop = '8px';
  add.appendChild(uiMini(addLabel || 'Add a row', () => { rows.push(blank()); redraw(); }));
  wrap.appendChild(add);
  return wrap;
}

// a spreadsheet-style grid of text cells; the first row is the header
function uiGrid(rows, onShape, onEdit) {
  const wrap = EL('div'), box = EL('div', 'grid'), tb = EL('table');
  const w = rows[0].length;
  const tr0 = EL('tr', 'ctl');
  for (let c = 0; c < w; c++) { const td = EL('td', 'ctl'); td.appendChild(uiMini('Remove column', () => { if (w > 1) { rows.forEach(r => r.splice(c, 1)); onShape(c); } }, 'danger')); tr0.appendChild(td); }
  tr0.appendChild(EL('td', 'ctl'));
  tb.appendChild(tr0);
  rows.forEach((row, r) => {
    const tr = EL('tr', r ? '' : 'head');
    row.forEach((cell, c) => { const td = EL('td'); const i = uiTx(() => cell, v => { row[c] = v; onEdit(r, c, v); }); td.appendChild(i); tr.appendChild(td); });
    const td = EL('td', 'ctl');
    if (r) td.appendChild(uiMini('Remove row', () => { rows.splice(r, 1); onShape(); }, 'danger'));
    tr.appendChild(td); tb.appendChild(tr);
  });
  box.appendChild(tb); wrap.appendChild(box);
  const add = EL('div'); add.style.marginTop = '8px';
  add.append(uiMini('Add a row', () => { rows.push(Array(w).fill('')); onShape(); }), ' ', uiMini('Add a column', () => { rows.forEach((r, i) => r.push(i ? '' : 'Column ' + (w + 1))); onShape(); }));
  wrap.appendChild(add);
  return wrap;
}

// ---- the form for each block type ----
function formFor(m) {
  const f = EL('div');
  const T = {
    heading() { f.append(uiFld('Text', uiTx(() => m.text, v => { m.text = v; })), uiFld('Size', uiSel([['2', 'Section'], ['3', 'Subsection'], ['4', 'Small heading'], ['1', 'Title']], () => String(m.level), v => { m.level = +v; }))); },
    paragraph() { f.append(uiFld('Text', uiAr(() => m.text, v => { m.text = v; }, 8), 'Use **bold**, *italic*, and [[Status]] for a pill.')); },
    image() { f.append(uiFld('Caption', uiTx(() => m.alt, v => { m.alt = v; })), uiFld('Image', uiTx(() => m.src, v => { m.src = v; }), 'A file name, a link, or asset:name for an image in the template.')); },
    callout() { f.append(uiFld('Type', uiSel([['note', 'Note'], ['good', 'Good news'], ['warn', 'Warning'], ['bad', 'Problem']], () => m.kind, v => { m.kind = v; })), uiFld('Title', uiTx(() => m.title, v => { m.title = v; })), uiFld('Text', uiAr(() => m.body, v => { m.body = v; }, 4))); },
    quote() { f.append(uiFld('Text', uiAr(() => m.body, v => { m.body = v; }, 4))); },
    hero() { f.append(uiFld('Percent', uiTx(() => m.pct, v => { m.pct = v; }), 'The number inside the ring, 0 to 100.'), uiFld('Label inside the ring', uiTx(() => m.label, v => { m.label = v; })), uiFld('Headline', uiTx(() => m.headline, v => { m.headline = v; })), uiFld('Paragraph', uiAr(() => m.paragraph, v => { m.paragraph = v; }, 3))); },
    stats() { f.append(rowsEditor(m.rows, [{ key: 'n', label: 'Number' }, { key: 't', label: 'Label' }, { key: 'p', label: 'Small text' }, { key: 'c', label: 'Color', kind: 'select', options: COLOR_OPTS }], () => ({ n: '0', t: 'Label', p: '', c: '' }), 'Add a card')); },
    bar() { f.append(uiFld('Title', uiTx(() => m.title, v => { m.title = v; })), rowsEditor(m.rows, [{ key: 'v', label: 'Value' }, { key: 'label', label: 'Label' }, { key: 'c', label: 'Color', kind: 'select', options: COLOR_OPTS }], () => ({ v: '1', label: 'Label', c: '' }), 'Add a part')); },
    defs() { f.append(rowsEditor(m.rows, [{ key: 'term', label: 'Term' }, { key: 'text', label: 'Meaning' }], () => ({ term: 'Term', text: 'What it means.' }), 'Add a definition')); },
    meters() { f.append(rowsEditor(m.rows, [{ key: 'value', label: 'Progress', ph: '80% or 45/60' }, { key: 'label', label: 'Label' }, { key: 'c', label: 'Color', kind: 'select', options: COLOR_OPTS }], () => ({ value: '50%', label: 'Label', c: '' }), 'Add a bar')); },
    checklist() { f.append(rowsEditor(m.rows, [{ key: 'done', label: 'Done', kind: 'check' }, { key: 'text', label: 'Item' }], () => ({ done: false, text: 'New item' }), 'Add an item')); },
    steps() { f.append(rowsEditor(m.rows, [{ key: 'text', label: 'Step' }], () => ({ text: 'New step' }), 'Add a step')); },
    bullets() { f.append(rowsEditor(m.rows, [{ key: 'text', label: 'Point' }], () => ({ text: 'New point' }), 'Add a point')); },
    panel() { f.append(uiFld('Title', uiTx(() => m.title, v => { m.title = v; })), uiFld('Text', uiAr(() => m.body, v => { m.body = v; }, 6))); },
    columns() {
      const g = EL('div', 'two'); g.style.gridTemplateColumns = 'repeat(' + m.parts.length + ',1fr)';
      m.parts.forEach((p, i) => g.appendChild(uiFld('Column ' + (i + 1), uiAr(() => m.parts[i], v => { m.parts[i] = v; }, 8))));
      f.appendChild(g);
      const b = EL('div'); b.style.marginTop = '8px';
      b.append(uiMini('Add a column', () => { m.parts.push('New column.'); redraw(); }), ' ', uiMini('Remove last column', () => { if (m.parts.length > 2) { m.parts.pop(); redraw(); } }, 'danger'));
      f.appendChild(b);
    },
    table() {
      f.append(EL('p', 'fh', 'The first row is the header. A cell can hold [60%] for a progress bar or [[Done]] for a status pill.'), uiGrid(m.rows, redraw, () => {}));
    },
    chart() { chartForm(m, f); },
    pagebreak() { f.appendChild(EL('p', 'note', 'A page break starts a new printed page. There is nothing to edit; move it with Drag, Up and Down.')); },
    divider() { f.appendChild(EL('p', 'note', 'A divider is a thin line. There is nothing to edit; move it with Drag, Up and Down.')); },
    toc() { f.appendChild(EL('p', 'note', 'This lists every section heading with links. It updates by itself.')); },
  };
  (T[m.type] || (() => {}))();
  return f;
}

function chartForm(m, f0) {
  const f = EL('div'), right = EL('div', 'cright');
  f0.className = 'chartgrid'; f0.append(f, right);
  const heads = m.rows[0].map((h, i) => [String(i), String(h).trim() || 'Column ' + (i + 1)]);
  // typing in a header cell renames the matching choices in place, so the form keeps its focus
  const refs = { opts: heads.map(() => []), labs: heads.map(() => []) };
  const rename = (c, v) => { const name = v.trim() || 'Column ' + (c + 1); refs.opts[c].forEach(o => { o.textContent = name; }); refs.labs[c].forEach(n => { n.nodeValue = ' ' + name; }); };
  const col = (label, key, hint) => {
    const w = uiFld(label, uiSel([['', '(none)']].concat(heads), () => (m.sel[key] == null ? '' : String(m.sel[key])), v => { m.sel[key] = v === '' ? null : +v; prev(); }), hint);
    [...w.querySelectorAll('option')].forEach((o, i) => { if (i) refs.opts[i - 1].push(o); });
    return w;
  };
  f.append(
    uiFld('Chart type', uiSel(ReportKitCharts.TYPES.map(t => [t.id, t.label]), () => m.ctype, v => { m.ctype = v; autoPick(m); redraw(); })),
    uiFld('Title', uiTx(() => m.title, v => { m.title = v; prev(); })), uiFld('Subtitle', uiTx(() => m.subtitle, v => { m.subtitle = v; prev(); })));
  if (m.ctype === 'gantt') {
    f.append(col('Task', 'task'), col('Start date', 'start'), col('End date', 'end'), col('Duration in days (when there is no end date)', 'duration'), col('Group (sets the color)', 'group'), col('Progress (percent done)', 'progress'),
      uiChk('Show a line for today', () => m.today, v => { m.today = v; prev(); }), uiChk('Show dates beside the bars', () => m.dates, v => { m.dates = v; prev(); }), uiChk('Sort by start date', () => m.sort === 'start', v => { m.sort = v ? 'start' : ''; prev(); }));
  } else {
    f.append(col(m.ctype === 'share' ? 'Names' : 'Categories (or dates)', 'x'), EL('span', 'fl', 'Values'));
    heads.forEach(([v, l]) => { const i = +v; const c = uiChk(l, () => m.y.includes(i), on => { m.y = m.y.filter(x => x !== i).concat(on ? [i] : []); prev(); }); refs.labs[i].push(c.lastChild); f.appendChild(c); });
    if (m.ctype === 'hbar') f.appendChild(uiChk('Largest first', () => m.sort !== 'sheet', v => { m.sort = v ? '' : 'sheet'; prev(); }));
  }
  const box = EL('div', 'cprevbox');
  right.append(box, EL('span', 'fl', 'Data'), uiGrid(m.rows, c => { shiftCols(m, c); redraw(); }, (r, c, v) => { if (!r) rename(c, v); prev(); }));
  function prev() { clearTimeout(prev.t); prev.t = setTimeout(() => drawChartPreview(m, box), 120); }
  drawChartPreview(m, box);
}
function shiftCols(m, c) {
  if (c == null) return;
  Object.keys(m.sel).forEach(k => { if (m.sel[k] === c) m.sel[k] = null; else if (m.sel[k] > c) m.sel[k]--; });
  m.y = m.y.filter(i => i !== c).map(i => (i > c ? i - 1 : i));
}
function autoPick(m) {
  const sp = ReportKitCharts.autoSpec(ReportKitSheet.toTable(m.rows), m.ctype);
  if (m.ctype === 'gantt') ['task', 'start', 'end', 'duration', 'group', 'progress'].forEach(k => { m.sel[k] = sp[k] == null ? null : sp[k]; });
  else { m.sel.x = sp.x == null ? null : sp.x; m.y = sp.y || []; }
}
function drawChartPreview(m, box) {
  try {
    const table = ReportKitSheet.toTable(m.rows);
    const block = Blocks.build(m), lines = block.split('\n'), opts = {};
    let i = 1;
    for (; i < lines.length - 1; i++) { const o = lines[i].match(/^([a-z]+):\s*(.*)$/); if (o && ReportKitCharts.OPTION_KEYS.includes(o[1])) opts[o[1]] = o[2]; else break; }
    const { spec } = ReportKitCharts.fromBlock(table, m.ctype + ' ' + m.title, opts);
    box.innerHTML = ReportKitCharts.render(table, spec, ReportKitCharts.paletteFromTemplate(activeTpl()), { responsive: true }).svg;
  } catch (err) { box.innerHTML = ''; box.appendChild(EL('p', 'note', err.message)); }
}

// ---- the dialog ----
const RAW_LABELS = { testcard: 'Test card', diagram: 'Diagram', code: 'Code', example: 'Example', text: 'Text block' };
function ensureDialog() {
  if (dlgEl) return;
  dlgEl = EL('div', 'overlay'); dlgEl.id = 'blkEditor'; dlgEl.hidden = true;
  dlgEl.innerHTML = '<div class="sheet wide" role="dialog" aria-modal="true" aria-labelledby="blkTitle"><header><strong id="blkTitle"></strong><button id="blkClose">Close</button></header>' +
    '<div class="body" id="blkBody"></div><footer><button class="ghost danger" id="blkDelete">Delete</button><button class="ghost" id="blkMode">Edit as text</button><span class="sp"></span><button class="ghost" id="blkCancel">Cancel</button><button class="primary" id="blkSave">Save</button></footer></div>';
  document.body.appendChild(dlgEl);
  const close = () => { dlgEl.hidden = true; ed = null; };
  $('blkClose').onclick = close; $('blkCancel').onclick = close;
  dlgEl.addEventListener('mousedown', e => { if (e.target === dlgEl) close(); });
  dlgEl.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveEditor(); }
  });
  $('blkSave').onclick = saveEditor;
  $('blkDelete').onclick = () => {
    if (!ed || ed.kind !== 'block' || stale()) return;
    const { s, e } = ed; close(); commit(Blocks.removeBlock(src.value, s, e), 'Block deleted.', s);
  };
  $('blkMode').onclick = () => {
    if (ed.mode === 'form') { ed.text = Blocks.build(ed.model); ed.mode = 'text'; }
    else { const m = Blocks.parse(ed.text); if (m.type === 'raw') { toast('This block can only be edited as text.'); return; } ed.model = m; ed.mode = 'form'; }
    redraw();
  };
}
function openDialog() { dlgEl.hidden = false; const f = dlgEl.querySelector('input,textarea,select'); if (f) f.focus(); }

function redraw() {
  if (!ed) return;
  const body = $('blkBody'), top = body.scrollTop;
  body.innerHTML = '';
  if (ed.kind === 'header') {
    body.appendChild(EL('p', 'fh', 'The header and cover of the report. Leave a field empty to leave it out.'));
    Blocks.FRONT_FIELDS.forEach(([k, label, opts]) => body.appendChild(uiFld(label, opts ? uiSel(opts, () => ed.values[k] || '', v => { ed.values[k] = v; }) : uiTx(() => ed.values[k] || '', v => { ed.values[k] = v; }))));
    $('blkTitle').textContent = 'Edit the report header';
    $('blkDelete').hidden = true; $('blkMode').hidden = true; $('blkSave').hidden = false;
  } else if (ed.mode === 'text') {
    const a = EL('textarea'); a.rows = 16; a.value = ed.text; a.spellcheck = false; a.oninput = () => { ed.text = a.value; };
    body.appendChild(EL('p', 'fh', 'The markdown for this block.')); body.appendChild(a);
    $('blkTitle').textContent = 'Edit ' + (RAW_LABELS[ed.model.kind] || Blocks.LABELS[ed.model.type] || 'block').toLowerCase() + ' as text';
    $('blkDelete').hidden = false; $('blkMode').hidden = ed.model.type === 'raw'; $('blkMode').textContent = 'Edit as form'; $('blkSave').hidden = false;
  } else {
    body.appendChild(formFor(ed.model));
    $('blkTitle').textContent = 'Edit ' + (Blocks.LABELS[ed.model.type] || 'block').toLowerCase();
    $('blkDelete').hidden = false; $('blkMode').hidden = false; $('blkMode').textContent = 'Edit as text';
    $('blkSave').hidden = ['pagebreak', 'divider', 'toc'].includes(ed.model.type);
  }
  body.scrollTop = top;
}

function openBlockEditor(bi) {
  if (stale()) return;
  ensureDialog();
  const text = src.value.split('\n').slice(bi.s, bi.e).join('\n');
  const model = Blocks.parse(text);
  ed = { kind: 'block', s: bi.s, e: bi.e, model, text, mode: model.type === 'raw' ? 'text' : 'form' };
  redraw(); openDialog();
}
function openHeaderEditor() {
  if (stale()) return;
  ensureDialog();
  const f = Blocks.readFront(src.value), values = Object.assign({}, f.values), lh = values.title ? null : Blocks.leadHeading(src.value);
  if (lh) values.title = lh.text;
  ed = { kind: 'header', values, lead: lh, md: src.value };
  redraw(); openDialog();
}
function saveEditor() {
  if (!ed || stale()) return;
  const cur = ed;
  if (cur.kind === 'header') {
    let md = src.value;
    const vals = {};
    Blocks.FRONT_FIELDS.forEach(([k]) => { vals[k] = cur.values[k] || ''; });
    if (cur.lead) {
      if (vals.title === cur.lead.text) delete vals.title;
      else if (vals.title) { const L = md.split('\n'); L.splice(cur.lead.line, L[cur.lead.line + 1] === '' ? 2 : 1); md = L.join('\n'); }
    }
    md = Blocks.setFront(md, vals);
    dlgEl.hidden = true; ed = null;
    commit(md, 'Header updated.', 0);
    return;
  }
  const text = cur.mode === 'text' ? cur.text : Blocks.build(cur.model);
  dlgEl.hidden = true; ed = null;
  commit(Blocks.replaceBlock(src.value, cur.s, cur.e, text), 'Saved.', cur.s);
}
