// Right-click component menu, quick-insert toolbar and drag and drop for the report editor.
// Runs after render(), the editor helpers and Chart mode are defined.
const Comp = ReportKitComponents;
const chartMode = () => document.body.dataset.mode === 'chart';
let ctxTarget = 'cursor', ctxEl = null, ctxInfo = null;

function toast(msg, undo) {
  let box = $('toast');
  if (!box) { box = document.createElement('div'); box.id = 'toast'; box.className = 'toast'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
  box.textContent = msg; box.classList.add('show');
  if (undo) {
    const u = document.createElement('button'); u.textContent = 'Undo'; u.type = 'button';
    u.onclick = () => { src.focus(); document.execCommand('undo'); clearTimeout(t); render(); box.classList.remove('show'); };
    box.appendChild(u);
  }
  clearTimeout(toast.timer); toast.timer = setTimeout(() => box.classList.remove('show'), undo ? 6000 : 3200);
}

// Inserts a component at the cursor (or at the end of the report) and selects its placeholder text.
function put(item) {
  if (item.action === 'sheet') { setMode('chart'); $('cFileInput').click(); return; }
  if (item.front) {
    const r = Comp.applyFront(src.value, item.front);
    if (!r.changed) { toast(item.label + ' is already in the report header.'); return; }
    src.focus(); src.select();
    if (!document.execCommand('insertText', false, r.md)) { src.value = r.md; render(); }
    src.setSelectionRange(0, 0); src.scrollTop = 0;
    toast(item.label + ' added at the top of the report.');
    return;
  }
  src.focus();
  if (ctxTarget === 'end') src.setSelectionRange(src.value.length, src.value.length);
  if (ctxTarget === 'after' && ctxInfo) {
    if (src.value !== renderedSrc) { toast('The report is still updating. Try again in a moment.'); return; }
    const o = Math.min(src.value.length, ReportKitBlocks.lineOffset(src.value, ctxInfo.e));
    src.setSelectionRange(o, o);
  }
  const s = src.selectionStart, e = src.selectionEnd, before = src.value.slice(0, s);
  let pre = '', post = '';
  if (!item.inline) { pre = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : ''; post = '\n\n'; }
  const full = pre + item.text + post;
  // insertText keeps the browser's undo history, so Ctrl+Z takes a component back out
  let ok = false;
  try { ok = document.execCommand('insertText', false, full); } catch (err) {}
  if (!ok) { src.setRangeText(full, s, e, 'end'); render(); }
  const at = s + pre.length;
  if (item.sel && item.text.indexOf(item.sel) >= 0) src.setSelectionRange(at + item.text.indexOf(item.sel), at + item.text.indexOf(item.sel) + item.sel.length);
  else src.setSelectionRange(at + item.text.length, at + item.text.length);
  if (ctxTarget === 'end') src.scrollTop = src.scrollHeight;
}

// ---- the menu ----
const el = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text) d.textContent = text; return d; };

function itemRow(item) {
  const row = el('div', 'ctx-item'); row.setAttribute('role', 'menuitem'); row.tabIndex = -1;
  row.appendChild(el('span', 'ctx-l', item.label));
  if (item.hint) row.appendChild(el('span', 'ctx-h', item.hint));
  row.onclick = e => { e.stopPropagation(); closeMenu(); put(item); };
  if (item.text) {
    row.draggable = true;
    row.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', '\n\n' + item.text + '\n\n'); e.dataTransfer.effectAllowed = 'copy'; });
    row.addEventListener('dragend', closeMenu);
  }
  return row;
}

function actionRow(label, fn) {
  const row = el('div', 'ctx-item'); row.setAttribute('role', 'menuitem'); row.tabIndex = -1;
  row.appendChild(el('span', 'ctx-l', label));
  row.onclick = e => { e.stopPropagation(); closeMenu(); fn(); };
  return row;
}

function buildMenu() {
  const root = el('div', 'ctx-panel ctx-root'); root.setAttribute('role', 'menu');
  root.appendChild(el('div', 'ctx-head', ctxTarget === 'end' ? 'Add to the end of the report' : ctxTarget === 'after' ? 'Add below this block' : 'Insert at the cursor'));
  Comp.GROUPS.forEach(g => {
    const row = el('div', 'ctx-item has-sub'); row.setAttribute('role', 'menuitem'); row.setAttribute('aria-haspopup', 'true'); row.tabIndex = -1;
    row.appendChild(el('span', 'ctx-l', g.group));
    const sub = el('div', 'ctx-panel ctx-sub'); sub.setAttribute('role', 'menu');
    g.items.forEach(it => sub.appendChild(itemRow(it)));
    row.appendChild(sub);
    root.appendChild(row);
  });
  if (ctxTarget === 'cursor') {
    root.appendChild(el('div', 'ctx-sep'));
    root.appendChild(actionRow('Cut', () => { src.focus(); document.execCommand('cut'); }));
    root.appendChild(actionRow('Copy', () => { src.focus(); document.execCommand('copy'); }));
    root.appendChild(actionRow('Paste', () => {
      src.focus();
      if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(t => document.execCommand('insertText', false, t)).catch(() => toast('Press Ctrl+V to paste here.'));
      else toast('Press Ctrl+V to paste here.');
    }));
    root.appendChild(actionRow('Select all', () => { src.focus(); src.select(); }));
  }
  return root;
}

function placeSub(row) {
  const sub = row.querySelector(':scope > .ctx-sub');
  row.classList.add('open');
  sub.classList.remove('left'); sub.style.top = '';
  const r = sub.getBoundingClientRect();
  if (r.right > window.innerWidth - 6) sub.classList.add('left');
  const over = r.bottom - (window.innerHeight - 8);
  if (over > 0) sub.style.top = Math.max(-(r.top - 8), -4 - over) + 'px';
}
function closeSubs(panel, except) { panel.querySelectorAll(':scope > .has-sub.open').forEach(r => { if (r !== except) r.classList.remove('open'); }); }

function openMenu(x, y, target, info) {
  closeMenu();
  ctxTarget = target || 'cursor';
  ctxInfo = info || null;
  ctxEl = buildMenu();
  document.body.appendChild(ctxEl);
  const w = ctxEl.offsetWidth, h = ctxEl.offsetHeight;
  ctxEl.style.left = Math.max(4, Math.min(x, window.innerWidth - w - 4)) + 'px';
  ctxEl.style.top = Math.max(4, Math.min(y, window.innerHeight - h - 4)) + 'px';
  ctxEl.addEventListener('mouseover', e => {
    const row = e.target.closest('.ctx-item');
    if (!row) return;
    const panel = row.parentElement;
    closeSubs(panel, row.classList.contains('has-sub') ? row : null);
    if (row.classList.contains('has-sub')) placeSub(row);
  });
  ctxEl.addEventListener('keydown', menuKey);
  const first = ctxEl.querySelector('.ctx-item'); if (first) first.focus();
}
function closeMenu() { if (ctxEl) { ctxEl.remove(); ctxEl = null; } }

function menuKey(e) {
  const cur = document.activeElement && document.activeElement.closest('.ctx-item');
  const panel = cur ? cur.parentElement : ctxEl;
  const rows = [...panel.querySelectorAll(':scope > .ctx-item')];
  const i = rows.indexOf(cur);
  if (e.key === 'ArrowDown') { rows[(i + 1) % rows.length].focus(); }
  else if (e.key === 'ArrowUp') { rows[(i - 1 + rows.length) % rows.length].focus(); }
  else if (e.key === 'ArrowRight' && cur && cur.classList.contains('has-sub')) { closeSubs(panel, cur); placeSub(cur); const f = cur.querySelector(':scope > .ctx-sub > .ctx-item'); if (f) f.focus(); }
  else if (e.key === 'ArrowLeft' && panel.classList.contains('ctx-sub')) { const parent = panel.parentElement; parent.classList.remove('open'); parent.focus(); }
  else if (e.key === 'Enter' || e.key === ' ') { if (cur) { if (cur.classList.contains('has-sub')) { placeSub(cur); const f = cur.querySelector(':scope > .ctx-sub > .ctx-item'); if (f) f.focus(); } else cur.click(); } }
  else if (e.key === 'Escape') { closeMenu(); src.focus(); }
  else return;
  e.preventDefault(); e.stopPropagation();
}

document.addEventListener('mousedown', e => { if (ctxEl && !ctxEl.contains(e.target)) closeMenu(); });
window.addEventListener('blur', closeMenu);
window.addEventListener('resize', closeMenu);

// Right-click in the editor inserts at the cursor; Shift+right-click keeps the browser's own menu.
src.addEventListener('contextmenu', e => {
  if (chartMode() || e.shiftKey) return;
  e.preventDefault();
  const r = src.getBoundingClientRect();
  openMenu(e.clientX || r.left + 40, e.clientY || r.top + 40, 'cursor');
});
// Right-click in the preview adds to the end of the report.
view.addEventListener('load', () => {
  try {
    const d = view.contentDocument;
    d.addEventListener('contextmenu', e => {
      if (chartMode() || e.shiftKey) return;
      e.preventDefault();
      const r = view.getBoundingClientRect();
      const bi = typeof blockInfoFor === 'function' ? blockInfoFor(e.target) : null;
      openMenu(r.left + e.clientX, r.top + e.clientY, bi ? 'after' : 'end', bi);
    });
    d.addEventListener('mousedown', closeMenu);
  } catch (err) { /* a viewer that blocks access to the preview keeps the editor menu only */ }
});

// ---- Insert toolbar: the quick components, draggable into the text ----
(function () {
  const bar = $('tools');
  Comp.GROUPS.forEach(g => g.items.filter(i => i.quick).forEach(item => {
    const b = document.createElement('button');
    b.textContent = item.label; b.title = item.hint + '. Click to insert, or drag into the text.';
    b.onclick = () => { ctxTarget = 'cursor'; put(item); };
    b.draggable = true; b._text = item.text;
    b.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', '\n\n' + item.text + '\n\n'); e.dataTransfer.effectAllowed = 'copy'; });
    bar.appendChild(b);
  }));
  const more = document.createElement('button');
  more.textContent = 'All components'; more.className = 'more';
  more.onclick = () => { const r = more.getBoundingClientRect(); openMenu(r.left, r.bottom + 4, 'cursor'); };
  bar.appendChild(more);
  const tip = document.createElement('span');
  tip.className = 'tip'; tip.textContent = 'Right-click to add. Click a block to edit. Drag to reorder.';
  bar.appendChild(tip);
})();
// A drop into the editor lands where the pointer is; the browser inserts the dragged text and fires input.
src.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('text/plain')) e.dataTransfer.dropEffect = 'copy'; });
