// Template import, export and editing for the Studio. Runs after render() and the helpers it uses are defined.
const TPL_KEY = 'reportstudio.templates', TPL_ACTIVE = 'reportstudio.activeTemplate';
const BUILTIN = '__default';
const COLOR_FIELDS = [
  ['primary', 'Primary (blue)'], ['primary2', 'Primary, lighter'], ['accent', 'Accent (gold)'], ['accentDeep', 'Accent, dark'],
  ['ink', 'Text'], ['muted', 'Muted text'], ['success', 'Success (green)'], ['sage', 'Sage'],
  ['warning', 'Warning (amber)'], ['danger', 'Danger (red)'], ['info', 'Info and links'], ['grey', 'Grey'],
];
const norm = ReportKit.normalizeTemplate;
let tplList = [], tpl = norm(null), draft = null;
const clone = o => JSON.parse(JSON.stringify(o));

function loadTemplates() {
  try { tplList = (JSON.parse(localStorage.getItem(TPL_KEY) || '[]') || []).map(norm); } catch (e) { tplList = []; }
  let active = '';
  try { active = localStorage.getItem(TPL_ACTIVE) || ''; } catch (e) {}
  tpl = tplList.find(t => t.name === active) || norm(null);
}
function saveTemplates() {
  try { localStorage.setItem(TPL_KEY, JSON.stringify(tplList)); localStorage.setItem(TPL_ACTIVE, isBuiltin(tpl) ? '' : tpl.name); }
  catch (e) { $('warn').textContent = 'Template is too large to remember here; export it as a file to keep it.'; }
}
const isBuiltin = t => !tplList.some(x => x.name === t.name);
function activeTpl() { return draft || tpl; }

function fillSelect() {
  const sel = $('tplSel');
  sel.innerHTML = '';
  const add = (v, label) => { const o = document.createElement('option'); o.value = v; o.textContent = label; sel.appendChild(o); };
  add(BUILTIN, 'Default (built-in)');
  tplList.forEach(t => add(t.name, t.name));
  sel.value = isBuiltin(tpl) ? BUILTIN : tpl.name;
}
$('tplSel').onchange = e => {
  tpl = e.target.value === BUILTIN ? norm(null) : tplList.find(t => t.name === e.target.value) || norm(null);
  saveTemplates(); render();
};

const fileName = t => t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'template';
$('tplExport').onclick = () => download(fileName(tpl) + '.rktemplate.json', JSON.stringify(tpl, null, 2), 'application/json');
$('tplImport').onclick = () => $('tplFile').click();
$('tplFile').onchange = e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  f.text().then(text => {
    let raw;
    try { raw = JSON.parse(text); } catch (err) { $('warn').textContent = 'That file is not valid JSON.'; return; }
    if (!raw || raw.format !== 'reportkit-template') { $('warn').textContent = 'That file is not a ReportKit template.'; return; }
    const t = norm(raw);
    if (t.name === 'Default') t.name = 'Default (imported)';
    tplList = tplList.filter(x => x.name !== t.name).concat(t);
    tpl = t; saveTemplates(); fillSelect(); render();
  });
};

// ---- editor ----
function readAsDataUrl(file) { return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); }); }
const slugName = n => n.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';

function drawEditor() {
  $('tplName').value = draft.name;
  $('tplFont').value = draft.font;
  const box = $('tplColors'); box.innerHTML = '';
  COLOR_FIELDS.forEach(([k, label]) => {
    const l = document.createElement('label');
    l.innerHTML = '<input type="color"> ' + label + ' <code></code>';
    const inp = l.querySelector('input'), code = l.querySelector('code');
    const full = v => v.length === 4 ? '#' + v.slice(1).split('').map(c => c + c).join('') : v;
    inp.value = full(draft.colors[k]); code.textContent = draft.colors[k];
    inp.oninput = () => { draft.colors[k] = inp.value; code.textContent = inp.value; render(); };
    box.appendChild(l);
  });
  const lp = $('tplLogoPreview');
  lp.style.color = draft.logo ? draft.logo.color : '#fff';
  lp.innerHTML = !draft.logo ? '<span style="color:#9fb3c8;font-size:12px">No logo</span>' : draft.logo.svg || ('<img alt="" src="' + draft.logo.src + '">');
  $('tplLogoH').value = draft.logo ? draft.logo.height : 26;
  $('tplLogoColor').value = draft.logo ? draft.logo.color : '#ffffff';
  const list = $('tplAssets'); list.innerHTML = '';
  const names = Object.keys(draft.assets);
  if (!names.length) list.innerHTML = '<p class="hint">No images yet.</p>';
  names.forEach(n => {
    const d = document.createElement('div'); d.className = 'asset';
    d.innerHTML = '<img alt="" src="' + draft.assets[n] + '"><span></span><code></code><button class="ghost">Remove</button>';
    d.querySelector('span').textContent = n; d.querySelector('code').textContent = 'asset:' + n;
    d.querySelector('button').onclick = () => { delete draft.assets[n]; drawEditor(); render(); };
    list.appendChild(d);
  });
}
function openEditor() {
  draft = clone(tpl);
  if (isBuiltin(tpl)) draft.name = 'My template';
  $('tplEditor').hidden = false; drawEditor(); render();
}
function closeEditor() { draft = null; $('tplEditor').hidden = true; render(); }
$('tplEdit').onclick = openEditor;
$('tplCancel').onclick = closeEditor;
$('tplName').oninput = e => { draft.name = e.target.value; };
$('tplFont').oninput = e => { draft.font = e.target.value; render(); };
$('tplReset').onclick = () => { const n = draft.name; draft = norm(null); draft.name = n === 'Default' ? 'My template' : n; drawEditor(); render(); };
$('tplLogoPick').onclick = () => $('tplLogoFile').click();
$('tplLogoClear').onclick = () => { draft.logo = null; drawEditor(); render(); };
$('tplLogoH').oninput = e => { if (draft.logo) { draft.logo.height = +e.target.value || 26; render(); } };
$('tplLogoColor').oninput = e => { if (draft.logo) { draft.logo.color = e.target.value; drawEditor(); render(); } };
$('tplLogoFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  const keep = draft.logo || { height: 26, color: '#ffffff' };
  if (/svg/.test(f.type) || /\.svg$/i.test(f.name)) draft.logo = { svg: await f.text(), height: keep.height, color: keep.color };
  else draft.logo = { src: await readAsDataUrl(f), height: keep.height, color: keep.color };
  draft = norm(draft); drawEditor(); render();
};
$('tplAssetAdd').onclick = () => $('tplAssetFile').click();
$('tplAssetFile').onchange = async e => {
  const files = [...e.target.files]; e.target.value = '';
  for (const f of files) {
    let name = slugName(f.name), n = 2;
    while (draft.assets[name]) name = slugName(f.name) + '-' + n++;
    draft.assets[name] = await readAsDataUrl(f);
  }
  draft = norm(draft); drawEditor(); render();
};
$('tplExportDraft').onclick = () => { const t = norm(draft); download(fileName(t) + '.rktemplate.json', JSON.stringify(t, null, 2), 'application/json'); };
$('tplSave').onclick = () => {
  const t = norm(draft);
  if (t.name === 'Default') t.name = 'My template';
  tplList = tplList.filter(x => x.name !== t.name).concat(t);
  tpl = t; draft = null; $('tplEditor').hidden = true;
  saveTemplates(); fillSelect(); render();
};
loadTemplates(); fillSelect();
