// QuadFC GCS desktop shell — wraps the static export of the web ground station
// (the same app as the preview: tabs, simulator, log replay) in Electron and
// enables Web Serial so the real board connection works inside the EXE.
//
// v2.1.0 serial handling (mirrors the Electron Web Serial docs pattern):
//  - 'select-serial-port' no longer auto-picks portList[0]: the full list is
//    forwarded to the in-app chooser and the user picks a port BY NAME (COM…).
//  - an empty list (adapter enumerated late) no longer cancels the request:
//    ChooserHub keeps it pending and reacts to 'serial-port-added' /
//    'serial-port-removed', so a freshly plugged COM port shows up live.
'use strict';

const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const { startStaticServer } = require('./server');
const { ChooserHub } = require('./chooser-core');

let win = null;

async function createWindow() {
  const root = path.join(__dirname, '..', 'out');
  const { port } = await startStaticServer(root); // http://127.0.0.1 → secure context → Web Serial OK

  const ses = session.defaultSession;
  ses.setPermissionCheckHandler((_wc, permission) =>
    permission === 'serial' || permission === 'clipboard-sanitized-write');
  ses.setDevicePermissionHandler(() => true);

  // Chooser hub → renderer via 'qfc:chooser'; renderer resolves via 'qfc:pick'.
  const hub = new ChooserHub({
    send: (msg, wc) => {
      const target = (wc && !wc.isDestroyed() && wc.send)
        ? wc
        : (win && !win.isDestroyed() ? win.webContents : null);
      if (target) target.send('qfc:chooser', msg);
    },
  });

  ses.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    hub.begin(portList, webContents, callback); // user picks by COM name — never auto-first
  });
  ses.on('serial-port-added', (_e, p) => hub.portAdded(p));   // late/new COM ports
  ses.on('serial-port-removed', (_e, p) => hub.portRemoved(p)); // unplugged while choosing

  ipcMain.on('qfc:pick', (_e, payload) => {
    const { requestId, decision } = payload || {};
    hub.resolve(requestId, decision);
  });

  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 640,
    title: 'QuadFC GCS — Logger v7 Compatible',
    autoHideMenuBar: true,
    backgroundColor: '#09090b',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  win.removeMenu();
  win.on('closed', () => { win = null; });
  await win.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
