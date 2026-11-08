// QuadFC GCS desktop shell — wraps the static export of the web ground station
// (the same app as the preview: tabs, simulator, log replay) in Electron and
// enables Web Serial so the real board connection works inside the EXE.
'use strict';

const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const { startStaticServer } = require('./server');

async function createWindow() {
  const root = path.join(__dirname, '..', 'out');
  const { port } = await startStaticServer(root); // http://127.0.0.1 → secure context → Web Serial OK

  const ses = session.defaultSession;
  ses.setPermissionCheckHandler((_wc, permission) =>
    permission === 'serial' || permission === 'clipboard-sanitized-write');
  ses.setDevicePermissionHandler(() => true);
  ses.on('select-serial-port', (event, portList, _webContents, callback) => {
    event.preventDefault();
    if (portList && portList.length > 0) callback(portList[0].portId);
    else callback(''); // deny: no port present
  });
  ses.on('serial-port-added', (_e, p) => { try { p?.attach?.(); } catch { /* noop */ } });

  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 640,
    title: 'QuadFC GCS — Logger v7 Compatible',
    autoHideMenuBar: true,
    backgroundColor: '#09090b',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.removeMenu();
  await win.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
