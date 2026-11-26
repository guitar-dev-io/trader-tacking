// Trading journal storage (main process): keeps the user's own MT5 deal history and balance/equity snapshots
// on THIS computer, one file per account: <dir>/<server>-<hash>.json. Read-only — it only asks the EA for history.
//  - first connect: backfill up to 365 days, one month per request (keeps EA messages small)
//  - then: incremental sync every few minutes and shortly after a position closes
//  - balance/equity snapshot on connect and every 15 minutes while connected
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as J from '../core/journal';
import type { Deal } from '../core/mt5-protocol';
import type { JournalAccount, JournalStatus, JournalView, PositionsSnapshot, Snapshot } from './ipc';
import type { Logger } from './logger';
import type { Mt5Info } from './mt5';

const DAY = 86400, BACKFILL_DAYS = 365, SNAP_EVERY = 15 * 60, SYNC_EVERY = 5 * 60 * 1000;

interface Stored { v: 1; account: JournalAccount; deals: Deal[]; snapshots: Snapshot[]; from: number | null; syncedAt: number | null }
export interface JournalDeps {
  dir: string;
  mt5: { connected(): boolean; deals(from: number, to: number): Promise<Deal[]> };
  log?: Logger;
  now?: () => number;
  timers?: boolean;
}
export type HelloLike = Partial<Pick<Mt5Info, 'server' | 'broker' | 'login'>> & { caps?: string[] };
export interface Journal {
  onConnect(info: HelloLike | null | undefined): void;
  onDisconnect(): void;
  onPositions(p: PositionsSnapshot | null): void;
  sync(): Promise<{ added: number }>;
  get(): JournalView;
  openLast(): JournalView;
  keyOf(info: HelloLike): string;
  flush(): void;
}
const noLog: Logger = { info() { /* no log */ }, warn() { /* no log */ } };

export function createJournal({ dir, mt5, log = noLog, now = () => Math.floor(Date.now() / 1000), timers = true }: JournalDeps): Journal {
  let key: string | null = null, data: Stored | null = null, syncing: Promise<{ added: number }> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null, saveT: ReturnType<typeof setTimeout> | undefined, lastPosCount: number | null = null;
  let status: JournalStatus = { state: 'idle', msg: '' };

  const fileOf = (k: string): string => path.join(dir, k + '.json');
  const keyOf = (info: HelloLike): string => {
    const server = String(info.server || 'mt5').replace(/[^\w.-]+/g, '_').slice(0, 60);
    return server + '-' + crypto.createHash('sha256').update(`${info.server}|${info.login || ''}`).digest('hex').slice(0, 10);
  };
  function load(k: string): Stored | null {
    try { return JSON.parse(fs.readFileSync(fileOf(k), 'utf8')) as Stored; } catch (_) { return null; }
  }
  function save(immediate?: boolean): void {
    if (!key || !data) return;
    const k = key, d = data;
    clearTimeout(saveT);
    const w = (): void => {
      try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(fileOf(k) + '.tmp', JSON.stringify(d)); fs.renameSync(fileOf(k) + '.tmp', fileOf(k)); }
      catch (e) { log.warn('journal', 'บันทึกประวัติเทรดไม่ได้: ' + (e as Error).message); }
    };
    if (immediate) w(); else saveT = setTimeout(w, 1500);
  }

  // EA said hello: open (or create) this account's journal and start syncing
  function onConnect(info: HelloLike | null | undefined): void {
    if (!info || !(info.caps || []).includes('deals')) { status = { state: 'old-ea', msg: 'EA รุ่นเก่า — ติดตั้ง EA ใหม่เพื่อเก็บประวัติการเทรด' }; return; }
    const k = keyOf(info);
    if (k !== key || !data) {
      key = k;
      data = load(k) || { v: 1, account: {}, deals: [], snapshots: [], from: null, syncedAt: null };
    }
    data.account = { ...data.account, key: k, broker: info.broker, server: info.server, hasLogin: !!info.login, balanceDeals: (info.caps || []).includes('balance') };
    lastPosCount = null;
    status = { state: 'ready', msg: '' };
    sync().catch(() => { /* status already says why */ });
    if (timers) {
      if (timer) clearInterval(timer);
      timer = setInterval(() => { sync().catch(() => { /* status */ }); }, SYNC_EVERY);
      if (timer.unref) timer.unref();
    }
  }
  function onDisconnect(): void { if (timer) clearInterval(timer); timer = null; if (data) save(true); }

  // positions push: snapshot balance/equity (throttled) and sync soon after a position closes
  function onPositions(p: PositionsSnapshot | null): void {
    if (!p || !data) return;
    const a: Partial<PositionsSnapshot['acct']> = p.acct || {};
    data.account = { ...data.account, currency: a.currency || data.account.currency, demo: a.demo, leverage: a.leverage };
    const snaps = data.snapshots, last = snaps[snaps.length - 1], t = now();
    if (a.balance != null && (!last || t - last.time >= SNAP_EVERY)) {
      snaps.push({ time: t, balance: +a.balance, equity: +(a.equity ?? a.balance) });
      if (snaps.length > 40000) snaps.splice(0, snaps.length - 40000);
      save();
    }
    const n = (p.positions || []).length;
    if (lastPosCount != null && n < lastPosCount) setTimeout(() => { sync().catch(() => { /* status */ }); }, timers ? 2000 : 0);
    lastPosCount = n;
  }

  async function sync(): Promise<{ added: number }> {
    const d = data;
    if (!d || !mt5.connected()) return { added: 0 };
    if (syncing) return syncing;
    syncing = (async (): Promise<{ added: number }> => {
      let added = 0;
      const t = now();
      try {
        if (!d.from || d.from > t - BACKFILL_DAYS * DAY + DAY) {
          status = { state: 'backfill', msg: 'กำลังดึงประวัติย้อนหลัง…' };
          const until = d.from || t + 3600, stop = t - BACKFILL_DAYS * DAY;
          for (let end = until; end > stop; end -= 31 * DAY) {
            const start = Math.max(stop, end - 31 * DAY);
            const ds = await mt5.deals(start, end);
            const m = J.merge(d.deals, ds); d.deals = m.deals; added += m.added;
            d.from = start;
            status = { state: 'backfill', msg: `กำลังดึงประวัติย้อนหลัง… ${new Date(start * 1000).toISOString().slice(0, 7)}` };
          }
          d.from = stop;
        } else {
          const from = (d.syncedAt || t - 7 * DAY) - 3 * DAY;     // overlap: late fills / server time
          const ds = await mt5.deals(from, 0);
          const m = J.merge(d.deals, ds); d.deals = m.deals; added += m.added;
        }
        d.syncedAt = t;
        status = { state: 'ok', msg: '' };
        save();
        if (added) log.info('journal', `ประวัติเทรด: +${added} รายการ (รวม ${d.deals.length})`);
      } catch (e) {
        status = { state: 'error', msg: 'ซิงค์ไม่สำเร็จ: ' + (e as Error).message };
        log.warn('journal', status.msg);
      }
      return { added };
    })();
    try { return await syncing; } finally { syncing = null; }
  }

  function get(): JournalView {
    return { account: data ? data.account : null, deals: data ? data.deals : [], snapshots: data ? data.snapshots : [],
      from: data ? data.from : null, syncedAt: data ? data.syncedAt : null, status, syncing: !!syncing };
  }
  // offline: show the last journal even when MT5 is not running
  function openLast(): JournalView {
    if (data) return get();
    try {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
      const newest = files[0];
      if (newest) { key = newest.f.replace(/\.json$/, ''); data = load(key); status = { state: 'offline', msg: 'MT5 ไม่ได้เชื่อมต่อ — แสดงข้อมูลที่เก็บไว้ล่าสุด' }; }
    } catch (_) { /* no journal yet */ }
    return get();
  }
  return { onConnect, onDisconnect, onPositions, sync, get, openLast, keyOf, flush: () => save(true) };
}
