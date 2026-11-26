import { PT, def } from './src/pt.ts';
import { JOURNAL } from './src/legacy/core.ts';
import { $, S, TC, TFS, THEME, TZ, drawings, esc, store } from './app-core.js';
import { chart, chartThemeOptions } from './app-chart.js';
import { connStatus, switchSymbol } from './app-data.js';
import { toast } from './settings.js';
import { SETUP } from './setup.js';
import { POSITIONS } from './positions.js';
import { PAGES } from './pages.js';
def({ JOURNALPAGE: [() => JOURNALPAGE] });
// "ผลการเทรด" — trading journal dashboard built from the user's own MT5 history (read-only, stored on this computer).
// Desktop: a page tab (titlebar button, Ctrl/⌘+J). Phone: a full-screen page from the More page. "ดูตัวอย่าง" shows sample data.
const JOURNALPAGE = (() => {
  const mobile = document.body.classList.contains('mobile');
  const ic = (n, s = 16, c) => (PT.ICON.html ? PT.ICON.html(n, s, c) : '');
  const inner = (n) => (PT.ICON.svg(n, 14) || '').replace(/^<svg[^>]*>|<\/svg>$/g, '');
  const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const TH_WD = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
  const SESS = { asia: 'เอเชีย', london: 'ลอนดอน', newyork: 'นิวยอร์ก' };
  const RANGES = [['today', 'วันนี้'], ['7d', '7 วัน'], ['month', 'เดือนนี้'], ['3m', '3 เดือน'], ['ytd', 'ปีนี้'], ['all', 'ทั้งหมด'], ['custom', 'กำหนดเอง']];

  let raw = null, sampleMode = store.get('jr.sample', false), range = store.get('jr.range', 'month'), custom = store.get('jr.custom', null);
  let calMonth = null, dayFilter = null, sort = { k: 'close', dir: -1 }, page = 0, filt = { s: '', side: '', res: '' };
  let charts = [], lastData = null, loading = false, drawToken = 0;

  const root = document.createElement('div'); root.id = 'journal-page'; root.className = 'jr' + (mobile ? ' m-full hidden' : '');

  // ------------------------------------------------------------ data
  async function load() {
    if (sampleMode || !vcg.journalGet) { raw = JOURNAL.sample(7); return; }
    loading = true;
    try { raw = await vcg.journalGet(); } catch (e) { raw = { deals: [], status: { state: 'error', msg: e.message } }; }
    loading = false;
  }
  const cur = () => (raw && raw.account && raw.account.currency) || 'USD';
  const money = (v, sign = true) => {
    if (v == null || !isFinite(v)) return '—';
    const c = cur(), a = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const s = v > 0 && sign ? '+' : v < 0 ? '−' : '';
    return c === 'USD' ? `${s}$${a}` : `${s}${a} ${c}`;
  };
  const pct = (v, d = 1) => (v == null || !isFinite(v) ? '—' : (v * 100).toFixed(d) + '%');
  const cls = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
  const dur = (s) => (s == null ? '—' : s < 3600 ? Math.round(s / 60) + ' นาที' : s < 86400 ? (s / 3600).toFixed(1) + ' ชม.' : (s / 86400).toFixed(1) + ' วัน');
  const tz = () => (typeof TZ === 'number' ? TZ : -new Date().getTimezoneOffset() * 60);
  const nowS = () => (raw && raw.sample ? raw.syncedAt : Math.floor(Date.now() / 1000));
  const startOfDay = (t) => { const k = JOURNAL.dayKey(t, tz()); return Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 1000 - tz(); };
  function rangeBounds() {
    const n = nowS(), d0 = startOfDay(n), k = JOURNAL.dayKey(n, tz()), y = +k.slice(0, 4), m = +k.slice(5, 7) - 1;
    const at = (yy, mm, dd = 1) => Date.UTC(yy, mm, dd) / 1000 - tz();
    switch (range) {
      case 'today': return [d0, null];
      case '7d': return [d0 - 6 * 86400, null];
      case 'month': return [at(y, m), null];
      case '3m': return [at(y, m - 2), null];
      case 'ytd': return [at(y, 0), null];
      case 'custom': return custom ? [Date.parse(custom.from + 'T00:00:00Z') / 1000 - tz(), Date.parse(custom.to + 'T00:00:00Z') / 1000 - tz() + 86400] : [null, null];
      default: return [null, null];
    }
  }
  function compute() {
    const deals = (raw && raw.deals) || [];
    const all = JOURNAL.trades(deals), ops = JOURNAL.balanceOps(deals);
    const [from, to] = rangeBounds();
    const inR = (t) => t.closed && (from == null || t.close >= from) && (to == null || t.close < to);
    const ts = all.filter(inR);
    const before = all.filter((t) => t.closed && from != null && t.close < from).reduce((s, t) => s + t.net, 0) + ops.filter((o) => from != null && o.time < from).reduce((s, o) => s + o.amount, 0);
    const opsR = ops.filter((o) => (from == null || o.time >= from) && (to == null || o.time < to));
    const st = JOURNAL.stats(ts, { tz: tz(), startBalance: from == null ? 0 : before, balanceOps: opsR });
    const allSt = JOURNAL.stats(all, { tz: tz() });
    return { all, ts, st, allSt, ops, from, to, open: all.filter((t) => !t.closed) };
  }

  // ------------------------------------------------------------ render
  function shell() {
    const a = (raw && raw.account) || {}, status = (raw && raw.status) || {};
    const syncTxt = raw && raw.sample ? 'ข้อมูลตัวอย่าง' : status.state === 'backfill' || (raw && raw.syncing) ? status.msg || 'กำลังซิงค์…'
      : status.state === 'error' ? status.msg : status.state === 'offline' ? status.msg
        : raw && raw.syncedAt ? 'ซิงค์ล่าสุด ' + new Date(raw.syncedAt * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '';
    return `<div class="jr-head">
        ${mobile ? `<button class="jr-close ib" aria-label="ปิด">${ic('arrow-left', 18)}</button>` : ''}
        <div class="jr-title"><h1>${ic('wallet', 20)}ผลการเทรด</h1>
          <div class="jr-acct">${a.broker ? `<b>${esc(a.broker)}</b>` : '<b>บัญชี MT5</b>'}${a.demo != null ? `<span class="jr-badge ${a.demo ? 'demo' : 'real'}">${a.demo ? 'DEMO' : 'REAL'}</span>` : ''}
            <small>${esc([a.server, cur()].filter(Boolean).join(' · '))}</small></div></div>
        <div class="jr-actions">
          <span class="jr-sync ${status.state === 'error' ? 'bad' : ''}">${raw && raw.syncing ? ic('loader-circle', 14, 'spin') : ''}${esc(syncTxt)}</span>
          ${!raw || !raw.sample ? `<button data-a="sync" title="ดึงประวัติล่าสุดจาก MT5">${ic('refresh-cw', 15)}<span class="lbl">ซิงค์</span></button>` : ''}
          <button data-a="csv" title="ส่งออกรายการเทรดเป็น CSV">${ic('download', 15)}<span class="lbl">CSV</span></button>
          <button data-a="sample" class="${sampleMode ? 'on' : ''}" title="ดูหน้าตาด้วยข้อมูลตัวอย่าง">${ic('sparkles', 15)}<span class="lbl">${sampleMode ? 'ออกจากตัวอย่าง' : 'ดูตัวอย่าง'}</span></button>
        </div>
      </div>
      <div class="jr-bar">
        <div class="jr-seg">${RANGES.map(([k, l]) => `<button data-r="${k}" class="${range === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${range === 'custom' ? `<div class="jr-custom"><input type="date" data-c="from" value="${esc((custom && custom.from) || '')}"><span>–</span><input type="date" data-c="to" value="${esc((custom && custom.to) || '')}"></div>` : ''}
        <span class="jr-note">${ic('shield-check', 14)}ข้อมูลอ่านจาก MT5 ของคุณ เก็บไว้ในเครื่องนี้เท่านั้น · อ่านอย่างเดียว</span>
      </div>
      ${sampleMode ? `<div class="jr-banner">${ic('info', 15)}กำลังแสดง<b>ข้อมูลตัวอย่าง</b> — ไม่ใช่บัญชีของคุณ</div>` : ''}`;
  }

  function emptyHtml() {
    const st = (raw && raw.status) || {}, m = ((typeof connStatus !== 'undefined' && connStatus) || {}).mt5 || {};
    const src = S.source;
    let h, p, act = '';
    if (!vcg.journalGet) { h = 'ผลการเทรดใช้ได้ในแอปบนคอม (Mac / Windows)'; p = 'แอปจะอ่านประวัติการเทรดจาก MT5 ในเครื่องของคุณ — บนมือถือ/เว็บดูตัวอย่างได้'; }
    else if (st.state === 'old-ea' || (m.connected && m.eaVersion && m.eaVersion < 2)) { h = 'ต้องอัปเดต EA ใน MT5'; p = 'EA รุ่นนี้ยังส่งประวัติการเทรดไม่ได้ — ติดตั้ง EA ใหม่ (1.03) แล้ว compile อีกครั้ง'; act = `<button class="primary" data-a="guide">${ic('rocket', 15)}วิธีอัปเดต EA</button>`; }
    else if (src !== 'mt5') { h = 'เชื่อมต่อ MT5 เพื่อดูผลการเทรดของคุณ'; p = 'เลือก MT5 เป็นแหล่งราคาและติด EA PriceTrackerBridge — แอปจะดึงประวัติย้อนหลัง 1 ปีมาเก็บไว้ในเครื่องนี้'; act = `<button class="primary" data-a="guide">${ic('plug', 15)}ตัวช่วยเชื่อมต่อ MT5</button>`; }
    else if (!m.connected) { h = 'รอ EA ใน MT5 เชื่อมต่อ'; p = 'เปิด MT5 และกราฟที่ติด EA ไว้ แล้วกด "ซิงค์"'; }
    else if (st.state === 'backfill' || (raw && raw.syncing)) { h = 'กำลังดึงประวัติย้อนหลัง…'; p = st.msg || 'ครั้งแรกอาจใช้เวลาสักครู่'; }
    else { h = 'ยังไม่มีการเทรดที่ปิดแล้วในช่วงนี้'; p = 'ลองเลือกช่วงเวลา "ทั้งหมด" หรือกด "ซิงค์"'; }
    return `<div class="jr-empty">${ic('chart-column', 40)}<h3>${h}</h3><p>${p}</p><div class="jr-empty-a">${act}<button data-a="sample">${ic('sparkles', 15)}ดูตัวอย่าง</button></div></div>`;
  }

  function kpis(d) {
    const s = d.st, snap = raw && raw.snapshots && raw.snapshots[raw.snapshots.length - 1];
    const live = !sampleMode && typeof POSITIONS !== 'undefined' && POSITIONS.data && POSITIONS.data() && POSITIONS.data().acct;
    const bal = live ? live.balance : snap && snap.balance, eq = live ? live.equity : snap && snap.equity;
    const card = (k, label, val, sub, icon, c = '') => `<div class="jr-kpi ${k}"><div class="jr-kl">${ic(icon, 14)}${label}</div><div class="jr-kv ${c}">${val}</div><div class="jr-ks">${sub}</div></div>`;
    return `<div class="jr-kpis">
      ${card('big', 'กำไรสุทธิ', money(s.net), `กำไร ${money(s.gross, false)} · ขาดทุน ${money(-s.grossLoss, false)}`, 'banknote', cls(s.net))}
      ${card('', 'Win rate', pct(s.winRate), `ชนะ ${s.wins} · แพ้ ${s.losses}`, 'target')}
      ${card('', 'Profit factor', s.profitFactor === Infinity ? '∞' : s.profitFactor ? s.profitFactor.toFixed(2) : '—', 'กำไรรวม ÷ ขาดทุนรวม', 'scale', s.profitFactor >= 1 ? 'pos' : s.trades ? 'neg' : '')}
      ${card('', 'จำนวนเทรด', s.trades.toLocaleString(), `เฉลี่ยถือ ${dur(s.avgHoldSec)}`, 'list-checks')}
      ${card('', 'Lot รวม', s.lots.toFixed(2), `ค่าคอม ${money(s.commission, false)} · swap ${money(s.swap, false)}`, 'layers')}
      ${card('', 'Max drawdown', money(-s.maxDrawdown), s.maxDrawdownPct ? pct(s.maxDrawdownPct) + ' จากจุดสูงสุด' : 'จากเส้นกำไรที่ปิดแล้ว', 'trending-down', s.maxDrawdown ? 'neg' : '')}
      ${card('', 'Expectancy', money(s.expectancy), `ชนะเฉลี่ย ${money(s.avgWin)} · แพ้เฉลี่ย ${money(s.avgLoss)}`, 'sigma', cls(s.expectancy))}
      ${card('', 'Balance / Equity', bal != null ? money(bal, false) : '—', eq != null ? `Equity ${money(eq, false)}${d.open.length ? ` · เปิดอยู่ ${d.open.length}` : ''}` : 'อัปเดตเมื่อ MT5 เชื่อมต่อ', 'wallet')}
    </div>`;
  }

  function calendarHtml(d) {
    const k = calMonth || JOURNAL.monthKey(d.ts.length ? d.ts[d.ts.length - 1].close : nowS(), tz());
    calMonth = k;
    const y = +k.slice(0, 4), m = +k.slice(5, 7) - 1, first = new Date(Date.UTC(y, m, 1)), days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const lead = (first.getUTCDay() + 6) % 7;
    const byDay = new Map(d.allSt.byDay.map((g) => [g.key, g]));
    const monthDays = [...byDay.values()].filter((g) => g.key.startsWith(k));
    const mx = Math.max(1, ...monthDays.map((g) => Math.abs(g.net)));
    const tot = monthDays.reduce((s, g) => s + g.net, 0), n = monthDays.reduce((s, g) => s + g.n, 0);
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<div class="jr-cd blank"></div>');
    for (let dd = 1; dd <= days; dd++) {
      const key = `${k}-${String(dd).padStart(2, '0')}`, g = byDay.get(key), a = g ? 0.12 + 0.6 * Math.min(1, Math.abs(g.net) / mx) : 0;
      cells.push(`<button class="jr-cd ${g ? (g.net >= 0 ? 'pos' : 'neg') : ''} ${dayFilter === key ? 'sel' : ''}" data-day="${key}" ${g ? `style="--a:${a.toFixed(2)}"` : 'disabled'}>
        <i>${dd}</i>${g ? `<b>${money(g.net)}</b><small>${g.n} เทรด</small>` : ''}</button>`);
    }
    return `<div class="jr-card jr-cal"><div class="jr-ch"><b>${ic('calendar-days', 15)}ปฏิทินกำไร/ขาดทุน</b>
        <div class="jr-mnav"><button data-cm="-1" aria-label="เดือนก่อน">${ic('chevron-left', 16)}</button><span>${TH_MON[m]} ${y + 543}</span><button data-cm="1" aria-label="เดือนถัดไป">${ic('chevron-right', 16)}</button></div>
        <span class="jr-csum ${cls(tot)}">${money(tot)} · ${n} เทรด</span></div>
      <div class="jr-cgrid">${TH_WD.map((w) => `<div class="jr-wd">${w}</div>`).join('')}${cells.join('')}</div></div>`;
  }

  function monthlyHtml(d) {
    const by = new Map(d.allSt.byMonth.map((g) => [g.key, g]));
    const years = [...new Set(d.allSt.byMonth.map((g) => g.key.slice(0, 4)))].sort().reverse();
    if (!years.length) return '';
    const mx = Math.max(1, ...d.allSt.byMonth.map((g) => Math.abs(g.net)));
    return `<div class="jr-card jr-monthly"><div class="jr-ch"><b>${ic('table-2', 15)}รายเดือน</b></div><div class="jr-mt-wrap"><table class="jr-mt"><thead><tr><th></th>${TH_MON.map((x) => `<th>${x}</th>`).join('')}<th>รวม</th></tr></thead><tbody>
      ${years.map((y) => { let tot = 0; return `<tr><th>${+y + 543}</th>${TH_MON.map((_, i) => { const g = by.get(`${y}-${String(i + 1).padStart(2, '0')}`); if (g) tot += g.net;
        return g ? `<td class="${cls(g.net)}" style="--a:${(0.1 + 0.55 * Math.min(1, Math.abs(g.net) / mx)).toFixed(2)}" title="${g.n} เทรด · win ${pct(g.winRate, 0)}">${money(g.net)}</td>` : '<td class="none">—</td>'; }).join('')}<td class="tot ${cls(tot)}">${money(tot)}</td></tr>`; }).join('')}
      </tbody></table></div></div>`;
  }

  function barRows(list, label, max) {
    const mx = max || Math.max(1, ...list.map((g) => Math.abs(g.net)));
    return list.map((g) => `<div class="jr-br"><span class="jr-bl">${label(g)}</span><span class="jr-bt"><i class="${cls(g.net)}" style="width:${(Math.abs(g.net) / mx * 100).toFixed(1)}%"></i></span><span class="jr-bv ${cls(g.net)}">${money(g.net)}</span></div>`).join('');
  }
  function breakdownHtml(d) {
    const s = d.st;
    const sym = `<div class="jr-card"><div class="jr-ch"><b>${ic('coins', 15)}ตาม Symbol</b></div><table class="jr-tbl sm"><thead><tr><th>Symbol</th><th>เทรด</th><th>Win</th><th>Lot</th><th>สุทธิ</th></tr></thead><tbody>
      ${s.bySymbol.map((g) => `<tr data-sym="${esc(g.key)}"><td><b>${esc(g.key)}</b></td><td>${g.n}</td><td>${pct(g.winRate, 0)}</td><td>${g.lots.toFixed(2)}</td><td class="${cls(g.net)}">${money(g.net)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">—</td></tr>'}</tbody></table></div>`;
    const side = (k) => s.bySide.find((g) => g.key === k) || { n: 0, net: 0, winRate: 0, lots: 0 };
    const b = side('buy'), sl = side('sell');
    const sides = `<div class="jr-card"><div class="jr-ch"><b>${ic('arrow-up-down', 15)}Buy vs Sell</b></div>
      <div class="jr-sides"><div class="buy"><small>${ic('trending-up', 14)}Buy</small><b class="${cls(b.net)}">${money(b.net)}</b><span>${b.n} เทรด · win ${pct(b.winRate, 0)} · ${b.lots.toFixed(2)} lot</span></div>
      <div class="sell"><small>${ic('trending-down', 14)}Sell</small><b class="${cls(sl.net)}">${money(sl.net)}</b><span>${sl.n} เทรด · win ${pct(sl.winRate, 0)} · ${sl.lots.toFixed(2)} lot</span></div></div>
      <div class="jr-sub">ช่วงตลาด (เวลาเปิดออเดอร์)</div>${barRows(['asia', 'london', 'newyork'].map((k) => s.bySession.find((g) => g.key === k) || { key: k, net: 0, n: 0 }), (g) => `${SESS[g.key]} <small>${g.n}</small>`)}</div>`;
    const wd = [0, 1, 2, 3, 4, 5, 6].map((i) => s.byWeekday.find((g) => g.key === i) || { key: i, net: 0, n: 0 }).filter((g) => g.key < 5 || g.n);
    const hmx = Math.max(1, ...s.byHour.map((g) => Math.abs(g.net)));
    const hours = Array.from({ length: 24 }, (_, h) => s.byHour.find((g) => g.key === h) || { key: h, net: 0, n: 0 });
    const time = `<div class="jr-card"><div class="jr-ch"><b>${ic('clock', 15)}วันและเวลาที่เทรด</b></div>${barRows(wd, (g) => `${TH_WD[g.key]} <small>${g.n}</small>`)}
      <div class="jr-sub">รายชั่วโมง (เวลากราฟ)</div><div class="jr-hours">${hours.map((g) => `<i class="${g.n ? cls(g.net) : 'none'}" style="--a:${g.n ? (0.15 + 0.7 * Math.abs(g.net) / hmx).toFixed(2) : 0}" title="${String(g.key).padStart(2, '0')}:00 · ${g.n} เทรด · ${money(g.net)}"></i>`).join('')}</div>
      <div class="jr-hlab"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
      <div class="jr-sub">สถิติอื่น</div><div class="jr-facts">
        <span>ชนะติดกันสูงสุด<b>${s.maxConsecWins}</b></span><span>แพ้ติดกันสูงสุด<b>${s.maxConsecLosses}</b></span>
        <span>ไม้ที่ดีที่สุด<b class="pos">${money(s.largestWin)}</b></span><span>ไม้ที่แย่ที่สุด<b class="neg">${money(s.largestLoss)}</b></span>
        <span>วันที่ดีที่สุด<b class="pos">${s.bestDay ? money(s.bestDay.net) : '—'}</b></span><span>วันที่แย่ที่สุด<b class="neg">${s.worstDay ? money(s.worstDay.net) : '—'}</b></span></div></div>`;
    return `<div class="jr-row3">${sym}${sides}${time}</div>`;
  }

  function tradesHtml(d) {
    let ts = d.ts.slice();
    if (dayFilter) ts = d.allSt && d.all.filter((t) => t.closed && JOURNAL.dayKey(t.close, tz()) === dayFilter);
    if (filt.s) ts = ts.filter((t) => t.s === filt.s);
    if (filt.side) ts = ts.filter((t) => t.side === filt.side);
    if (filt.res) ts = ts.filter((t) => (filt.res === 'win' ? t.net > 0 : t.net < 0));
    const key = { close: (t) => t.close, s: (t) => t.s, side: (t) => t.side, vol: (t) => t.vol, dur: (t) => t.duration || 0, net: (t) => t.net }[sort.k] || ((t) => t.close);
    ts.sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * sort.dir);
    const per = 15, pages = Math.max(1, Math.ceil(ts.length / per)); page = Math.min(page, pages - 1);
    const rows = ts.slice(page * per, page * per + per);
    const syms = [...new Set(d.all.filter((t) => t.closed).map((t) => t.s))].sort();
    const th = (k, l) => `<th data-sort="${k}" class="${sort.k === k ? 'on' : ''}">${l}${sort.k === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    const when = (t) => new Date((t + tz()) * 1000).toISOString().slice(5, 16).replace('T', ' ').replace('-', '/');
    const sum = ts.reduce((s, t) => s + t.net, 0);
    return `<div class="jr-card jr-trades" id="jr-trades"><div class="jr-ch"><b>${ic('list', 15)}รายการเทรด</b>
        ${dayFilter ? `<span class="jr-chip">${esc(dayFilter)}<button data-a="clearday" aria-label="ล้างวัน">${ic('x', 12)}</button></span>` : ''}
        <div class="jr-filters">${ic('filter', 14)}<select data-f="s"><option value="">ทุก Symbol</option>${syms.map((x) => `<option ${filt.s === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
          <select data-f="side"><option value="">Buy + Sell</option><option value="buy" ${filt.side === 'buy' ? 'selected' : ''}>Buy</option><option value="sell" ${filt.side === 'sell' ? 'selected' : ''}>Sell</option></select>
          <select data-f="res"><option value="">ชนะ + แพ้</option><option value="win" ${filt.res === 'win' ? 'selected' : ''}>ชนะ</option><option value="loss" ${filt.res === 'loss' ? 'selected' : ''}>แพ้</option></select></div></div>
      <div class="jr-tw"><table class="jr-tbl"><thead><tr>${th('close', 'ปิดเมื่อ')}${th('s', 'Symbol')}${th('side', 'ฝั่ง')}${th('vol', 'Lot')}<th>เข้า → ออก</th>${th('dur', 'ถือ')}${th('net', 'สุทธิ')}</tr></thead><tbody>
      ${rows.map((t) => `<tr data-pos="${t.pos}" title="ดูบนกราฟ"><td>${when(t.close)}</td><td><b>${esc(t.s)}</b>${t.partial ? ' <small class="muted">แบ่งปิด</small>' : ''}</td><td><span class="jr-side ${t.side}">${t.side === 'buy' ? 'Buy' : 'Sell'}</span></td><td>${t.vol.toFixed(2)}</td>
        <td class="px">${t.openPrice != null ? +t.openPrice.toFixed(5) : '—'} → ${t.closePrice != null ? +t.closePrice.toFixed(5) : '—'}</td><td>${dur(t.duration)}</td><td class="${cls(t.net)}"><b>${money(t.net)}</b></td></tr>`).join('') || '<tr><td colspan="7" class="muted jr-none">ไม่มีรายการ</td></tr>'}
      </tbody></table></div>
      <div class="jr-pager"><span>${ts.length} รายการ · รวม <b class="${cls(sum)}">${money(sum)}</b></span><span class="jr-pg"><button data-pg="-1" ${page ? '' : 'disabled'} aria-label="ก่อนหน้า">${ic('chevron-left', 15)}</button>${page + 1} / ${pages}<button data-pg="1" ${page < pages - 1 ? '' : 'disabled'} aria-label="ถัดไป">${ic('chevron-right', 15)}</button></span></div></div>`;
  }

  function render() {
    if (!raw) { root.innerHTML = shell() + '<div class="jr-empty">' + ic('loader-circle', 28, 'spin') + '</div>'; bind(); return; }
    const d = compute(); lastData = d;
    const has = d.all.some((t) => t.closed);
    disposeCharts();
    root.innerHTML = `<div class="jr-in">${shell()}${!has ? emptyHtml() : `${kpis(d)}
      <div class="jr-row2"><div class="jr-card jr-eq"><div class="jr-ch"><b>${ic('chart-area', 15)}Balance (จากเทรดที่ปิดแล้ว)</b><span class="jr-legend"><i class="dep"></i>ฝาก/ถอน</span></div><div class="jr-chart" id="jr-eq"></div></div>
        ${calendarHtml(d)}</div>
      <div class="jr-row2b"><div class="jr-card"><div class="jr-ch"><b>${ic('chart-column', 15)}กำไร/ขาดทุนรายวัน</b></div><div class="jr-chart sm" id="jr-daily"></div></div>${monthlyHtml(d)}</div>
      ${breakdownHtml(d)}${tradesHtml(d)}`}</div>`;
    bind();
    const tok = ++drawToken;
    if (has) requestAnimationFrame(() => { if (tok === drawToken) drawCharts(d); });
  }

  // ------------------------------------------------------------ charts (lightweight-charts)
  function disposeCharts() { for (const c of charts) { try { c.remove(); } catch (_) {} } charts = []; }
  function drawCharts(d) {
    const LW = LightweightCharts, c = TC(), opt = { autoSize: true, ...chartThemeOptions(11), handleScroll: false, handleScale: false,
      rightPriceScale: { borderColor: c.border }, timeScale: { borderColor: c.border, timeVisible: false } };
    const eqEl = $('jr-eq');
    if (eqEl) {
      const ch = LW.createChart(eqEl, opt); charts.push(ch);
      const s = ch.addSeries(LW.AreaSeries, { lineColor: '#2962ff', topColor: '#2962ff40', bottomColor: '#2962ff05', lineWidth: 2, priceLineVisible: false });
      const pts = []; let last = -Infinity;
      for (const p of d.st.curve) { const t = Math.max(p.time + tz(), last + 1); last = t; pts.push({ time: t, value: p.balance }); }
      s.setData(pts);
      if (LW.createSeriesMarkers) LW.createSeriesMarkers(s, pts.filter((_, i) => d.st.curve[i].op).map((p, i0) => ({ time: p.time, position: 'belowBar', shape: 'circle', color: '#f5a623', text: '' })));
      ch.timeScale().fitContent();
    }
    const dEl = $('jr-daily');
    if (dEl) {
      const ch = LW.createChart(dEl, opt); charts.push(ch);
      const s = ch.addSeries(LW.HistogramSeries, { priceLineVisible: false, lastValueVisible: false });
      s.setData(d.st.byDay.map((g) => ({ time: g.key, value: g.net, color: g.net >= 0 ? c.up || '#26a69a' : c.down || '#ef5350' })));
      ch.timeScale().fitContent();
    }
  }

  // ------------------------------------------------------------ events
  function bind() {
    root.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { range = b.dataset.r; store.set('jr.range', range); page = 0; dayFilter = null; calMonth = null;
      if (range === 'custom' && !custom) { const t = new Date().toISOString().slice(0, 10); custom = { from: t.slice(0, 8) + '01', to: t }; store.set('jr.custom', custom); } render(); }));
    root.querySelectorAll('[data-c]').forEach((i) => (i.onchange = () => { custom = { ...(custom || {}), [i.dataset.c]: i.value }; store.set('jr.custom', custom); render(); }));
    root.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => act(b.dataset.a)));
    root.querySelectorAll('[data-cm]').forEach((b) => (b.onclick = () => { const [y, m] = calMonth.split('-').map(Number), dt = new Date(Date.UTC(y, m - 1 + +b.dataset.cm, 1)); calMonth = dt.toISOString().slice(0, 7); render(); }));
    root.querySelectorAll('[data-day]').forEach((b) => (b.onclick = () => { dayFilter = dayFilter === b.dataset.day ? null : b.dataset.day; page = 0; render(); if (dayFilter) $('jr-trades')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    root.querySelectorAll('[data-f]').forEach((s) => (s.onchange = () => { filt[s.dataset.f] = s.value; page = 0; render(); }));
    root.querySelectorAll('[data-sort]').forEach((h) => (h.onclick = () => { const k = h.dataset.sort; sort = { k, dir: sort.k === k ? -sort.dir : -1 }; render(); }));
    root.querySelectorAll('[data-pg]').forEach((b) => (b.onclick = () => { page += +b.dataset.pg; render(); }));
    root.querySelectorAll('tr[data-sym]').forEach((r) => (r.onclick = () => { filt.s = r.dataset.sym; page = 0; render(); $('jr-trades')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    root.querySelectorAll('tr[data-pos]').forEach((r) => (r.onclick = () => { const t = lastData && lastData.all.find((x) => String(x.pos) === r.dataset.pos); if (t) showOnChart(t); }));
    const x = root.querySelector('.jr-close'); if (x) x.onclick = () => close();
  }
  async function act(a) {
    if (a === 'sample') { sampleMode = !sampleMode; store.set('jr.sample', sampleMode); raw = null; render(); await load(); render(); }
    else if (a === 'sync') {
      if (!vcg.journalSync) return;
      raw = { ...raw, syncing: true }; render();
      try { const r = await vcg.journalSync(); toast(r.state === 'error' ? r.msg : r.added ? `ซิงค์แล้ว +${r.added} รายการ` : 'ซิงค์แล้ว — ไม่มีรายการใหม่', r.state === 'error' ? 'warn' : 'ok'); } catch (e) { toast('ซิงค์ไม่สำเร็จ: ' + e.message, 'warn'); }
      await load(); render();
    } else if (a === 'csv') {
      const text = JOURNAL.csv(lastData ? lastData.ts : []);
      if (vcg.journalExport && !sampleMode) { const p = await vcg.journalExport(text); if (p) toast('บันทึกแล้ว: ' + p, 'ok'); }
      else { const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' })), aEl = document.createElement('a'); aEl.href = url; aEl.download = 'trades.csv'; aEl.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
    } else if (a === 'clearday') { dayFilter = null; render(); }
    else if (a === 'guide') { if (typeof SETUP !== 'undefined') SETUP.open('mt5', 3); }
  }

  // open the trade on the main chart: its symbol, a timeframe that fits its duration, entry/exit arrows
  function showOnChart(t) {
    const sec = t.duration || 3600, tfi = Math.max(0, TFS.findIndex((x) => x.label === (sec < 3 * 3600 ? '5m' : sec < 2 * 86400 ? '1H' : '4H')));
    if (mobile) close(); else PAGES.activate('chart');
    const sym = sampleMode ? S.symbol : t.s;
    if (sym !== S.symbol) switchSymbol(sym);
    if (S.tf !== tfi) { const b = document.querySelector(`#tfs button[data-t="${tfi}"]`); if (b) b.click(); }
    window.dispatchEvent(new CustomEvent('journal-trade', { detail: { pos: t.pos, s: sym, tf: TFS[tfi].label } }));
    const span = TFS[tfi].sec, start = Date.now();
    (function place() {
      const c = S.candles || [];
      const ready = c.length > 1 && c[c.length - 1].time - c[c.length - 2].time === span && (t.open == null || c[0].time <= t.open + tz());
      if (!ready && Date.now() - start < 4000) return setTimeout(place, 250);
      const snap = (time) => { let best = null; for (const x of c) { if (x.time <= time) best = x.time; else break; } return best ?? (c[0] && c[0].time); };
      PT.drawings = drawings.filter((x) => x.by !== 'journal');
      const color = t.side === 'buy' ? '#2962ff' : '#e91e63';
      if (t.open != null && t.openPrice != null) drawings.push({ id: 'jr-in-' + t.pos, type: t.side === 'buy' ? 'arrowUp' : 'arrowDown', pts: [{ time: snap(t.open + tz()), price: t.openPrice }], color, by: 'journal' });
      if (t.close != null && t.closePrice != null) drawings.push({ id: 'jr-out-' + t.pos, type: 'text', pts: [{ time: snap(t.close + tz()), price: t.closePrice }], text: `ปิด ${money(t.net)}`, color: t.net >= 0 ? '#26a69a' : '#ef5350', by: 'journal' });
      PT.dirty = true;
      try { if (c.length && t.close) chart.timeScale().setVisibleRange({ from: (t.open ?? t.close) + tz() - span * 40, to: t.close + tz() + span * 20 }); } catch (_) {}
    })();
  }

  // ------------------------------------------------------------ page plumbing
  let shown = false;
  async function open() {
    if (mobile) {
      if (PT.LEARN && PT.LEARN.isOpen && PT.LEARN.isOpen()) PT.LEARN.close();
      if (PT.NEWSPAGE && PT.NEWSPAGE.isOpen && PT.NEWSPAGE.isOpen()) PT.NEWSPAGE.close();
      if (PT.DASH && document.body.classList.contains('dash-open')) PT.DASH.close();
      root.classList.remove('hidden'); document.body.classList.add('jr-open');
    }
    else PAGES.open('journal');
    shown = true; await load(); render();
  }
  function close() {
    shown = false; disposeCharts();
    if (mobile) { root.classList.add('hidden'); document.body.classList.remove('jr-open'); return; }
    if (PAGES.active() === 'journal') PAGES.activate('chart');
  }
  const visible = () => (mobile ? !root.classList.contains('hidden') : PAGES.active && PAGES.active() === 'journal');
  if (mobile) {
    document.body.appendChild(root);
    const prevBack = PT.__mobileBack;
    PT.__mobileBack = () => { if (visible()) { close(); return true; } return prevBack ? prevBack() : false; };
  } else {
    const btn = document.createElement('button');
    btn.id = 'journal-btn'; btn.className = 'ib'; btn.title = 'ผลการเทรด — สรุปกำไร/ขาดทุน รายวัน รายเดือน จาก MT5 (Ctrl/⌘ + J)';
    btn.innerHTML = ic('wallet', 16);
    btn.onclick = () => (visible() ? close() : open());
    const anchor = $('dash-btn') || $('theme-btn'); if (anchor) anchor.before(btn);
    PAGES.register('journal', 'ผลการเทรด', root, inner('wallet'));
    // full width while the journal is shown: fold the side panel, restore it when back on the chart
    let sideWas = null;
    window.addEventListener('pagechange', (e) => {
      if (!PT.setUI || !S.ui) return;
      if (e.detail === 'journal' && sideWas === null) { sideWas = !!S.ui.side; if (sideWas) PT.setUI('side', false); }
      else if (e.detail === 'chart' && sideWas !== null) { if (sideWas) PT.setUI('side', true); sideWas = null; }
    });
    window.addEventListener('pagechange', (e) => { btn.classList.toggle('on', e.detail === 'journal'); if (e.detail === 'journal' && !shown) { shown = true; load().then(render); } else if (e.detail !== 'journal' && shown) { shown = false; disposeCharts(); } });
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'j' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); btn.click(); }
    });
  }
  if (vcg.onJournal) vcg.onJournal(() => { if (visible() && !sampleMode) load().then(render); });
  if (typeof THEME !== 'undefined' && THEME.onChange) THEME.onChange(() => { if (visible() && raw) render(); });
  // keep "sync" state fresh while the page is open (backfill progress)
  setInterval(() => { if (visible() && !sampleMode && raw && raw.status && raw.status.state === 'backfill') load().then(render); }, 3000);

  return { open, close, render, isOpen: visible, sample: (on) => { sampleMode = !!on; store.set('jr.sample', sampleMode); raw = null; return load().then(render); },
    setRange: (r) => { range = r; store.set('jr.range', r); page = 0; dayFilter = null; calMonth = null; render(); }, data: () => lastData, showOnChart };
})();
