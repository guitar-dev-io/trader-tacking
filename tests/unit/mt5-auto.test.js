const test = require('node:test'), assert = require('node:assert');
const A = require('../../gen/main/mt5-auto.js');
const base = { source: 'mt5', enabled: true, connected: false, running: false, launching: false, tries: [], now: 1e7, sinceStart: 10000, eaSeen: true };

test('auto-launch: only when MT5 is the source, enabled, EA not connected and MT5 not running', () => {
  assert.equal(A.decide(base).act, 'launch');
  assert.equal(A.decide({ ...base, source: 'vcg' }).act, 'none');
  assert.equal(A.decide({ ...base, enabled: false }).act, 'none');
  assert.equal(A.decide({ ...base, connected: true }).why, 'connected');
  assert.equal(A.decide({ ...base, running: true }).why, 'running');
  assert.equal(A.decide({ ...base, launching: true }).why, 'launching');
  assert.equal(A.decide({ ...base, sinceStart: 1000 }).why, 'wait');
});
test('auto-launch: first time adds the EA via config, later a plain start (no duplicate EA)', () => {
  assert.deepEqual(A.decide({ ...base, eaSeen: false }), { act: 'launch', withEA: true });
  assert.deepEqual(A.decide(base), { act: 'launch', withEA: false });
});
test('auto-launch: cooldown 45 s between tries, gives up after 3 in an hour', () => {
  assert.equal(A.decide({ ...base, tries: [base.now - 10e3] }).why, 'cooldown');
  assert.equal(A.decide({ ...base, tries: [base.now - 60e3] }).act, 'launch');
  assert.equal(A.decide({ ...base, tries: [base.now - 300e3, base.now - 200e3, base.now - 100e3] }).why, 'gave-up');
  assert.equal(A.decide({ ...base, tries: [base.now - 7200e3, base.now - 7100e3, base.now - 100e3] }).act, 'launch');
});
test('minimized start command: wine start /min on macOS, cmd start /min on Windows; config only with EA', () => {
  const mac = { launch: { cmd: '/Applications/MetaTrader 5.app/Contents/SharedSupport/wine/bin/wine', args: ['C:\\Program Files\\MetaTrader 5\\terminal64.exe', '/portable', '/config:C:\\x.ini'] }, env: { WINEPREFIX: '/p' } };
  assert.deepEqual(A.minimized(mac, 'darwin', false).args, ['start', '/min', 'C:\\Program Files\\MetaTrader 5\\terminal64.exe', '/portable']);
  assert.deepEqual(A.minimized(mac, 'darwin', true).args.slice(-1), ['/config:C:\\x.ini']);
  assert.equal(A.minimized(mac, 'darwin', false).env.WINEPREFIX, '/p');
  const win = { launch: { cmd: 'C:\\Program Files\\MetaTrader 5\\terminal64.exe', args: ['/config:C:\\Program Files\\MetaTrader 5\\config\\a.ini'] }, env: {} };
  const w = A.minimized(win, 'win32', true);
  assert.equal(w.verbatim, true);
  assert.equal(w.args.at(-1), '"start "" /min "C:\\Program Files\\MetaTrader 5\\terminal64.exe" /config:"C:\\Program Files\\MetaTrader 5\\config\\a.ini""');
  assert.deepEqual(A.closeCmd(mac, 'darwin').args, ['taskkill', '/IM', 'terminal64.exe']);
  assert.equal(A.closeCmd(win, 'win32').cmd, 'taskkill');
});
