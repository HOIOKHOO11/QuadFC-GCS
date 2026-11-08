'use strict';

// Minimal sandbox-safe bridge between the web app (renderer) and the
// main-process serial chooser hub. Only this exact surface is exposed.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('qfcSerial', {
  isShell: true,
  // subscribe to chooser updates: {type, requestId, ports, ...}
  onChooser: (cb) => {
    const h = (_e, msg) => { try { cb(msg); } catch { /* noop */ } };
    ipcRenderer.on('qfc:chooser', h);
    return () => ipcRenderer.removeListener('qfc:chooser', h);
  },
  // resolve a pending chooser: portId string | null (cancel) | 'refresh'
  pick: (requestId, decision) => ipcRenderer.send('qfc:pick', { requestId, decision }),
});
