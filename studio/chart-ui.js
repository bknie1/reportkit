// Chart mode for the Studio: read a spreadsheet, pick the columns, export one chart.
// Runs after render() and the template editor are defined.
const Sheet = ReportKitSheet, Charts = ReportKitCharts;
const MODE_KEY = 'reportstudio.mode';
let cs = { name: '', book: null, sheet: 0, header: 1, table: null, spec: null };

function setMode(m) {
  document.body.dataset.mode = m;
  $('modeReport').classList.toggle('on', m !== 'chart');
  $('modeChart').classList.toggle('on', m === 'chart');
  try { localStorage.setItem(MODE_KEY, m); } catch (e) {}
  render();
}
$('modeReport').onclick = () => setMode('report');
$('modeChart').onclick = () => setMode('chart');

// ---- loading ----
async function chartLoad(bytes, name) {
  try {
    cs.book = await Sheet.readWorkbook(bytes, name);
  } catch (e) { cs.book = null; chartError(e.message); return; }
  cs.name = name; cs.sheet = 0; cs.spec = null;
  const sel = $('cSheet');
  sel.innerHTML = cs.book.sheets.map((s, i) => '<option value="' + i + '">' + escHtml(s.name) + '</option>').join('');
  sel.parentElement.style.display = cs.book.sheets.length > 1 ? '' : 'none';
  chartSheet(true);
}
const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The header is the first row that is mostly filled, so a title line above the data is skipped.
function guessHeader(rows) {
  const nb = r => (r || []).filter(v => v != null && String(v).trim() !== '').length;
  const filled = rows.map((r, i) => [i, nb(r)]).filter(x => x[1] > 0);
  const top = Math.max(0, ...filled.slice(0, 15).map(x => x[1]));
  const hit = filled.find(x => x[1] >= Math.max(2, Math.ceil(top * 0.6)));
  return hit ? filled.indexOf(hit) + 1 : 1;
}

function chartSheet(auto) {
  const rows = cs.book.sheets[cs.sheet].rows.filter(r => r && r.some(v => v != null && String(v).trim() !== ''));
  if (auto) { cs.header = guessHeader(rows); $('cHeader').value = cs.header; }
  cs.table = Sheet.toTable(rows.slice(Math.max(0, cs.header - 1)));
  if (!cs.table.columns.length || !cs.table.length) { cs.table = null; chartError('That sheet has no data under the header row.'); return; }
  const keep = cs.spec || { title: '', subtitle: '' };
  cs.spec = Charts.autoSpec(cs.table, cs.spec && !auto ? cs.spec.type : null);
  cs.spec.title = keep.title; cs.spec.subtitle = keep.subtitle;
  $('cDrop').hidden = true; $('cControls').hidden = false;
  $('cFile').textContent = cs.name + ' - ' + cs.table.length + ' rows, ' + cs.table.columns.length + ' columns';
  $('cType').value = cs.spec.type; $('cTitle').value = cs.spec.title; $('cSub').value = cs.spec.subtitle;
  chartDraw();
}

function chartError(msg) {
  $('cPreview').innerHTML = '<div class="err">' + escHtml(msg) + '</div>';
  $('warn').textContent = '';
}

// ---- controls ----
$('cType').innerHTML = Charts.TYPES.map(t => '<option value="' + t.id + '">' + t.label + '</option>').join('');
$('cType').onchange = e => {
  const keep = { title: cs.spec.title, subtitle: cs.spec.subtitle };
  cs.spec = Charts.autoSpec(cs.table, e.target.value);
  Object.assign(cs.spec, keep);
  chartDraw();
};
$('cTitle').oninput = e => { cs.spec.title = e.target.value; chartRender(); };
$('cSub').oninput = e => { cs.spec.subtitle = e.target.value; chartRender(); };
$('cSheet').onchange = e => { cs.sheet = +e.target.value; chartSheet(true); };
$('cHeader').onchange = e => { cs.header = Math.max(1, +e.target.value || 1); chartSheet(false); };

const colTag = c => escHtml(c.name) + ' (' + c.type + ')';
function pickRow(label, key, none) {
  const cols = cs.table.columns, cur = cs.spec[key];
  return '<label>' + label + '<select data-key="' + key + '">' + (none ? '<option value="-1">(none)</option>' : '') +
    cols.map(c => '<option value="' + c.index + '"' + (c.index === cur ? ' selected' : '') + '>' + colTag(c) + '</option>').join('') + '</select></label>';
}
const chk = (flag, label, on) => '<label class="chk"><input type="checkbox" data-flag="' + flag + '"' + (on ? ' checked' : '') + '> ' + label + '</label>';

function chartDraw() {
  const sp = cs.spec, cols = cs.table.columns;
  $('cHint').textContent = (Charts.TYPES.find(t => t.id === sp.type) || {}).hint || '';
  let h = '';
  if (sp.type === 'gantt') {
    h += pickRow('Task', 'task', false) + pickRow('Start date', 'start', false) + pickRow('End date', 'end', true) +
      pickRow('Duration in days (when there is no end date)', 'duration', true) + pickRow('Group (sets the color)', 'group', true) + pickRow('Progress (percent done)', 'progress', true) +
      chk('today', 'Show a line for today', sp.today !== false) + chk('dates', 'Show dates beside the bars', !!sp.dates) + chk('sortStart', 'Sort by start date', sp.sort === 'start');
  } else {
    h += pickRow(sp.type === 'share' ? 'Names' : 'Categories (or dates)', 'x', true);
    const nums = cols.filter(c => c.type === 'number');
    if (sp.type === 'share') {
      h += '<label>Values<select data-key="y0">' + nums.map(c => '<option value="' + c.index + '"' + (c.index === (sp.y || [])[0] ? ' selected' : '') + '>' + escHtml(c.name) + '</option>').join('') + '</select></label>';
    } else {
      const pal = Charts.paletteFromTemplate(activeTpl());
      h += '<label>Values</label><div class="cols">' + (nums.length ? nums.map(c => {
        const on = (sp.y || []).includes(c.index), pos = (sp.y || []).indexOf(c.index);
        return '<label class="chk"><input type="checkbox" data-y="' + c.index + '"' + (on ? ' checked' : '') + '> <span class="sw" style="background:' + (on ? pal.series[Math.min(pos, pal.series.length - 1)] : '#d9e0e8') + '"></span> ' + escHtml(c.name) + '</label>';
      }).join('') : '<p class="hint">No number columns found.</p>') + '</div>';
    }
    if (sp.type === 'hbar') h += chk('largest', 'Largest first', sp.sort !== 'sheet');
  }
  $('cMap').innerHTML = h;
  // data preview
  const n = Math.min(cs.table.length, 8);
  $('cData').innerHTML = '<table><tr>' + cols.map(c => '<th>' + escHtml(c.name) + '</th>').join('') + '</tr>' +
    Array.from({ length: n }, (_, i) => '<tr>' + cols.map(c => {
      const v = c.values[i];
      return '<td>' + (v == null ? '' : c.type === 'date' ? new Date(v).toISOString().slice(0, 10) : escHtml(v)) + '</td>';
    }).join('') + '</tr>').join('') + '</table>' + (cs.table.length > n ? '<p class="hint">First ' + n + ' of ' + cs.table.length + ' rows.</p>' : '');
  chartRender();
}

$('cMap').addEventListener('change', e => {
  const t = e.target, sp = cs.spec;
  if (t.dataset.key) {
    const k = t.dataset.key, v = +t.value;
    if (k === 'y0') sp.y = [v]; else sp[k] = v < 0 ? null : v;
  } else if (t.dataset.y != null) {
    const i = +t.dataset.y;
    sp.y = (sp.y || []).filter(x => x !== i).concat(t.checked ? [i] : []);
    if (sp.y.length > 6) sp.y = sp.y.slice(0, 6);
    chartDraw(); return;
  } else if (t.dataset.flag) {
    const f = t.dataset.flag;
    if (f === 'sortStart') sp.sort = t.checked ? 'start' : 'sheet';
    else if (f === 'largest') sp.sort = t.checked ? 'value' : 'sheet';
    else sp[f] = t.checked;
  }
  chartRender();
});

// ---- drawing ----
function chartResult(responsive) {
  return Charts.render(cs.table, cs.spec, Charts.paletteFromTemplate(activeTpl()), { responsive });
}
function chartRender() {
  if (!cs.table) {
    if (!$('cPreview').querySelector('.err')) $('cPreview').innerHTML = '<div class="empty"><b>Turn a spreadsheet into a chart</b>Drop an .xlsx or .csv on this window, then pick the columns.<br>Colors come from the active template.</div>';
    $('stat').textContent = 'Chart mode'; $('warn').textContent = '';
    return;
  }
  try {
    const r = chartResult(true);
    $('cPreview').innerHTML = r.svg;
    $('warn').textContent = r.warnings.join('; ');
  } catch (e) {
    $('cPreview').innerHTML = '<div class="err">' + escHtml(e.message) + '</div>';
    $('warn').textContent = '';
  }
  $('stat').textContent = 'Chart - ' + cs.name + ' - ' + cs.table.length + ' rows';
}

// ---- file input and drag and drop ----
const takeFile = f => { if (f) f.arrayBuffer().then(b => chartLoad(new Uint8Array(b), f.name)); };
$('cPick').onclick = () => $('cFileInput').click();
$('cOpen').onclick = () => $('cFileInput').click();
$('cFileInput').onchange = e => { takeFile(e.target.files[0]); e.target.value = ''; };
const app = $('chartApp');
['dragenter', 'dragover'].forEach(ev => app.addEventListener(ev, e => { e.preventDefault(); app.classList.add('dragging'); }));
['dragleave', 'drop'].forEach(ev => app.addEventListener(ev, e => { e.preventDefault(); app.classList.remove('dragging'); }));
app.addEventListener('drop', e => takeFile(e.dataTransfer.files[0]));

// ---- export ----
const chartSlug = () => ((cs.spec && cs.spec.title) || cs.name || 'chart').toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chart';
function downloadBlob(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function chartPng(scale) {
  return new Promise((res, rej) => {
    const r = chartResult(false), img = new Image();
    const url = URL.createObjectURL(new Blob([r.svg], { type: 'image/svg+xml' }));
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = r.width * scale; c.height = r.height * scale;
      const x = c.getContext('2d'); x.scale(scale, scale); x.drawImage(img, 0, 0, r.width, r.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => (b ? res(b) : rej(new Error('Could not make the PNG.'))), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not draw the chart as an image.')); };
    img.src = url;
  });
}
const needChart = () => { if (!cs.table) { $('warn').textContent = 'Open a spreadsheet first.'; return false; } return true; };
const guard = fn => async () => { if (!needChart()) return; try { await fn(); } catch (e) { $('warn').textContent = e.message; } };

$('cSvg').onclick = guard(() => downloadBlob(chartSlug() + '.svg', new Blob([chartResult(false).svg], { type: 'image/svg+xml' })));
$('cPng').onclick = guard(async () => downloadBlob(chartSlug() + '.png', await chartPng(2)));
$('cCopy').onclick = guard(async () => {
  if (!window.ClipboardItem || !navigator.clipboard) throw new Error('Copying images is not available here; use Save PNG.');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': chartPng(2) })]);
  $('warn').textContent = 'Chart copied. Paste it into a document or slide.';
});
$('cPdf').onclick = guard(async () => {
  const r = chartResult(true), wide = r.width >= r.height;
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + escHtml(chartSlug()) + '</title><style>@page{size:Letter ' + (wide ? 'landscape' : 'portrait') + ';margin:.5in}body{margin:0}svg{width:100%;height:auto;display:block}</style></head><body>' + r.svg + '</body></html>';
  if (window.reportkitNative) { window.reportkitNative.exportPdf(html, chartSlug()); return; }
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;width:0;height:0;border:0';
  f.srcdoc = html;
  f.onload = () => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); };
  document.body.appendChild(f);
});
$('cAdd').onclick = guard(() => {
  setMode('report');
  block(Charts.toBlock(cs.table, cs.spec));
});

try { if (localStorage.getItem(MODE_KEY) === 'chart') document.body.dataset.mode = 'chart'; } catch (e) {}
$('modeChart').classList.toggle('on', document.body.dataset.mode === 'chart');
$('modeReport').classList.toggle('on', document.body.dataset.mode !== 'chart');
