const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createJournal } = require('../../journal-store.js');

// fake EA history: one closed trade per day over 400 days + a deposit
function fakeMt5(now) {
  const all = [{ ticket: 1, pos: 0, s: '', side: 'balance', entry: 'in', vol: 0, price: 0, profit: 1000, commission: 0, swap: 0, time: now - 399 * 86400 }];
  for (let d = 0; d < 400; d++) {
    const t = now - d * 86400;
    all.push({ ticket: 10 + d * 2, pos: 1000 + d, s: 'XAUUSDbrex.', side: 'buy', entry: 'in', vol: 0.01, price: 3000, profit: 0, commission: 0, swap: 0, time: t - 600 });
    all.push({ ticket: 11 + d * 2, pos: 1000 + d, s: 'XAUUSDbrex.', side: 'sell', entry: 'out', vol: 0.01, price: 3001, profit: d % 3 ? 1 : -2, commission: 0, swap: 0, time: t - 60 });
  }
  const calls = [];
  return { calls, all, connected: () => true, deals: async (from, to) => { calls.push([from, to]); return all.filter((x) => x.time >= from && (!to || x.time < to)); } };
}

test('backfill 365 days in monthly chunks, dedupe, incremental sync, snapshots, persisted per account', async () => {
  const now = 1795680000, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jr-'));
  const mt5 = fakeMt5(now);
  let t = now;
  const j = createJournal({ dir, mt5, now: () => t, timers: false });
  j.onConnect({ server: 'BrexCapital-Server', broker: 'Brex', login: 123456, caps: ['pos', 'deals', 'balance'] });
  await new Promise((r) => setTimeout(r, 20)); await j.sync();
  const g = j.get();
  assert.ok(mt5.calls.length >= 12 && mt5.calls.length <= 14, 'chunks: ' + mt5.calls.length);
  assert.ok(mt5.calls.every(([a, b]) => b - a <= 31 * 86400 + 3600));
  const trades = g.deals.filter((d) => d.entry === 'out').length;
  assert.ok(trades >= 364 && trades <= 366, String(trades));
  assert.equal(new Set(g.deals.map((d) => d.ticket)).size, g.deals.length, 'no duplicates');
  // a new trade appears; incremental sync asks only for recent days and adds it
  t = now + 3600; mt5.all.push({ ticket: 99999, pos: 5, s: 'EURUSDbrex.', side: 'sell', entry: 'out', vol: 0.1, price: 1.1, profit: 7, commission: 0, swap: 0, time: now + 1800 });
  mt5.calls.length = 0;
  const r = await j.sync();
  assert.equal(r.added, 1); assert.equal(mt5.calls.length, 1);
  assert.ok(now - mt5.calls[0][0] <= 4 * 86400, 'incremental window');
  // snapshots throttled to 15 min; a closed position triggers a sync
  j.onPositions({ acct: { balance: 1100, equity: 1105, currency: 'USD', demo: true }, positions: [{}, {}] });
  j.onPositions({ acct: { balance: 1101, equity: 1101 }, positions: [{}] });
  assert.equal(j.get().snapshots.length, 1);
  assert.equal(j.get().account.currency, 'USD');
  j.flush();
  const files = fs.readdirSync(dir);
  assert.equal(files.length, 1); assert.match(files[0], /^BrexCapital-Server-[0-9a-f]{10}\.json$/);
  assert.ok(!fs.readFileSync(path.join(dir, files[0]), 'utf8').includes('123456'), 'login number is not stored');
  // offline: another instance reads the last journal back
  const j2 = createJournal({ dir, mt5: { connected: () => false }, timers: false });
  assert.equal(j2.openLast().deals.length, j.get().deals.length);
  assert.equal(j2.get().status.state, 'offline');
});

test('old EA (no deals capability) is reported, not synced', () => {
  const j = createJournal({ dir: os.tmpdir(), mt5: { connected: () => true, deals: async () => { throw new Error('no'); } }, timers: false });
  j.onConnect({ server: 'X', caps: [] });
  assert.equal(j.get().status.state, 'old-ea');
});
