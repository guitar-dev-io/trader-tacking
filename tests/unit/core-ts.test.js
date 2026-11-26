// The TypeScript-only helpers added during the migration (src/core → gen/).
const { test } = require('node:test');
const assert = require('node:assert');
const P = require('../../gen/mt5-protocol.js'), V = require('../../gen/ea-version.js');

test('mt5 protocol: parses known EA messages, ignores junk', () => {
  assert.equal(P.parseEAMessage('{"t":"tick","s":"XAUUSD","bid":1,"ask":2,"ms":3}').t, 'tick');
  assert.equal(P.parseEAMessage('{"t":"nope"}'), null);
  assert.equal(P.parseEAMessage('not json'), null);
});

test('mt5 protocol: only read-only commands are allowed', () => {
  for (const c of ['WATCH|XAUUSD', 'HIST|1|XAUUSD|M5|100|0', 'SUB|main|XAUUSD|M5', 'POS|1', 'DEALS|2|0|0', 'PING']) assert.ok(P.isReadOnlyCommand(c), c);
  for (const c of ['BUY|XAUUSD|0.01', 'CLOSE|1', '']) assert.ok(!P.isReadOnlyCommand(c), c);
});

test('ea-version: build numbers, update decision and compile log', () => {
  assert.equal(V.bundledBuild('#property version   "1.03"'), 103);
  assert.equal(V.helloBuild({ v: 2 }), 102);
  assert.deepEqual(V.shouldUpdate({ info: { v: 2, build: 103 }, bundled: 103 }), { ok: false, why: 'current', have: 103 });
  assert.deepEqual(V.shouldUpdate({ info: { v: 2 }, bundled: 103, account: 'a', attempted: { a: 103 } }), { ok: false, why: 'already-tried', have: 102 });
  assert.deepEqual(V.parseCompileLog('Result: 0 errors, 2 warnings'), { errors: 0, warnings: 2 });
  assert.equal(V.parseCompileLog('nothing'), null);
});
