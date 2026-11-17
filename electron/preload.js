const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('reportkitNative', {
  exportPdf: (html, name) => ipcRenderer.invoke('export-pdf', html, name),
  loadToken: () => ipcRenderer.invoke('token-load'),
  saveToken: t => ipcRenderer.invoke('token-save', t),
  clearToken: () => ipcRenderer.invoke('token-clear'),
});
