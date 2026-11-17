// Publish dialog for the Studio: sends the exported report to GitHub Pages with the user's own token.
// Runs after render(), exportHtml() and slug() are defined.
const Pub = ReportKitPublish;
const PUB_KEY = 'reportstudio.publish';
const native = window.reportkitNative && window.reportkitNative.loadToken ? window.reportkitNative : null;
let pubDownArmed = 0;

function pubPrefs() { try { return JSON.parse(localStorage.getItem(PUB_KEY)) || {}; } catch (e) { return {}; } }
function pubSavePrefs(p) { try { localStorage.setItem(PUB_KEY, JSON.stringify(p)); } catch (e) {} }

function pubMsg(html, kind) {
  const m = $('pubMsg'); m.className = 'pubmsg' + (kind ? ' ' + kind : ''); m.innerHTML = html;
}
function pubFields() {
  return { token: $('pubToken').value.trim(), repo: $('pubRepo').value.trim(), path: $('pubPath').value.trim().replace(/^\/+/, '') };
}
function pubRefresh() {
  const f = pubFields();
  const okRepo = Pub.validRepo(f.repo), okPath = Pub.validPath(f.path);
  $('pubGo').disabled = !(f.token && okRepo && okPath && $('pubOk').checked);
  $('pubAddr').textContent = okRepo && okPath ? 'Address: ' + Pub.pageUrl('your-username', f.repo, f.path) : (f.repo && !okRepo ? 'Repository names use letters, numbers, dots, dashes and underscores.' : (f.path && !okPath ? 'The page file name must end in .html.' : ''));
  $('pubDown').disabled = !(f.token && okRepo && okPath);
}

async function pubOpen() {
  const prefs = pubPrefs();
  $('pubRepo').value = prefs.repo || 'my-reports';
  $('pubPath').value = prefs.path || (prefs.repo ? Pub.slugify(slug()) + '.html' : 'index.html');
  $('pubOk').checked = false; $('pubReplace').checked = false; $('pubReplaceRow').hidden = true;
  $('pubRememberRow').hidden = !native;
  pubMsg('');
  const found = Pub.scan(exportHtml());
  const sc = $('pubScan');
  sc.hidden = !found.length;
  sc.textContent = found.length ? 'This report contains ' + found.map(x => x.label).join(', ') + '. Make sure none of it is private before publishing.' : '';
  $('pubToken').value = '';
  if (native) {
    try {
      const t = await native.loadToken();
      if (t) { $('pubToken').value = t; $('pubRemember').checked = true; }
    } catch (e) {}
  }
  $('pubOv').hidden = false;
  pubRefresh();
  (($('pubToken').value) ? $('pubOk') : $('pubToken')).focus();
}
function pubClose() {
  if ($('pubOv').hidden) return;
  $('pubOv').hidden = true; $('pubToken').value = '';
  clearTimeout(pubDownArmed); pubDownArmed = 0; $('pubDown').textContent = 'Take this page down';
  $('publish').focus();
}

async function pubRememberToken(token) {
  if (!native) return '';
  try {
    if (!$('pubRemember').checked) { await native.clearToken(); return ''; }
    return (await native.saveToken(token)) ? '' : ' The token could not be stored securely on this computer, so it was not saved.';
  } catch (e) { return ''; }
}

async function pubGo() {
  const f = pubFields();
  $('pubGo').disabled = true; pubMsg('Publishing...');
  try {
    const r = await Pub.publish({ token: f.token, repo: f.repo, path: f.path, html: exportHtml(), replace: $('pubReplace').checked, description: 'Pages published with ReportKit' });
    pubSavePrefs({ repo: f.repo, path: f.path });
    const note = await pubRememberToken(f.token);
    $('pubReplaceRow').hidden = true; $('pubReplace').checked = false;
    pubMsg('<b>' + (r.replaced ? 'Updated.' : 'Published.') + '</b> Your page is at <a href="' + escHtml(r.url) + '" target="_blank" rel="noopener">' + escHtml(r.url) + '</a>. GitHub can take a minute to show a new or changed page.' + (r.createdRepo ? ' A public repository named <b>' + escHtml(r.repo) + '</b> was created in your account for it.' : '') + escHtml(note), 'ok');
  } catch (e) {
    if (e.code === 'exists') $('pubReplaceRow').hidden = false;
    pubMsg(escHtml(e.message || String(e)), 'err');
  }
  pubRefresh();
}

async function pubTakeDown() {
  const b = $('pubDown');
  if (!pubDownArmed) { pubDownArmed = setTimeout(() => { pubDownArmed = 0; b.textContent = 'Take this page down'; }, 4000); b.textContent = 'Click again to delete the page'; return; }
  clearTimeout(pubDownArmed); pubDownArmed = 0; b.textContent = 'Take this page down';
  const f = pubFields();
  pubMsg('Removing...');
  try {
    await Pub.unpublish({ token: f.token, repo: f.repo, path: f.path });
    pubMsg('<b>Removed.</b> ' + escHtml(f.path) + ' was deleted from ' + escHtml(f.repo) + '. The repository itself is still in your account. GitHub can take a minute to stop serving the page.', 'ok');
  } catch (e) { pubMsg(escHtml(e.message || String(e)), 'err'); }
}

$('publish').onclick = pubOpen;
$('pubClose').onclick = pubClose;
$('pubGo').onclick = pubGo;
$('pubDown').onclick = pubTakeDown;
['pubToken', 'pubRepo', 'pubPath', 'pubOk'].forEach(id => $(id).addEventListener('input', pubRefresh));
$('pubOk').addEventListener('change', pubRefresh);
$('pubOv').addEventListener('click', e => { if (e.target === $('pubOv')) pubClose(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') pubClose(); });
