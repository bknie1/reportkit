// ReportKit desktop shell: opens the Studio in a window and exports PDFs without needing a browser installed.
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1500, height: 920, minWidth: 900, minHeight: 600, backgroundColor: '#f4f6f9', title: 'ReportKit Studio',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'studio.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Renders report HTML to PDF bytes in a hidden window.
async function renderPdf(html) {
  const tmp = path.join(app.getPath('temp'), 'reportkit-' + Date.now() + '.html');
  fs.writeFileSync(tmp, String(html), 'utf8');
  const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await pdfWin.loadFile(tmp);
    await new Promise(r => setTimeout(r, 900)); // time for diagrams to draw
    return await pdfWin.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
  } finally {
    pdfWin.destroy();
    fs.unlink(tmp, () => {});
  }
}

ipcMain.handle('export-pdf', async (event, html, name) => {
  const parent = BrowserWindow.fromWebContents(event.sender);
  const safe = String(name || 'report').replace(/[^\w.-]+/g, '-').slice(0, 80) || 'report';
  const { canceled, filePath } = await dialog.showSaveDialog(parent, { defaultPath: safe + '.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (canceled || !filePath) return { ok: false, canceled: true };
  try {
    fs.writeFileSync(filePath, await renderPdf(html));
    shell.showItemInFolder(filePath);
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

app.whenReady().then(async () => {
  // Smoke test: REPORTKIT_SELFTEST=<out.pdf> renders a one-line report to PDF and exits.
  if (process.env.REPORTKIT_SELFTEST) {
    const html = '<!doctype html><style>@page{size:Letter;margin:.5in}body{font-family:sans-serif}</style><h1 style="color:#1e3a5f">ReportKit self-test</h1>';
    fs.writeFileSync(process.env.REPORTKIT_SELFTEST, await renderPdf(html));
    return app.quit();
  }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
