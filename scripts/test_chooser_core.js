// Unit tests for electron/chooser-core.js — run: bun scripts/test_chooser_core.js
// Regressions for the v2.1.0 port-selection fix:
//   1) never auto-pick the first port — the full list goes to the renderer
//   2) empty list must NOT deny immediately — wait for serial-port-added
//   3) user picks by COM name (portId resolution), refresh, cancel, timeout

'use strict';

const assert = require('assert');
// works both from the workspace (electron/ beside scripts/) and from the repo
// checkout (webapp/electron/)
function loadCore() {
  try { return require('../electron/chooser-core'); }
  catch { return require('../webapp/electron/chooser-core'); }
}
const { ChooserHub, labelOf, sortByCom } = loadCore();

let passed = 0, failed = 0;
const asyncTests = [];

function t(name, fn) {
  const run = () => {
    try {
      const r = fn();
      if (r && typeof r.then === 'function') {
        asyncTests.push(
          r.then(() => { passed++; console.log(`  ok  ${name}`); })
            .catch(e => { failed++; console.error(`FAIL  ${name}\n      ${e.message}`); })
        );
      } else {
        passed++; console.log(`  ok  ${name}`);
      }
    } catch (e) {
      failed++; console.error(`FAIL  ${name}\n      ${e.message}`);
    }
  };
  run();
}

function mkPort(id, portName, extra = {}) {
  return { portId: id, portName, vendorId: '1A86', productId: '7523', displayName: 'USB-SERIAL CH340', ...extra };
}

function mkHub(opts = {}) {
  const msgs = [];
  const hub = new ChooserHub({ send: m => msgs.push(m), ...opts });
  return { hub, msgs };
}

console.log('chooser-core tests');

t('non-empty list → renderer gets ALL ports (no auto-pick), request stays pending', () => {
  const { hub, msgs } = mkHub();
  const rid = hub.begin([mkPort('id1', 'COM3'), mkPort('id2', 'COM10')], null, () => {});
  assert.ok(rid > 0);
  const open = msgs.find(m => m.type === 'open');
  assert.ok(open, 'open msg sent');
  assert.strictEqual(open.ports.length, 2, 'both ports forwarded');
  assert.deepStrictEqual(open.ports.map(p => p.comName), ['COM3', 'COM10'], 'sorted by COM name');
  assert.strictEqual(hub.req !== null, true, 'request still pending (user must choose)');
});

t('picking by COM name resolves the right portId + close(picked)', () => {
  const { hub, msgs } = mkHub();
  let resolved = '';
  hub.begin([mkPort('id1', 'COM3'), mkPort('id2', 'COM10')], null, cb => { resolved = cb; });
  const open = msgs.find(m => m.type === 'open');
  const want = open.ports.find(p => p.comName === 'COM10');
  hub.resolve(open.requestId, want.id);
  assert.strictEqual(resolved, 'id2', 'callback got the picked portId');
  const close = msgs.find(m => m.type === 'close');
  assert.ok(close && close.reason === 'picked' && close.picked.comName === 'COM10');
  assert.strictEqual(hub.req, null);
});

t('empty list → pending + waitingNew (NOT an immediate deny)', () => {
  const { hub, msgs } = mkHub({ waitMs: 50 });
  let resolved = 'unset';
  hub.begin([], null, cb => { resolved = cb; });
  const open = msgs.find(m => m.type === 'open');
  assert.ok(open, 'open sent even with empty list');
  assert.strictEqual(open.waitingNew, true, 'renderer told to wait for a new port');
  assert.strictEqual(hub.req !== null, true, 'request stays pending');
  assert.strictEqual(resolved, 'unset', 'callback NOT denied immediately');
  hub.resolve(open.requestId, null); // cleanup
});

t('late adapter: port-added while pending → live update + pick works', () => {
  const { hub, msgs } = mkHub({ waitMs: 5000 });
  let resolved = '';
  hub.begin([], null, cb => { resolved = cb; });
  hub.portAdded(mkPort('late', 'COM7'));
  const upd = msgs.find(m => m.type === 'update');
  assert.ok(upd, 'update pushed');
  assert.strictEqual(upd.added, 'COM7');
  assert.strictEqual(upd.waitingNew, false);
  hub.resolve(upd.requestId, 'late');
  assert.strictEqual(resolved, 'late');
});

t('two ports plugged late → both in the refreshed list', () => {
  const { hub, msgs } = mkHub({ waitMs: 5000 });
  hub.begin([], null, () => {});
  hub.portAdded(mkPort('a', 'COM4'));
  hub.portAdded(mkPort('b', 'COM5'));
  const upd = msgs.filter(m => m.type === 'update').pop();
  assert.strictEqual(upd.ports.length, 2);
  assert.deepStrictEqual(upd.ports.map(p => p.comName), ['COM4', 'COM5']);
});

t('unplug while choosing → port removed from the live list', () => {
  const { hub, msgs } = mkHub({ waitMs: 5000 });
  hub.begin([mkPort('id1', 'COM3'), mkPort('id2', 'COM4')], null, () => {});
  hub.portRemoved(mkPort('id1', 'COM3'));
  const upd = msgs.filter(m => m.type === 'update').pop();
  assert.strictEqual(upd.removed, 'COM3');
  assert.strictEqual(upd.ports.length, 1);
  assert.strictEqual(upd.ports[0].comName, 'COM4');
});

t('deadline fires → timeout msg then close(timeout) + cb("")', () => {
  const { hub, msgs } = mkHub({ waitMs: 20, graceMs: 10 });
  let resolved = 'unset';
  hub.begin([], null, cb => { resolved = cb; });
  const start = Date.now();
  return new Promise(res => {
    const iv = setInterval(() => {
      if (resolved !== 'unset' || Date.now() - start > 2000) {
        clearInterval(iv);
        assert.strictEqual(resolved, '', 'denied after deadline');
        assert.ok(msgs.some(m => m.type === 'timeout'), 'timeout msg sent');
        const close = msgs.find(m => m.type === 'close');
        assert.ok(close && close.reason === 'timeout');
        res();
      }
    }, 5);
  });
});

t('grace period: user can still pick after the timeout message', () => {
  const { hub, msgs } = mkHub({ waitMs: 20, graceMs: 200 });
  let resolved = 'unset';
  hub.begin([mkPort('id1', 'COM9')], null, cb => { resolved = cb; });
  return new Promise(res => {
    setTimeout(() => {
      assert.strictEqual(resolved, 'unset', 'still in grace');
      const open = msgs.find(m => m.type === 'open');
      hub.resolve(open.requestId, 'id1'); // pick during grace
      assert.strictEqual(resolved, 'id1', 'grace pick wins');
      res();
    }, 40);
  });
});

t('refresh decision → cb(""), refreshing msg, hub free for the next request', () => {
  const { hub, msgs } = mkHub({ waitMs: 5000 });
  let resolved = 'unset';
  const rid = hub.begin([mkPort('id1', 'COM3')], null, cb => { resolved = cb; });
  hub.resolve(rid, 'refresh');
  assert.strictEqual(resolved, '', 'denied so the renderer re-enumerates');
  assert.ok(msgs.some(m => m.type === 'refreshing'));
  assert.strictEqual(hub.req, null, 'hub accepts the follow-up request');
});

t('stale resolve (old requestId) is ignored', () => {
  const { hub } = mkHub({ waitMs: 5000 });
  let resolved = 'unset';
  const r1 = hub.begin([mkPort('id1', 'COM3')], null, cb => { resolved = cb; });
  hub.resolve(r1, null);          // cancel first request
  let resolved2 = 'unset';
  const r2 = hub.begin([mkPort('id2', 'COM4')], null, cb => { resolved2 = cb; });
  hub.resolve(r1, 'id2');         // stale click from the closed request
  assert.strictEqual(resolved2, 'unset', 'second request unaffected');
  hub.resolve(r2, 'id2');
  assert.strictEqual(resolved2, 'id2');
  assert.strictEqual(resolved, '');
});

t('double begin() → old request superseded with close + deny', () => {
  const { hub, msgs } = mkHub({ waitMs: 5000 });
  let r1 = 'unset', r2 = 'unset';
  hub.begin([mkPort('id1', 'COM3')], null, cb => { r1 = cb; });
  hub.begin([mkPort('id2', 'COM4')], null, cb => { r2 = cb; });
  assert.strictEqual(r1, '', 'first request denied quietly');
  assert.strictEqual(r2, 'unset', 'second request pending');
  const close = msgs.filter(m => m.type === 'close')[0];
  assert.ok(close && close.reason === 'superseded');
});

t('picking an id that was just removed keeps the chooser open with a note', () => {
  const { hub, msgs } = mkHub({ waitMs: 5000 });
  let resolved = 'unset';
  const rid = hub.begin([mkPort('id1', 'COM3')], null, cb => { resolved = cb; });
  hub.portRemoved(mkPort('id1', 'COM3'));
  hub.resolve(rid, 'id1');
  assert.strictEqual(resolved, 'unset', 'not resolved with a dead port');
  const note = msgs.filter(m => m.type === 'note').pop();
  assert.ok(note, 'note sent to renderer');
  assert.strictEqual(hub.req !== null, true, 'still choosing');
});

t('labelOf: COM name + friendly USB info', () => {
  assert.strictEqual(labelOf({ comName: 'COM5', displayName: 'USB-SERIAL CH340', vid: '1A86', pid: '7523' }),
    'COM5 — USB-SERIAL CH340 · VID:1A86 PID:7523');
  assert.strictEqual(labelOf({ comName: 'COM3' }), 'COM3');
  assert.strictEqual(labelOf({}), '?');
});

t('sortByCom: natural numeric order (COM2 < COM10)', () => {
  const arr = [{ comName: 'COM10' }, { comName: 'COM2' }, { comName: 'COM1' }];
  assert.deepStrictEqual(arr.sort(sortByCom).map(p => p.comName), ['COM1', 'COM2', 'COM10']);
});

(async () => {
  await Promise.all(asyncTests);
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
