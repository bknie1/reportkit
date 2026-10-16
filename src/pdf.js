// HTML file to PDF through an installed Chrome, Edge or Chromium, in headless mode.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function findBrowser() {
  const pf = process.env['ProgramFiles'] || 'C:/Program Files', pf86 = process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)';
  const local = process.env['LOCALAPPDATA'] || '';
  const candidates = [
    process.env.REPORTKIT_BROWSER,
    pf + '/Google/Chrome/Application/chrome.exe', pf86 + '/Google/Chrome/Application/chrome.exe', local + '/Google/Chrome/Application/chrome.exe',
    pf86 + '/Microsoft/Edge/Application/msedge.exe', pf + '/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
  ];
  return candidates.find(c => c && fs.existsSync(c)) || null;
}

function htmlToPdf(htmlPath, pdfPath) {
  const browser = findBrowser();
  if (!browser) throw new Error('No Chrome, Edge or Chromium found. Set REPORTKIT_BROWSER to its path, or use the Studio to print.');
  const url = 'file:///' + path.resolve(htmlPath).replace(/\\/g, '/');
  const out = path.resolve(pdfPath);
  const run = flag => spawnSync(browser, ['--headless=new', '--disable-gpu', flag, '--print-to-pdf=' + out, url], { stdio: 'ignore' });
  run('--no-pdf-header-footer');
  if (!fs.existsSync(out)) run('--print-to-pdf-no-header');
  if (!fs.existsSync(out)) throw new Error('The browser did not produce a PDF.');
  return out;
}

module.exports = { findBrowser, htmlToPdf };
