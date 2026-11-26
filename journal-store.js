// Trading journal storage (main process): keeps the user's own MT5 deal history and balance/equity snapshots
// on THIS computer, one file per account: <dir>/<server>-<hash>.json. Read-only — it only asks the EA for history.
//  - first connect: backfill up to 365 days, one month per request (keeps EA messages small)
//  - then: incremental sync every few minutes and shortly after a position closes
//  - balance/equity snapshot on connect and every 15 minutes while connected
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const J = require('./journal.js');

const DAY = 86400, BACKFILL_DAYS = 365, SNAP_EVERY = 15 * 60, SYNC_EVERY = 5 * 60 * 1000;

function createJournal({ dir, mt5, log = { info() {}, warn() {} }, now = () => Math.floor(Date.now() / 1000), timers = true }) {
  let key = null, data = null, syncing = null, timer = null, saveT = null, lastPosCount = null, status = { state: 'idle', msg: '' };

  const fileOf = (k) => path.join(dir, k + '.json');
  const keyOf = (info) => {
    const server = String(info.server || 'mt5').replace(/[^\w.-]+/g, '_').slice(0, 60);
    return server + '-' + crypto.createHash('sha256').update(`${info.server}|${info.login || ''}`).digest('hex').slice(0, 10);
  };
  function load(k) {
    try { return JSON.parse(fs.readFileSync(fileOf(k), 'utf8')); } catch (_) { return null; }
  }
  function save(immediate) {
    if (!key || !data) return;
    clearTimeout(saveT);
    const w = () => { try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(fileOf(key) + '.tmp', JSON.stringify(data)); fs.renameSync(fileOf(key) + '.tmp', fileOf(key)); } catch (e) { log.warn('journal', 'บันทึกประวัติเทรดไม่ได้: ' + e.message); } };
    if (immediate) w(); else saveT = setTimeout(w, 1500);
  }

  // EA said hello: open (or create) this account's journal and start syncing
  function onConnect(info) {
    if (!info || !(info.caps || []).includes('deals')) { status = { state: 'old-ea', msg: 'EA รุ่นเก่า — ติดตั้ง EA ใหม่เพื่อเก็บประวัติการเทรด' }; return; }
    const k = keyOf(info);
    if (k !== key) {
      key = k;
      data = load(k) || { v: 1, account: {}, deals: [], snapshots: [], from: null, syncedAt: null };
    }
    data.account = { ...data.account, key: k, broker: info.broker, server: info.server, hasLogin: !!info.login, balanceDeals: (info.caps || []).includes('balance') };
    lastPosCount = null;
    status = { state: 'ready', msg: '' };
    sync().catch(() => {});
    if (timers) { clearInterval(timer); timer = setInterval(() => sync().catch(() => {}), SYNC_EVERY); if (timer.unref) timer.unref(); }
  }
  function onDisconnect() { clearInterval(timer); timer = null; if (data) save(true); }

  // positions push: snapshot balance/equity (throttled) and sync soon after a position closes
  function onPositions(p) {
    if (!p || !data) return;
    const a = p.acct || {};
    data.account = { ...data.account, currency: a.currency || data.account.currency, demo: a.demo, leverage: a.leverage };
    const last = data.snapshots[data.snapshots.length - 1], t = now();
    if (a.balance != null && (!last || t - last.time >= SNAP_EVERY)) {
      data.snapshots.push({ time: t, balance: +a.balance, equity: +a.equity });
      if (data.snapshots.length > 40000) data.snapshots.splice(0, data.snapshots.length - 40000);
      save();
    }
    const n = (p.positions || []).length;
    if (lastPosCount != null && n < lastPosCount) setTimeout(() => sync().catch(() => {}), timers ? 2000 : 0);
    lastPosCount = n;
  }

  async function sync() {
    if (!data || !mt5.connected()) return { added: 0 };
    if (syncing) return syncing;
    syncing = (async () => {
      let added = 0;
      const t = now();
      try {
        if (!data.from || data.from > t - BACKFILL_DAYS * DAY + DAY) {
          status = { state: 'backfill', msg: 'กำลังดึงประวัติย้อนหลัง…' };
          const until = data.from || t + 3600, stop = t - BACKFILL_DAYS * DAY;
          for (let end = until; end > stop; end -= 31 * DAY) {
            const start = Math.max(stop, end - 31 * DAY);
            const ds = await mt5.deals(start, end);
            const m = J.merge(data.deals, ds); data.deals = m.deals; added += m.added;
            data.from = start;
            status = { state: 'backfill', msg: `กำลังดึงประวัติย้อนหลัง… ${new Date(start * 1000).toISOString().slice(0, 7)}` };
          }
          data.from = stop;
        } else {
          const from = (data.syncedAt || t - 7 * DAY) - 3 * DAY;     // overlap: late fills / server time
          const ds = await mt5.deals(from, 0);
          const m = J.merge(data.deals, ds); data.deals = m.deals; added += m.added;
        }
        data.syncedAt = t;
        status = { state: 'ok', msg: '' };
        save();
        if (added) log.info('journal', `ประวัติเทรด: +${added} รายการ (รวม ${data.deals.length})`);
      } catch (e) {
        status = { state: 'error', msg: 'ซิงค์ไม่สำเร็จ: ' + e.message };
        log.warn('journal', status.msg);
      }
      return { added };
    })();
    try { return await syncing; } finally { syncing = null; }
  }

  function get() {
    return { account: data ? data.account : null, deals: data ? data.deals : [], snapshots: data ? data.snapshots : [],
      from: data ? data.from : null, syncedAt: data ? data.syncedAt : null, status, syncing: !!syncing };
  }
  // offline: show the last journal even when MT5 is not running
  function openLast() {
    if (data) return get();
    try {
      const fs2 = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
      if (fs2[0]) { key = fs2[0].f.replace(/\.json$/, ''); data = load(key); status = { state: 'offline', msg: 'MT5 ไม่ได้เชื่อมต่อ — แสดงข้อมูลที่เก็บไว้ล่าสุด' }; }
    } catch (_) {}
    return get();
  }
  return { onConnect, onDisconnect, onPositions, sync, get, openLast, keyOf, flush: () => save(true) };
}

module.exports = { createJournal };
