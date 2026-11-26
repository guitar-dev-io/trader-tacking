// MT5 data source (desktop): a TCP server on 127.0.0.1 that the PriceTrackerBridge EA (mt5/PriceTrackerBridge.mq5)
// connects to from a logged-in MetaTrader 5 terminal. Lines are JSON from the EA and "CMD|a|b" text to the EA.
const net = require('net');
const log = require('./logger');

const TF = ['M1', 'M5', 'M15', 'H1', 'H4', 'D1', 'W1'];
const st = { server: null, sock: null, buf: '', connected: false, info: null, reqId: 0, pending: new Map(), last: {}, unknown: new Set(), lastTick: 0 };
let hooks = null, port = 7788;

function send(line) { if (st.sock && !st.sock.destroyed) { st.sock.write(line + '\n'); return true; } return false; }

function start(p, h) {
  hooks = h; port = p || 7788;
  stop();
  st.server = net.createServer((sock) => {
    if (st.sock) { try { st.sock.destroy(); } catch (_) {} }
    st.sock = sock; st.buf = ''; sock.setEncoding('utf8'); sock.setNoDelay(true);
    sock.on('data', (d) => {
      st.buf += d;
      if (st.buf.length > 20e6) { log.error('mt5', 'ข้อมูลจาก EA ยาวผิดปกติ — ตัดการเชื่อมต่อ'); sock.destroy(); return; }
      let i;
      while ((i = st.buf.indexOf('\n')) >= 0) { const line = st.buf.slice(0, i); st.buf = st.buf.slice(i + 1); if (line.trim()) handle(line); }
    });
    sock.on('close', () => { if (st.sock === sock) { st.sock = null; st.connected = false; log.warn('mt5', 'EA ตัดการเชื่อมต่อ'); hooks.status(); } });
    sock.on('error', (e) => log.warn('mt5', 'socket: ' + e.message));
  });
  st.server.on('error', (e) => log.error('mt5', `เปิดพอร์ต MT5 ${port} ไม่ได้: ${e.message}`));
  st.server.listen(port, '127.0.0.1', () => log.info('mt5', `รอ EA จาก MT5 ที่ 127.0.0.1:${port}`));
}
function stop() {
  if (st.sock) { try { st.sock.destroy(); } catch (_) {} st.sock = null; }
  if (st.server) { try { st.server.close(); } catch (_) {} st.server = null; }
  st.connected = false;
}

function handle(line) {
  let m; try { m = JSON.parse(line); } catch (_) { return log.warn('mt5', 'ข้อความจาก EA อ่านไม่ได้', line.slice(0, 200)); }
  switch (m.t) {
    case 'hello':
      st.connected = true; st.info = { broker: m.broker, server: m.server, offset: m.offset, symbols: m.symbols || [] };
      log.info('mt5', `EA เชื่อมต่อแล้ว: ${m.broker} (${m.server}) เวลา server = GMT${m.offset >= 0 ? '+' : ''}${m.offset / 3600}`, { symbols: (m.symbols || []).slice(0, 40) });
      watch(hooks.symbols());
      Object.values(st.last).forEach(request);   // resend chart requests made before the EA connected
      hooks.status();
      break;
    case 'tick': {
      st.lastTick = Date.now();
      const dg = m.dg, ch = m.open ? m.bid - m.open : null;
      hooks.quote({ symbol: m.s, time: new Date(m.ms).toISOString(), bid: m.bid, ask: m.ask, digits: dg, spread: +(m.ask - m.bid).toFixed(dg),
        change: ch == null ? null : +ch.toFixed(dg), changePct: ch == null ? null : +((ch / m.open) * 100).toFixed(3) });
      break;
    }
    case 'bars': {
      const p = st.pending.get(String(m.id)); if (!p) return; st.pending.delete(String(m.id));
      const candles = (m.bars || []).map((b) => ({ timeSeconds: b[0], open: b[1], high: b[2], low: b[3], close: b[4] }));
      log.info('mt5', `ได้แท่งเทียน ${m.s} ${m.tf} ${candles.length} แท่ง`);
      hooks.chart({ type: 'chart', slot: p.slot, data: { symbol: p.symbol, history: { candles } } });
      break;
    }
    case 'bar':
      hooks.chart({ type: 'chart', slot: m.slot || 'main', data: { symbol: m.s, updates: { candles: (m.bars || []).map((b) => ({ timeSeconds: b[0], open: b[1], high: b[2], low: b[3], close: b[4] })) } } });
      break;
    case 'err': {
      const p = st.pending.get(String(m.id));
      log.warn('mt5', 'EA: ' + m.msg);
      if (p && m.retry && (p.tries || 0) < 5) { p.tries = (p.tries || 0) + 1; setTimeout(() => sendHist(m.id, p), 1500); }   // MT5 is still downloading history
      else if (p) { st.pending.delete(String(m.id)); hooks.chart({ type: 'chartError', slot: p.slot, data: { message: 'MT5: ' + m.msg } }); }
      break;
    }
    case 'unknown':
      if (!st.unknown.has(m.s)) { st.unknown.add(m.s); log.warn('mt5', `ไม่พบ ${m.s} ใน MT5 — ชื่อ symbol ของโบรกเกอร์อาจมีคำต่อท้าย เช่น ${m.s}.m / ${m.s}m`); hooks.status(); }
      break;
    case 'pong': break;
  }
}

function sendHist(id, p) {
  const o = p.o;
  send(`HIST|${id}|${o.symbol}|${TF[o.candleType] || 'H1'}|${o.limit || 1500}|${Math.floor(Date.parse(o.to) / 1000)}`);
}
function request(o) {
  const slot = o.slot || 'main';
  if (o.inclusive) st.last[slot] = o;
  if (!st.connected) { log.info('mt5', `รอ EA เชื่อมต่อก่อนขอแท่งเทียน ${o.symbol}`); return; }
  const id = String(++st.reqId), p = { slot, symbol: o.symbol, o };
  st.pending.set(id, p);
  sendHist(id, p);
  if (o.inclusive) send(`SUB|${slot}|${o.symbol}|${TF[o.candleType] || 'H1'}`);
}
function watch(symbols) { st.unknown.clear(); send('WATCH|' + symbols.join(',')); }


// MT5 "Experts" folders on this computer (for installing the EA):
//  macOS: MetaTrader runs in a Wine bottle under ~/Library/Application Support/<bottle>/drive_c/… (or ~/.wine)
//  Windows: %APPDATA%\MetaQuotes\Terminal\<id>\MQL5\Experts and Program Files installs
function findExpertDirs({ home, appData, platform, env = {} }) {
  const fs = require('fs'), path = require('path'), out = new Set();
  const ls = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => path.join(d, x.name)); } catch (_) { return []; } };
  const add = (d) => { const e = path.join(d, 'MQL5', 'Experts'); if (fs.existsSync(e)) out.add(e); };
  const scanDriveC = (c) => {
    for (const pf of ['Program Files', 'Program Files (x86)']) ls(path.join(c, pf)).forEach(add);
    for (const u of ls(path.join(c, 'users'))) ls(path.join(u, 'AppData', 'Roaming', 'MetaQuotes', 'Terminal')).forEach(add);
  };
  if (platform === 'darwin') {
    for (const b of ls(path.join(home, 'Library', 'Application Support'))) if (fs.existsSync(path.join(b, 'drive_c'))) scanDriveC(path.join(b, 'drive_c'));
    if (fs.existsSync(path.join(home, '.wine', 'drive_c'))) scanDriveC(path.join(home, '.wine', 'drive_c'));
  } else if (platform === 'win32') {
    ls(path.join(appData, 'MetaQuotes', 'Terminal')).forEach(add);
    for (const pf of [env.ProgramFiles, env['ProgramFiles(x86)']].filter(Boolean)) ls(pf).forEach(add);
  }
  return [...out];
}

module.exports = { findExpertDirs,
  start, stop, request, watch,
  status: () => ({ listening: !!st.server, connected: st.connected, broker: st.info && st.info.broker, server: st.info && st.info.server,
    symbols: st.info ? st.info.symbols : [], unknown: [...st.unknown], port, lastTick: st.lastTick }),
};
