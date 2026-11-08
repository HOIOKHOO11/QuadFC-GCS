'use strict';

// ChooserHub — pure port-chooser hub for the Electron shell.
// No Electron imports, so it can be unit-tested with plain node/bun.
//
// Fixes the two v2.0.0 bugs in the shell's serial handling:
//   1) v2.0.0 auto-picked portList[0] inside 'select-serial-port' — the user
//      could never choose the real COM port. Now the hub forwards the FULL
//      list to the in-app chooser and the user picks a port BY NAME (COM…).
//   2) v2.0.0 called callback('') when the list was empty — if the adapter
//      enumerated a bit late the request was cancelled instantly. Now the hub
//      keeps the request pending and listens to 'serial-port-added' /
//      'serial-port-removed', so a freshly plugged adapter appears LIVE in the
//      chooser until the deadline.
//
// Wiring (see electron/main.js), matching the Electron Web Serial docs:
//   session.on('select-serial-port', (e, portList, wc, cb) => hub.begin(portList, wc, cb))
//   session.on('serial-port-added',   (e, port)     => hub.portAdded(port))
//   session.on('serial-port-removed', (e, port)     => hub.portRemoved(port))
//   ipcMain.on('qfc:pick', (e, {requestId, decision}) => hub.resolve(requestId, decision))

const WAIT_MS = 30000; // overall deadline for one chooser request

class ChooserHub {
  /**
   * @param {object} opts
   * @param {(msg: object, wc: unknown) => void} opts.send  push a chooser message to the renderer
   * @param {number}   [opts.waitMs]  deadline per request (default 30s)
   * @param {() => number} [opts.now] injectable clock for tests
   */
  constructor({ send, waitMs = WAIT_MS, now = () => Date.now(), graceMs = 2500 } = {}) {
    this.send = typeof send === 'function' ? send : () => {};
    this.waitMs = waitMs;
    this.graceMs = graceMs;
    this.now = now;
    this.seq = 0;
    this.req = null; // { id, cb, wc, ports:Map<id,port>, timer }
  }

  /** session 'select-serial-port' → hub.begin(portList, webContents, callback) */
  begin(portList, webContents, callback) {
    if (typeof callback !== 'function') return 0;
    // supersede any older pending request (e.g. double requestPort) — deny it quietly
    if (this.req) this.close(this.req, 'superseded');

    const ports = new Map();
    for (const p of Array.isArray(portList) ? portList : []) {
      if (p && p.portId) ports.set(p.portId, p);
    }
    const req = {
      id: ++this.seq,
      cb: callback,
      wc: webContents || null,
      ports,
      timer: setTimeout(() => this.deadline(), this.waitMs),
    };
    if (req.timer.unref) req.timer.unref();
    this.req = req;

    this.emit(req, {
      type: 'open',
      requestId: req.id,
      ports: this.view(req),
      waitingNew: ports.size === 0,
      remainingMs: this.waitMs,
    });
    return req.id;
  }

  /** session 'serial-port-added' — a fresh COM port appeared (maybe late) */
  portAdded(port) {
    const req = this.req;
    if (!req || !port || !port.portId) return;
    req.ports.set(port.portId, port);
    this.emit(req, {
      type: 'update',
      requestId: req.id,
      ports: this.view(req),
      added: nameOf(port),
      waitingNew: false,
    });
  }

  /** session 'serial-port-removed' — adapter yanked while choosing */
  portRemoved(port) {
    const req = this.req;
    if (!req || !port || !port.portId || !req.ports.has(port.portId)) return;
    req.ports.delete(port.portId);
    this.emit(req, {
      type: 'update',
      requestId: req.id,
      ports: this.view(req),
      removed: nameOf(port),
      waitingNew: req.ports.size === 0,
    });
  }

  /**
   * renderer resolved the chooser (ipc 'qfc:pick').
   * decision: portId string → pick · null → cancel · 'refresh' → re-enumerate
   */
  resolve(requestId, decision) {
    const req = this.req;
    if (!req || req.id !== requestId) return; // stale click for an old request
    if (decision === 'refresh') {
      this.req = null;
      clearTimeout(req.timer);
      // keep the modal open in the renderer: it re-calls requestPort() and a
      // fresh 'select-serial-port' (fresh enumeration) replaces the list
      this.emit(req, { type: 'refreshing', requestId: req.id });
      req.cb('');
      return;
    }
    if (decision === null || decision === undefined || decision === '') {
      this.close(req, 'cancel');
      return;
    }
    const port = req.ports.get(decision);
    if (!port) {
      // e.g. chosen id was just removed — keep the chooser open, tell the user
      this.emit(req, { type: 'note', requestId: req.id, text: 'این پورت دیگر در دسترس نیست — یکی دیگر را انتخاب کن' });
      return;
    }
    this.req = null;
    clearTimeout(req.timer);
    this.emit(req, { type: 'close', requestId: req.id, reason: 'picked', picked: toView(port) });
    req.cb(decision);
  }

  deadline() {
    const req = this.req;
    if (!req) return;
    this.emit(req, { type: 'timeout', requestId: req.id });
    // short grace: the user may still pick (deadlines are aggressive); then
    // force-deny so the renderer's requestPort never hangs forever
    clearTimeout(req.timer);
    req.timer = setTimeout(() => this.close(req, 'timeout'), this.graceMs);
    if (req.timer.unref) req.timer.unref();
  }

  close(req, reason) {
    if (this.req === req) this.req = null;
    clearTimeout(req.timer);
    this.emit(req, { type: 'close', requestId: req.id, reason });
    try { req.cb(''); } catch { /* callback once */ }
  }

  emit(req, msg) {
    try { this.send(msg, req.wc); } catch { /* renderer may be gone */ }
  }

  view(req) {
    return Array.from(req.ports.values()).map(toView).sort(sortByCom);
  }
}

function nameOf(p) {
  return (p && p.portName) || (p && p.displayName) || '';
}

function toView(p) {
  return {
    id: p.portId,
    comName: p.portName || '',
    displayName: p.displayName || '',
    vid: p.vendorId || '',
    pid: p.productId || '',
    serial: p.serialNumber || '',
  };
}

function sortByCom(a, b) {
  const na = a.comName || '';
  const nb = b.comName || '';
  return na.localeCompare(nb, undefined, { numeric: true });
}

/** Human label for a chooser port: "COM5" + friendly USB info when available */
function labelOf(v) {
  const usbBits = [];
  if (v.displayName) usbBits.push(v.displayName);
  if (v.vid && v.pid) usbBits.push(`VID:${v.vid} PID:${v.pid}`);
  const suffix = usbBits.length ? ` — ${usbBits.join(' · ')}` : '';
  return `${v.comName || '?'}${suffix}`;
}

module.exports = { ChooserHub, WAIT_MS, labelOf, toView, sortByCom };
