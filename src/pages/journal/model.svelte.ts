// "ผลการเทรด" state (Svelte runes): the journal data from the main process (or sample data), the range and the
// table filters, and everything computed from them. Same localStorage keys as before (jr.sample, jr.range, jr.custom).
import { JOURNAL } from '../../legacy/core';
import type { Trade, Metrics, JournalData } from '../../core/journal';
import { store } from '../../state';
import { TZ } from '../../../app-core.js';

export const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const TH_WD = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
export const SESS: Record<string, string> = { asia: 'เอเชีย', london: 'ลอนดอน', newyork: 'นิวยอร์ก' };
export const RANGES: [string, string][] = [['today', 'วันนี้'], ['7d', '7 วัน'], ['month', 'เดือนนี้'], ['3m', '3 เดือน'], ['ytd', 'ปีนี้'], ['all', 'ทั้งหมด'], ['custom', 'กำหนดเอง']];

// what vcg.journalGet() returns (or JOURNAL.sample()), plus UI flags
export type Raw = Partial<JournalData> & { deals?: any[]; status?: { state?: string; msg?: string }; syncing?: boolean; sample?: boolean; syncedAt?: number; account?: any; snapshots?: any[] };
export interface Computed { all: Trade[]; ts: Trade[]; st: Metrics; allSt: Metrics; ops: { time: number; amount: number }[]; from: number | null; to: number | null; open: Trade[] }

export const jr = $state({
  raw: null as Raw | null,
  sampleMode: store.get<boolean>('jr.sample', false),
  range: store.get<string>('jr.range', 'month'),
  custom: store.get<{ from?: string; to?: string } | null>('jr.custom', null),
  calMonth: null as string | null,
  dayFilter: null as string | null,
  sort: { k: 'close', dir: -1 },
  page: 0,
  filt: { s: '', side: '', res: '' } as Record<string, string>,
});

// ------------------------------------------------------------ formatting
export const cur = () => (jr.raw && jr.raw.account && jr.raw.account.currency) || 'USD';
export function money(v: number | null | undefined, sign = true): string {
  if (v == null || !isFinite(v)) return '—';
  const c = cur(), a = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const s = v > 0 && sign ? '+' : v < 0 ? '−' : '';
  return c === 'USD' ? `${s}$${a}` : `${s}${a} ${c}`;
}
export const pct = (v: number | null | undefined, d = 1) => (v == null || !isFinite(v) ? '—' : (v * 100).toFixed(d) + '%');
export const cls = (v: number) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
export const dur = (s: number | null | undefined) => (s == null ? '—' : s < 3600 ? Math.round(s / 60) + ' นาที' : s < 86400 ? (s / 3600).toFixed(1) + ' ชม.' : (s / 86400).toFixed(1) + ' วัน');
export const tz = (): number => (typeof TZ === 'number' ? TZ : -new Date().getTimezoneOffset() * 60);

// ------------------------------------------------------------ range + stats
const nowS = () => (jr.raw && jr.raw.sample ? jr.raw.syncedAt! : Math.floor(Date.now() / 1000));
const startOfDay = (t: number) => { const k = JOURNAL.dayKey(t, tz()); return Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 1000 - tz(); };
function rangeBounds(): [number | null, number | null] {
  const n = nowS(), d0 = startOfDay(n), k = JOURNAL.dayKey(n, tz()), y = +k.slice(0, 4), m = +k.slice(5, 7) - 1;
  const at = (yy: number, mm: number, dd = 1) => Date.UTC(yy, mm, dd) / 1000 - tz();
  switch (jr.range) {
    case 'today': return [d0, null];
    case '7d': return [d0 - 6 * 86400, null];
    case 'month': return [at(y, m), null];
    case '3m': return [at(y, m - 2), null];
    case 'ytd': return [at(y, 0), null];
    case 'custom': return jr.custom ? [Date.parse(jr.custom.from + 'T00:00:00Z') / 1000 - tz(), Date.parse(jr.custom.to + 'T00:00:00Z') / 1000 - tz() + 86400] : [null, null];
    default: return [null, null];
  }
}
export function compute(): Computed {
  const deals = (jr.raw && jr.raw.deals) || [];
  const all = JOURNAL.trades(deals), ops = JOURNAL.balanceOps(deals);
  const [from, to] = rangeBounds();
  const inR = (t: Trade) => t.closed && (from == null || t.close! >= from) && (to == null || t.close! < to);
  const ts = all.filter(inR);
  const before = all.filter((t) => t.closed && from != null && t.close! < from).reduce((s, t) => s + t.net, 0) + ops.filter((o) => from != null && o.time < from).reduce((s, o) => s + o.amount, 0);
  const opsR = ops.filter((o) => (from == null || o.time >= from) && (to == null || o.time < to));
  const st = JOURNAL.stats(ts, { tz: tz(), startBalance: from == null ? 0 : before, balanceOps: opsR });
  const allSt = JOURNAL.stats(all, { tz: tz() });
  return { all, ts, st, allSt, ops, from, to, open: all.filter((t) => !t.closed) };
}

export function setRange(r: string) {
  jr.range = r; store.set('jr.range', r); jr.page = 0; jr.dayFilter = null; jr.calMonth = null;
  if (r === 'custom' && !jr.custom) { const t = new Date().toISOString().slice(0, 10); jr.custom = { from: t.slice(0, 8) + '01', to: t }; store.set('jr.custom', jr.custom); }
}

// ------------------------------------------------------------ data
export async function load(): Promise<void> {
  const vcg = (window as any).vcg;
  if (jr.sampleMode || !vcg.journalGet) { jr.raw = JOURNAL.sample(7) as Raw; return; }
  try { jr.raw = await vcg.journalGet(); } catch (e) { jr.raw = { deals: [], status: { state: 'error', msg: (e as Error).message } }; }
}
