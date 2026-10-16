const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('reportkitNative', {
  exportPdf: (html, name) => ipcRenderer.invoke('export-pdf', html, name),
});
