import { PT, def } from './src/pt.ts';
import { toast } from './src/ui/toast.ts';
import { AN, BOUNCE } from './src/legacy/core.ts';
import { $, DOWN, S, TC, TFS, THEME, TZ, UP, esc, store } from './app-core.js';
import { chartThemeOptions } from './app-chart.js';
import { connStatus, dedupe, renderAlerts, switchSymbol, toCandle, valid } from './app-data.js';
import { DEMO, NEWS } from './extras.js';
import { HEADLINES } from './news.js';
import { POSITIONS } from './positions.js';
import { PAGES } from './pages.js';
def({ DASH: [() => DASH] });
// Dashboard: a page of widgets — several live charts (any symbol / timeframe), quotes, my MT5 orders, news, calendar,
// session clock, bounce zones, alerts and notes. Widgets are added from a catalog, dragged to reorder, resized,
// and saved as named layouts. Icons: Lucide (ISC license, https://lucide.dev) as inline SVG.
const DASH = (() => {
  const mobile = document.body.classList.contains('mobile');
  const svg = (d, s = 16, cls = '') => `<svg class="${cls}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    grid: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    chart: '<path d="M9 5v4"/><rect width="4" height="6" x="7" y="9" rx="1"/><path d="M9 15v2"/><path d="M17 3v2"/><rect width="4" height="8" x="15" y="5" rx="1"/><path d="M17 13v3"/><path d="M3 3v16a2 2 0 0 0 2 2h16"/>',
    quotes: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    news: '<path d="M15 18h-5"/><path d="M18 14h-8"/><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="10" y="6" rx="1"/>',
    cal: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
    note: '<path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    grip: '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
    gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2"/>',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    up: '<path d="m18 15-6-6-6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
    open: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    resize: '<path d="M21 15v6h-6"/><path d="m21 21-7-7"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
  };
  const tfOf = (type) => TFS.find((t) => t.type === +type) || TFS.find((t) => t.label === '1H') || TFS[0];
  const guessDigits = (s) => S.digits[s] ?? (/JPY/.test(s) ? 3 : /^(XAU|XAG|BTC|ETH|SOL|BNB|US30|NAS|SPX|GER)/.test(s) ? 2 : /^[A-Z]{6}/.test(s) ? 5 : 2);
  const fx = (v, d) => (v == null || !isFinite(v) ? '—' : Number(v).toFixed(d));
  const base = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const quote = (s) => S.quotes[s] || S.quotes[String(s).toUpperCase()] || Object.entries(S.quotes).find(([k]) => base(k) === base(s))?.[1] || null;
  const uid = () => 'w' + Math.random().toString(36).slice(2, 9);
  const W12 = [3, 4, 6, 8, 12];

  // ------------------------------------------------------------ widget catalog
  const TYPES = {
    chart: { name: 'กราฟ', icon: IC.chart, desc: 'แท่งเทียนสดของ symbol ใดก็ได้ เลือก timeframe ได้ · กดชื่อเพื่อเปิดในกราฟหลัก', w: 6, h: 2, opts: () => ({ symbol: S.symbol, tf: 3 }) },
    quotes: { name: 'ราคา (Watchlist)', icon: IC.quotes, desc: 'Bid / Ask / % เปลี่ยนแปลง พร้อมเส้นราคาย่อ', w: 4, h: 2, opts: () => ({ symbols: '' }) },
    positions: { name: 'ออเดอร์ของฉัน (MT5)', icon: IC.wallet, desc: 'Balance / Equity และโพซิชันที่เปิดอยู่ — อ่านอย่างเดียว', w: 4, h: 2, opts: () => ({}) },
    news: { name: 'ข่าวตลาด', icon: IC.news, desc: 'หัวข้อข่าวล่าสุดจาก FXStreet, Investing, Fed, ECB', w: 4, h: 2, opts: () => ({ relevant: false }) },
    calendar: { name: 'ปฏิทินเศรษฐกิจ', icon: IC.cal, desc: 'ข่าวสำคัญที่กำลังจะมา (High impact)', w: 4, h: 1, opts: () => ({}) },
    sessions: { name: 'ช่วงตลาด (Session)', icon: IC.clock, desc: 'Sydney / Tokyo / London / New York เปิด–ปิด และเวลาที่เหลือ', w: 4, h: 1, opts: () => ({}) },
    bounce: { name: 'จุดเด้ง', icon: IC.target, desc: 'โซนซื้อ/ขายเด่นของ symbol ที่เลือก (Order block, FVG, S/R)', w: 4, h: 2, opts: () => ({ symbol: S.symbol, tf: 3 }) },
    alerts: { name: 'แจ้งเตือนราคา', icon: IC.bell, desc: 'การแจ้งเตือนราคาทั้งหมดทุก symbol', w: 4, h: 1, opts: () => ({}) },
    notes: { name: 'โน้ต', icon: IC.note, desc: 'จดแผนเทรด / สิ่งที่ต้องดูวันนี้ (เก็บในเครื่อง)', w: 4, h: 1, opts: () => ({}) },
  };
  const mk = (type, w, h, opts = {}) => ({ id: uid(), type, w: w ?? TYPES[type].w, h: h ?? TYPES[type].h, opts: { ...TYPES[type].opts(), ...opts } });
  const PRESETS = {
    'ทองคำ': () => [mk('chart', 6, 2, { symbol: 'XAUUSD', tf: 3 }), mk('chart', 6, 2, { symbol: 'XAUUSD', tf: 2 }), mk('chart', 4, 2, { symbol: 'EURUSD', tf: 3 }), mk('chart', 4, 2, { symbol: 'BTCUSD', tf: 3 }),
      mk('quotes', 4, 2, { symbols: 'XAUUSD, EURUSD, BTCUSD' }), mk('sessions', 4, 1), mk('news', 8, 1)],
    'Forex หลัก': () => [mk('chart', 6, 2, { symbol: 'EURUSD', tf: 3 }), mk('chart', 6, 2, { symbol: 'GBPUSD', tf: 3 }), mk('chart', 4, 2, { symbol: 'USDJPY', tf: 3 }), mk('chart', 4, 2, { symbol: 'AUDUSD', tf: 3 }),
      mk('quotes', 4, 2, { symbols: 'EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD' }), mk('calendar', 6, 1), mk('sessions', 6, 1)],
    'คริปโต': () => [mk('chart', 8, 2, { symbol: 'BTCUSD', tf: 3 }), mk('quotes', 4, 2, { symbols: 'BTCUSD, ETHUSD, SOLUSD, XRPUSD' }), mk('chart', 4, 2, { symbol: 'ETHUSD', tf: 3 }),
      mk('chart', 4, 2, { symbol: 'SOLUSD', tf: 3 }), mk('news', 4, 2)],
  };
  let cfg = store.get('dash.layout', null);
  if (!cfg || !cfg.layouts || !Object.keys(cfg.layouts).length) cfg = { cur: 'ทองคำ', layouts: { 'ทองคำ': PRESETS['ทองคำ']() } };
  if (!cfg.layouts[cfg.cur]) cfg.cur = Object.keys(cfg.layouts)[0];
  const layout = () => cfg.layouts[cfg.cur];
  const save = () => store.set('dash.layout', cfg);

  // ------------------------------------------------------------ data feeds (one chart-history "slot" per symbol+tf)
  const MAX = 6, feeds = new Map(), cache = new Map();
  const freeSlot = () => { const used = new Set([...feeds.values()].map((f) => f.slot)); for (let i = 1; i <= MAX; i++) if (!used.has('w' + i)) return 'w' + i; return null; };
  function request(f) {
    f.pending = true; f.err = ''; f.src = S.source; f.at = Date.now();
    const req = { symbol: f.sym, candleType: f.tf, to: new Date().toISOString(), inclusive: true, limit: 400, slot: f.slot };
    try { if (S.source === 'demo') DEMO.requestChart(req); else vcg.requestChart(req); } catch (e) { f.err = e.message; }
  }
  function acquire(sym, tf, wid) {
    const key = sym + '|' + tf;
    let f = feeds.get(key);
    if (!f) {
      const slot = freeSlot(); if (!slot) return null;
      f = { key, sym, tf: +tf, slot, candles: cache.get(key) || [], subs: new Set(), pending: true, err: '', at: 0, src: S.source };
      feeds.set(key, f); request(f);
    }
    f.subs.add(wid); return f;
  }
  function release(wid) { for (const [k, f] of feeds) { f.subs.delete(wid); if (!f.subs.size) { if (f.candles.length) cache.set(k, f.candles); feeds.delete(k); } } }
  function onMsg(m) {
    if (!m) return;
    const f = [...feeds.values()].find((x) => x.slot === m.slot); if (!f) return;
    if (m.type === 'chartError') { f.err = (m.data && m.data.message) || 'โหลดไม่สำเร็จ'; f.pending = false; return notify(f); }
    if (m.type !== 'chart' || !m.data) return;
    const d = m.data, sym = d.symbol || (d.history && d.history.symbol);
    if (sym && base(sym) !== base(f.sym)) return;                        // an older request on this slot
    if (d.history && d.history.candles) {
      const arr = dedupe(d.history.candles.map(toCandle).filter(valid).sort((a, b) => a.time - b.time));
      if (!arr.length) { f.err = 'ไม่มีข้อมูล'; f.pending = false; return notify(f); }
      f.candles = arr; f.pending = false; f.err = ''; f.at = Date.now(); notify(f, true);
    } else if (d.updates && d.updates.candles && !f.pending) {
      for (const c of d.updates.candles.map(toCandle).filter(valid)) upsert(f, c);
      f.at = Date.now(); notify(f);
    }
  }
  function upsert(f, c) {
    const a = f.candles, last = a[a.length - 1]; if (!last || c.time < last.time) return;
    if (c.time > last.time) { a.push(c); if (a.length > 1500) a.shift(); } else a[a.length - 1] = c;
  }
  function tickFeeds() {                         // build the forming candle from live quotes
    for (const f of feeds.values()) {
      if (f.src !== S.source) { request(f); continue; }
      const q = quote(f.sym), a = f.candles;
      if (q && a.length && !f.pending) {
        const sec = tfOf(f.tf).sec, t = Math.floor(Date.parse(q.time) / 1000) + TZ, start = Math.floor((t - TZ) / sec) * sec + TZ, last = a[a.length - 1];
        if (start > last.time) upsert(f, { time: start, open: q.bid, high: q.bid, low: q.bid, close: q.bid });
        else if (start === last.time) { last.close = q.bid; last.high = Math.max(last.high, q.bid); last.low = Math.min(last.low, q.bid); }
        notify(f);
      } else if (!f.pending && Date.now() - f.at > 60000) request(f);     // no live quote for this symbol: refresh every minute
      else if (f.pending && Date.now() - f.at > 20000 && !f.err) { f.err = 'ยังไม่ได้ข้อมูล — กำลังลองใหม่'; notify(f); request(f); }
    }
  }
  const views = new Map();                       // widget id → { update(f, full), destroy() }
  function notify(f, full) { for (const id of f.subs) { const v = views.get(id); if (v && v.update) v.update(f, full); } }

  // ------------------------------------------------------------ widget views
  const sparks = new Map();                      // symbol → recent bids (1/s)
  function chartView(w, body) {
    const o = w.opts, dg = () => guessDigits(o.symbol);
    body.innerHTML = '<div class="wd-cv"></div><div class="wd-msg">กำลังโหลด…</div>';
    const host = body.querySelector('.wd-cv'), msg = body.querySelector('.wd-msg');
    const ch = LightweightCharts.createChart(host, { autoSize: true, ...chartThemeOptions(10),
      timeScale: { borderColor: TC().border, timeVisible: +o.tf < 5, secondsVisible: false, rightOffset: 4, barSpacing: 6 },
      rightPriceScale: { borderColor: TC().border, scaleMargins: { top: 0.12, bottom: 0.08 } }, handleScale: { axisPressedMouseMove: false } });
    const ser = ch.addSeries(LightweightCharts.CandlestickSeries, { upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN,
      priceFormat: { type: 'price', precision: dg(), minMove: 1 / 10 ** dg() } });
    let shown = 0;
    const f = acquire(o.symbol, o.tf, w.id);
    if (!f) msg.textContent = `กราฟสดได้สูงสุด ${MAX} กราฟพร้อมกัน — ลบกราฟอื่นก่อน`;
    function update(feed, full) {
      if (feed.err && !feed.candles.length) { msg.textContent = feed.err; msg.classList.remove('hidden'); return; }
      if (!feed.candles.length) return;
      msg.classList.add('hidden');
      if (full || !shown) { ser.setData(feed.candles.slice(-400)); shown = feed.candles.length; ch.timeScale().scrollToRealTime(); }
      else ser.update(feed.candles[feed.candles.length - 1]);
      head(feed);
    }
    function head(feed) {
      const a = feed.candles, last = a[a.length - 1], q = quote(o.symbol), d = dg();
      const px = q ? q.bid : last && last.close;
      let ch2 = q && q.changePct != null ? q.changePct : null;
      if (ch2 == null && a.length > 1) { const dayStart = a.find((c) => c.time >= Math.floor((last.time - TZ) / 86400) * 86400 + TZ) || a[0]; ch2 = ((last.close - dayStart.open) / dayStart.open) * 100; }
      const el = document.querySelector(`.wd[data-id="${w.id}"] .wd-px`);
      if (el) el.innerHTML = `<b>${fx(px, d)}</b><span class="${ch2 > 0 ? 'up' : ch2 < 0 ? 'down' : ''}">${ch2 == null ? '' : (ch2 >= 0 ? '+' : '') + ch2.toFixed(2) + '%'}</span>`;
    }
    if (f && f.candles.length) update(f, true);
    const theme = () => { ch.applyOptions(chartThemeOptions(10)); ser.applyOptions({ upColor: UP, downColor: DOWN, wickUpColor: UP, wickDownColor: DOWN }); };
    return { update, theme, destroy() { release(w.id); try { ch.remove(); } catch (_) {} } };
  }
  function sparkSvg(arr, wpx = 56, hpx = 20) {
    if (!arr || arr.length < 2) return `<svg width="${wpx}" height="${hpx}"></svg>`;
    const lo = Math.min(...arr), hi = Math.max(...arr), r = hi - lo || 1;
    const pts = arr.map((v, i) => `${((i / (arr.length - 1)) * wpx).toFixed(1)},${(hpx - 2 - ((v - lo) / r) * (hpx - 4)).toFixed(1)}`).join(' ');
    const up = arr[arr.length - 1] >= arr[0];
    return `<svg width="${wpx}" height="${hpx}" class="spark ${up ? 'up' : 'down'}"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }
  const quoteSyms = (o) => (o.symbols ? o.symbols.split(/[\s,]+/).filter(Boolean) : S.symbols || []);
  function listView(w, body, html) { const paint = () => { const h = html(); if (h !== body._h) { body._h = h; body.innerHTML = h; } }; paint(); return { tick: paint }; }
  const VIEW = {
    chart: chartView,
    quotes: (w, body) => {
      const v = listView(w, body, () => {
        const syms = quoteSyms(w.opts);
        if (!syms.length) return '<p class="wd-empty">ยังไม่มี symbol — ตั้งค่า widget เพื่อเพิ่ม</p>';
        return `<table class="wd-q"><thead><tr><th>Symbol</th><th>Bid</th><th>Ask</th><th>%</th><th></th></tr></thead><tbody>${syms.map((s) => {
          const q = quote(s), d = q ? q.digits : guessDigits(s), p = q && q.changePct;
          return `<tr data-sym="${esc(s)}"><td><b>${esc(s)}</b></td><td>${fx(q && q.bid, d)}</td><td>${fx(q && q.ask, d)}</td><td class="${p > 0 ? 'up' : p < 0 ? 'down' : ''}">${p == null ? '—' : (p >= 0 ? '+' : '') + p.toFixed(2)}</td><td>${sparkSvg(sparks.get(s))}</td></tr>`;
        }).join('')}</tbody></table>`;
      });
      body.onclick = (e) => { const tr = e.target.closest('[data-sym]'); if (tr) openMain(tr.dataset.sym); };
      return v;
    },
    positions: (w, body) => listView(w, body, () => {
      if (S.source !== 'mt5') return '<p class="wd-empty">ใช้ได้เมื่อเลือก MT5 เป็นแหล่งราคา<br><small>อ่านออเดอร์ของคุณอย่างเดียว ส่งออเดอร์ไม่ได้</small></p>';
      const d = typeof POSITIONS !== 'undefined' && POSITIONS.data ? POSITIONS.data() : null;
      if (!d) return '<p class="wd-empty">รอข้อมูลบัญชีจาก EA…</p>';
      const a = d.acct || {}, fl = (a.equity || 0) - (a.balance || 0), m = (v) => (v >= 0 ? '+' : '') + Number(v).toFixed(2);
      return `<div class="wd-acct"><span>Balance<b>${fx(a.balance, 2)}</b></span><span>Equity<b>${fx(a.equity, 2)}</b></span><span>ลอยตัว<b class="${fl > 0 ? 'up' : fl < 0 ? 'down' : ''}">${m(fl)}</b></span></div>
        ${d.positions.length ? `<table class="wd-q"><tbody>${d.positions.map((p) => `<tr data-sym="${esc(p.s)}"><td><b>${esc(p.s)}</b></td><td class="${p.side === 'buy' ? 'up' : 'down'}">${p.side === 'buy' ? 'Buy' : 'Sell'} ${p.vol}</td><td>${p.open}</td><td class="${p.profit > 0 ? 'up' : p.profit < 0 ? 'down' : ''}">${m(p.profit + p.swap)}</td></tr>`).join('')}</tbody></table>` : '<p class="wd-empty">ไม่มีโพซิชันเปิดอยู่</p>'}`;
    }),
    news: (w, body) => listView(w, body, () => {
      const list = typeof HEADLINES !== 'undefined' && HEADLINES.list ? HEADLINES.list({ relevant: !!w.opts.relevant, limit: 12 }) : [];
      if (!list.length) return '<p class="wd-empty">ยังไม่มีข่าว (กำลังโหลด)</p>';
      return `<ul class="wd-news">${list.map((n) => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a><small>${esc(n.source)} · ${ago(n.time)}</small></li>`).join('')}</ul>`;
    }),
    calendar: (w, body) => listView(w, body, () => {
      const ev = typeof NEWS !== 'undefined' && NEWS.upcoming ? NEWS.upcoming(8) : [];
      if (!ev.length) return '<p class="wd-empty">ไม่มีข่าวสำคัญที่กำลังจะมา</p>';
      return `<ul class="wd-cal">${ev.map((e) => `<li><span class="imp ${String(e.impact || '').toLowerCase()}"></span><b>${esc(e.when || '')}</b><span class="ccy">${esc(e.ccy || '')}</span><span class="t">${esc(e.title)}</span></li>`).join('')}</ul>`;
    }),
    sessions: (w, body) => listView(w, body, sessionsHtml),
    bounce: bounceView,
    alerts: (w, body) => {
      const v = listView(w, body, () => {
        const al = S.alerts || [];
        if (!al.length) return '<p class="wd-empty">ยังไม่มีแจ้งเตือน — ตั้งได้ที่แท็บราคา</p>';
        return `<ul class="wd-al">${al.map((a) => `<li class="${a.fired ? 'fired' : ''}"><b>${esc(a.symbol)}</b><span>${a.dir === 'down' ? '≤' : '≥'} ${a.price}</span><small>${a.fired ? 'แจ้งแล้ว' : 'รอ'}</small><button class="wd-ib" data-rm="${a.id}" title="ลบ">${svg(IC.x, 13)}</button></li>`).join('')}</ul>`;
      });
      body.onclick = (e) => { const b = e.target.closest('[data-rm]'); if (!b) return; S.alerts = S.alerts.filter((a) => String(a.id) !== b.dataset.rm); store.set('alerts', S.alerts); if (typeof renderAlerts === 'function') renderAlerts(); v.tick(); };
      return v;
    },
    notes: (w, body) => {
      body.innerHTML = `<textarea class="wd-note" placeholder="แผนวันนี้: รอราคาย่อมาโซน… / ข่าว CPI 19:30 / ไม่เทรดก่อนข่าว">${esc(store.get('dash.note.' + w.id, ''))}</textarea>`;
      const t = body.querySelector('textarea'); t.oninput = () => store.set('dash.note.' + w.id, t.value);
      return {};
    },
  };
  function ago(iso) { const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)); return m < 60 ? m + ' นาที' : m < 1440 ? Math.round(m / 60) + ' ชม.' : Math.round(m / 1440) + ' วัน'; }
  const SESS = [['Sydney', 'Australia/Sydney', 7, 16], ['Tokyo', 'Asia/Tokyo', 9, 18], ['London', 'Europe/London', 8, 17], ['New York', 'America/New_York', 8, 17]];
  function localHour(zone, d = new Date()) { const p = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(d); const g = (t) => p.find((x) => x.type === t)?.value; return { h: +g('hour') + +g('minute') / 60, wd: g('weekday') }; }
  function sessionsHtml() {
    const now = new Date();
    const rows = SESS.map(([n, z, o, c]) => {
      const { h, wd } = localHour(z, now), weekend = wd === 'Sat' || wd === 'Sun', open = !weekend && h >= o && h < c;
      const left = open ? c - h : (h < o ? o - h : 24 - h + o), hm = `${Math.floor(left)}:${String(Math.round((left % 1) * 60)).padStart(2, '0')}`;
      const pct = open ? ((h - o) / (c - o)) * 100 : 0;
      return `<li class="${open ? 'open' : ''}"><b>${n}</b><span class="bar"><i style="width:${pct.toFixed(0)}%"></i></span><small>${weekend ? 'ปิดเสาร์–อาทิตย์' : open ? 'เปิด · ปิดใน ' + hm : 'ปิด · เปิดใน ' + hm}</small></li>`;
    }).join('');
    return `<div class="wd-clock">${now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}<small>เวลาเครื่อง</small></div><ul class="wd-sess">${rows}</ul>`;
  }
  function bounceView(w, body) {
    const o = w.opts; let lastRun = 0, res = null;
    body.innerHTML = '<p class="wd-empty">กำลังโหลดแท่งเทียน…</p>';
    const f = acquire(o.symbol, o.tf, w.id);
    if (!f) body.innerHTML = `<p class="wd-empty">ใช้ข้อมูลสดได้สูงสุด ${MAX} ชุด — ลบกราฟอื่นก่อน</p>`;
    function compute(feed) {
      const c = feed.candles.slice(0, -1); if (c.length < 80) return null;
      const d = guessDigits(o.symbol), q = quote(o.symbol);
      try {
        const A = AN.analyze(c, { swingLen: 5, digits: d, rr1: 1, rr2: 2, slBuf: 0.2, minSamples: 5, maxBars: 30 });
        return BOUNCE.find(c, A, { F: (v) => fx(v, d), price: q ? (q.bid + q.ask) / 2 : c[c.length - 1].close, slBuf: 0.2, rr1: 1, rr2: 2, maxBars: 30 });
      } catch (e) { return { err: e.message }; }
    }
    function update(feed) {
      if (feed.err && !feed.candles.length) { body.innerHTML = `<p class="wd-empty">${esc(feed.err)}</p>`; return; }
      if (Date.now() - lastRun < 10000 && res) return;
      lastRun = Date.now(); res = compute(feed);
      if (!res) { body.innerHTML = '<p class="wd-empty">ข้อมูลยังไม่พอ</p>'; return; }
      if (res.err) { body.innerHTML = `<p class="wd-empty">คำนวณไม่สำเร็จ: ${esc(res.err)}</p>`; return; }
      const d = guessDigits(o.symbol), row = (z, side) => `<li class="${side}"><span class="tag">${side === 'buy' ? 'ซื้อ' : 'ขาย'}</span><b>${fx(z.lo, d)}–${fx(z.hi, d)}</b>
        <small>${esc(z.label || z.typeName || z.type || '')}${z.status ? ' · ' + esc(z.status) : ''}</small><span class="stars">${'★'.repeat(Math.max(0, Math.min(5, z.stars || 0)))}</span></li>`;
      const b = (res.buy || []).slice(0, 3).map((z) => row(z, 'buy')).join(''), s = (res.sell || []).slice(0, 3).map((z) => row(z, 'sell')).join('');
      body.innerHTML = b || s ? `<ul class="wd-bz">${s}${q2(res.price, d)}${b}</ul>` : '<p class="wd-empty">ยังไม่พบโซนเด่น</p>';
    }
    const q2 = (p, d) => `<li class="px"><span>ราคา</span><b>${fx(p, d)}</b></li>`;
    if (f && f.candles.length) update(f);
    return { update, destroy() { release(w.id); } };
  }

  // ------------------------------------------------------------ DOM
  const root = document.createElement('div'); root.id = 'dashboard'; root.className = 'dash' + (mobile ? ' m-full hidden' : '');
  root.innerHTML = `<div class="dash-top">
      ${mobile ? `<button class="wd-ib dash-back" title="กลับ">${svg(IC.back, 20)}</button>` : ''}
      <b class="dash-title">${svg(IC.grid, 18)}แดชบอร์ด</b>
      <select class="dash-layout" title="ชุดเลย์เอาต์"></select>
      <span class="grow"></span>
      <button class="dash-btn dash-add">${svg(IC.plus)}<span>เพิ่ม widget</span></button>
      <button class="dash-btn dash-edit">${svg(IC.pencil)}<span>แก้ไขเลย์เอาต์</span></button>
    </div>
    <div class="dash-main"><div class="dash-grid"></div>
      <aside class="dash-cat hidden"><div class="cat-h"><b>เพิ่ม widget</b><button class="wd-ib cat-x" title="ปิด">${svg(IC.x)}</button></div><div class="cat-list"></div></aside></div>
    <div class="wd-pop hidden"></div>`;
  const grid = root.querySelector('.dash-grid'), cat = root.querySelector('.dash-cat'), pop = root.querySelector('.wd-pop');
  let editing = false, active = false;

  function renderLayoutSel() {
    const sel = root.querySelector('.dash-layout');
    sel.innerHTML = Object.keys(cfg.layouts).map((n) => `<option ${n === cfg.cur ? 'selected' : ''}>${esc(n)}</option>`).join('')
      + '<option disabled>──────</option><option value="__new">+ บันทึกเป็นชุดใหม่…</option>'
      + Object.keys(PRESETS).map((n) => `<option value="__p:${esc(n)}">ชุดสำเร็จรูป: ${esc(n)}</option>`).join('')
      + (Object.keys(cfg.layouts).length > 1 ? '<option value="__del">ลบชุดนี้</option>' : '');
  }
  // inline "name the new layout" field next to the layout picker
  function askLayoutName() {
    const sel = root.querySelector('.dash-layout'); if (root.querySelector('.dash-newname')) return root.querySelector('.dash-newname input').focus();
    const f = document.createElement('form'); f.className = 'dash-newname';
    f.innerHTML = '<input maxlength="40" placeholder="ชื่อชุดเลย์เอาต์ใหม่" value="ชุดของฉัน"><button class="primary">บันทึก</button><button type="button" data-x>ยกเลิก</button>';
    sel.after(f); sel.classList.add('hidden');
    const inp = f.querySelector('input'); inp.focus(); inp.select();
    const done = () => { f.remove(); sel.classList.remove('hidden'); };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') done(); });
    f.querySelector('[data-x]').onclick = done;
    f.onsubmit = (e) => {
      e.preventDefault(); const n = inp.value.trim(); if (!n) return inp.focus();
      cfg.layouts[n] = layout().map((x) => ({ ...x, id: uid(), opts: { ...x.opts } })); cfg.cur = n; done(); save(); renderLayoutSel(); build();
    };
  }
  root.querySelector('.dash-layout').onchange = (e) => {
    const v = e.target.value;
    if (v === '__new') { renderLayoutSel(); askLayoutName(); return; }   // window.prompt() does not exist in the desktop app: ask inline
    else if (v === '__del') { if (confirm(`ลบชุด "${cfg.cur}"?`)) { delete cfg.layouts[cfg.cur]; cfg.cur = Object.keys(cfg.layouts)[0]; } }
    else if (v.startsWith('__p:')) { const n = v.slice(4); cfg.layouts[n] = PRESETS[n](); cfg.cur = n; }
    else cfg.cur = v;
    save(); renderLayoutSel(); build();
  };

  function widgetEl(w) {
    const T = TYPES[w.type], el = document.createElement('section');
    el.className = 'wd wd-' + w.type; el.dataset.id = w.id;
    const span = mobile ? 12 : w.w;
    el.style.gridColumn = `span ${span}`; el.style.gridRow = `span ${w.h}`;
    const sym = w.opts.symbol ? `<button class="wd-sym" title="เปิดในกราฟหลัก">${esc(w.opts.symbol)}</button><span class="wd-tf">${tfOf(w.opts.tf).label}</span><span class="wd-px"></span>` : '';
    el.innerHTML = `<header class="wd-h">
        <span class="wd-drag" title="ลากเพื่อย้าย">${svg(IC.grip, 14)}</span>
        <span class="wd-ic">${svg(T.icon, 14)}</span>${sym || `<b class="wd-name">${esc(w.opts.title || T.name)}</b>`}
        <span class="grow"></span>
        ${mobile ? `<button class="wd-ib wd-mv" data-mv="-1" title="เลื่อนขึ้น">${svg(IC.up, 14)}</button><button class="wd-ib wd-mv" data-mv="1" title="เลื่อนลง">${svg(IC.down, 14)}</button>` : ''}
        <button class="wd-ib wd-set" title="ตั้งค่า widget">${svg(IC.gear, 14)}</button>
        <button class="wd-ib wd-rm" title="ลบ widget">${svg(IC.x, 14)}</button>
      </header><div class="wd-b"></div>${mobile ? '' : `<span class="wd-rs" title="ลากเพื่อปรับขนาด">${svg(IC.resize, 12)}</span>`}`;
    return el;
  }
  const mounted = new Set();
  function mountWidget(w, el) {
    if (mounted.has(w.id)) return;
    mounted.add(w.id);
    const v = VIEW[w.type] ? VIEW[w.type](w, el.querySelector('.wd-b')) : {};
    views.set(w.id, v);
  }
  function unmountAll() { for (const [id, v] of views) { try { v.destroy && v.destroy(); } catch (_) {} views.delete(id); } mounted.clear(); }
  let io = null;
  function build() {
    unmountAll(); grid.innerHTML = '';
    if (io) io.disconnect();
    io = 'IntersectionObserver' in window ? new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting && active) { const w = layout().find((x) => x.id === e.target.dataset.id); if (w) mountWidget(w, e.target); } }), { root: null, rootMargin: '200px' }) : null;
    for (const w of layout()) {
      const el = widgetEl(w); grid.appendChild(el);
      if (io) io.observe(el); else if (active) mountWidget(w, el);
    }
    if (!layout().length) grid.innerHTML = `<div class="dash-empty">${svg(IC.grid, 40)}<b>ยังไม่มี widget</b><p>กด "เพิ่ม widget" เพื่อเลือกกราฟ ราคา ข่าว และอื่น ๆ</p><button class="dash-btn primary dash-add2">${svg(IC.plus)}<span>เพิ่ม widget</span></button></div>`;
    root.classList.toggle('editing', editing);
  }
  function mountVisible() { if (!active) return; grid.querySelectorAll('.wd').forEach((el) => { const r = el.getBoundingClientRect(); if (r.bottom > -200 && r.top < innerHeight + 200) { const w = layout().find((x) => x.id === el.dataset.id); if (w) mountWidget(w, el); } }); }
  function rebuildOne(w) {
    const old = grid.querySelector(`.wd[data-id="${w.id}"]`); const v = views.get(w.id);
    if (v && v.destroy) v.destroy(); views.delete(w.id); mounted.delete(w.id);
    const el = widgetEl(w); old.replaceWith(el); if (io) io.observe(el); mountWidget(w, el);
  }

  // ------------------------------------------------------------ catalog
  function renderCat() {
    root.querySelector('.cat-list').innerHTML = Object.entries(TYPES).map(([k, t]) => `<button class="cat-item" data-add="${k}">
      <span class="cat-prev cat-prev-${k}">${svg(t.icon, 22)}</span><span class="cat-t"><b>${t.name}</b><small>${t.desc}</small></span><span class="cat-plus">${svg(IC.plus, 16)}</span></button>`).join('');
  }
  function add(type, opts) {
    const w = mk(type, undefined, undefined, opts); layout().push(w); save(); build();
    const el = grid.querySelector(`.wd[data-id="${w.id}"]`); if (el) { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); mountWidget(w, el); }
    toast(`เพิ่ม ${TYPES[type].name} แล้ว`, 'ok', 1800);
    return w;
  }
  function remove(id) { const i = layout().findIndex((x) => x.id === id); if (i < 0) return; const [w] = layout().splice(i, 1); try { localStorage.removeItem('dash.note.' + id); } catch (_) {} save(); const v = views.get(id); if (v && v.destroy) v.destroy(); views.delete(id); mounted.delete(id); const el = grid.querySelector(`.wd[data-id="${id}"]`); if (el) el.remove(); if (!layout().length) build(); return w; }
  function duplicate(id) { const i = layout().findIndex((x) => x.id === id); if (i < 0) return; const w = { ...layout()[i], id: uid(), opts: { ...layout()[i].opts } }; layout().splice(i + 1, 0, w); save(); build(); }

  // ------------------------------------------------------------ settings popover
  function openPop(id, anchor) {
    const w = layout().find((x) => x.id === id); if (!w) return;
    const T = TYPES[w.type], o = w.opts;
    const symList = [...new Set([...(S.symbols || []), ...(((typeof connStatus !== 'undefined' && connStatus.mt5) || {}).symbols || []), 'XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSD', 'ETHUSD'])];
    pop.innerHTML = `<div class="pop-h">${svg(T.icon, 15)}<b>${T.name}</b><button class="wd-ib pop-close">${svg(IC.x, 14)}</button></div>
      ${'symbol' in o ? `<label>Symbol<input class="p-sym" list="dash-syms" value="${esc(o.symbol)}"></label><datalist id="dash-syms">${symList.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>` : ''}
      ${'tf' in o ? `<label>Timeframe<span class="seg">${TFS.map((t) => `<button data-tf="${t.type}" class="${+o.tf === t.type ? 'on' : ''}">${t.label}</button>`).join('')}</span></label>` : ''}
      ${'symbols' in o ? `<label>Symbols (คั่นด้วย ,)<input class="p-syms" value="${esc(o.symbols)}" placeholder="ว่าง = ใช้ watchlist"></label>` : ''}
      ${'relevant' in o ? `<label class="chk"><input type="checkbox" class="p-rel" ${o.relevant ? 'checked' : ''}> เฉพาะข่าวที่เกี่ยวกับ symbol ปัจจุบัน</label>` : ''}
      ${mobile ? '' : `<label>ขนาด<span class="seg">${[['S', 3], ['M', 4], ['L', 6], ['XL', 8], ['เต็ม', 12]].map(([n, v]) => `<button data-w="${v}" class="${w.w === v ? 'on' : ''}">${n}</button>`).join('')}</span></label>`}
      <label>ความสูง<span class="seg">${[1, 2, 3].map((v) => `<button data-h="${v}" class="${w.h === v ? 'on' : ''}">${v === 1 ? 'เตี้ย' : v === 2 ? 'กลาง' : 'สูง'}</button>`).join('')}</span></label>
      <div class="pop-act"><button class="p-dup">${svg(IC.copy, 14)}ทำซ้ำ</button><button class="p-rm danger">${svg(IC.trash, 14)}ลบ</button><span class="grow"></span><button class="p-ok primary">${svg(IC.check, 14)}ตกลง</button></div>`;
    pop.classList.remove('hidden'); pop.dataset.id = id;
    const r = anchor.getBoundingClientRect(), rr = root.getBoundingClientRect();
    pop.style.top = Math.min(r.bottom - rr.top + 4, rr.height - pop.offsetHeight - 8) + 'px';
    pop.style.left = Math.max(8, Math.min(r.right - rr.left - pop.offsetWidth, rr.width - pop.offsetWidth - 8)) + 'px';
    const apply = () => {
      const before = JSON.stringify(w);
      const sy = pop.querySelector('.p-sym'); if (sy && sy.value.trim()) o.symbol = sy.value.trim().toUpperCase().replace(/\s+/g, '');
      const ss = pop.querySelector('.p-syms'); if (ss) o.symbols = ss.value.trim().toUpperCase();
      const rl = pop.querySelector('.p-rel'); if (rl) o.relevant = rl.checked;
      if (JSON.stringify(w) !== before) { save(); rebuildOne(w); }
    };
    pop.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tf) { o.tf = +b.dataset.tf; pop.querySelectorAll('[data-tf]').forEach((x) => x.classList.toggle('on', x === b)); save(); rebuildOne(w); }
      else if (b.dataset.w) { w.w = +b.dataset.w; pop.querySelectorAll('[data-w]').forEach((x) => x.classList.toggle('on', x === b)); save(); const el = grid.querySelector(`.wd[data-id="${w.id}"]`); if (el) el.style.gridColumn = `span ${w.w}`; }
      else if (b.dataset.h) { w.h = +b.dataset.h; pop.querySelectorAll('[data-h]').forEach((x) => x.classList.toggle('on', x === b)); save(); const el = grid.querySelector(`.wd[data-id="${w.id}"]`); if (el) el.style.gridRow = `span ${w.h}`; }
      else if (b.classList.contains('p-dup')) { closePop(); duplicate(id); }
      else if (b.classList.contains('p-rm')) { closePop(); remove(id); }
      else if (b.classList.contains('p-ok') || b.classList.contains('pop-close')) { apply(); closePop(); }
    };
    pop.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { apply(); closePop(); } }));
  }
  function closePop() { pop.classList.add('hidden'); pop.innerHTML = ''; }

  // ------------------------------------------------------------ drag to reorder, drag corner to resize (pointer events)
  let drag = null;
  grid.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.wd-drag'), rs = e.target.closest('.wd-rs');
    if (!h && !rs) return;
    const el = e.target.closest('.wd'); if (!el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    if (rs) {
      const w = layout().find((x) => x.id === el.dataset.id), gs = getComputedStyle(grid);
      const colPx = (grid.clientWidth - parseFloat(gs.columnGap || 0) * 11) / 12, rowPx = parseFloat(gs.gridAutoRows) || 150;
      drag = { mode: 'resize', el, w, x: e.clientX, y: e.clientY, w0: r.width, h0: r.height, colPx, rowPx };
    } else {
      el.classList.add('dragging'); root.classList.add('is-dragging');
      drag = { mode: 'move', el, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
      el.style.width = r.width + 'px';
    }
    try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (drag.mode === 'resize') {
      const want = (drag.w0 + e.clientX - drag.x) / drag.colPx, cols = W12.reduce((b, v) => (Math.abs(v - want) < Math.abs(b - want) ? v : b), 12);
      const rows = Math.max(1, Math.min(3, Math.round((drag.h0 + e.clientY - drag.y) / drag.rowPx)));
      if (cols !== drag.w.w || rows !== drag.w.h) { drag.w.w = cols; drag.w.h = rows; drag.el.style.gridColumn = `span ${cols}`; drag.el.style.gridRow = `span ${rows}`; }
      return;
    }
    drag.moved = true;
    const el = drag.el;
    // where would it go? the widget under the pointer (ignoring the dragged one)
    el.style.pointerEvents = 'none';
    const under = document.elementFromPoint(e.clientX, e.clientY), tgt = under && under.closest('.dash-grid .wd');
    el.style.pointerEvents = '';
    if (tgt && tgt !== el) {
      const tr = tgt.getBoundingClientRect(), after = e.clientY > tr.bottom - tr.height / 3 || (e.clientX > tr.left + tr.width / 2 && e.clientY > tr.top + tr.height / 3);
      const ref = after ? tgt.nextSibling : tgt;
      if (ref !== el && el.nextSibling !== ref) grid.insertBefore(el, ref);
    }
    const nr = el.getBoundingClientRect(), tx = el.style.transform.match(/-?[\d.]+/g) || [0, 0];
    const bx = nr.left - +tx[0], by = nr.top - +tx[1];
    el.style.transform = `translate(${e.clientX - drag.dx - bx}px, ${e.clientY - drag.dy - by}px)`;
  });
  function endDrag() {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.mode === 'move') {
      d.el.classList.remove('dragging'); root.classList.remove('is-dragging'); d.el.style.transform = ''; d.el.style.width = '';
      const order = [...grid.querySelectorAll('.wd')].map((x) => x.dataset.id), L = layout();
      L.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    }
    save();
  }
  window.addEventListener('pointerup', endDrag); window.addEventListener('pointercancel', endDrag);
  function move(id, dir) {          // mobile up/down
    const L = layout(), i = L.findIndex((x) => x.id === id), j = i + dir; if (i < 0 || j < 0 || j >= L.length) return;
    [L[i], L[j]] = [L[j], L[i]]; save();
    const el = grid.querySelector(`.wd[data-id="${id}"]`), other = grid.querySelector(`.wd[data-id="${L[i].id}"]`);
    if (dir < 0) grid.insertBefore(el, other); else grid.insertBefore(other, el);
  }

  // ------------------------------------------------------------ events
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const wd = b.closest('.wd');
    if (b.classList.contains('dash-add') || b.classList.contains('dash-add2')) { renderCat(); cat.classList.toggle('hidden'); }
    else if (b.classList.contains('cat-x')) cat.classList.add('hidden');
    else if (b.dataset.add) { add(b.dataset.add); if (mobile) cat.classList.add('hidden'); }
    else if (b.classList.contains('dash-edit')) setEdit(!editing);
    else if (b.classList.contains('dash-back')) close();
    else if (wd && b.classList.contains('wd-rm')) remove(wd.dataset.id);
    else if (wd && b.classList.contains('wd-set')) openPop(wd.dataset.id, b);
    else if (wd && b.dataset.mv) move(wd.dataset.id, +b.dataset.mv);
    else if (wd && b.classList.contains('wd-sym')) openMain(layout().find((x) => x.id === wd.dataset.id).opts.symbol, layout().find((x) => x.id === wd.dataset.id).opts.tf);
  });
  document.addEventListener('pointerdown', (e) => { if (!pop.classList.contains('hidden') && !pop.contains(e.target) && !e.target.closest('.wd-set')) closePop(); });
  function setEdit(on) {
    editing = on; root.classList.toggle('editing', on);
    const b = root.querySelector('.dash-edit'); b.classList.toggle('on', on);
    b.innerHTML = on ? `${svg(IC.check)}<span>เสร็จ</span>` : `${svg(IC.pencil)}<span>แก้ไขเลย์เอาต์</span>`;
    if (!on) cat.classList.add('hidden');
  }
  function openMain(sym, tf) {
    if (sym && sym !== S.symbol) switchSymbol(sym);
    if (tf != null) { const b = document.querySelector(`#tfs button[data-t="${tf}"]`); if (b && !b.classList.contains('active')) b.click(); }
    if (mobile) close(); else PAGES.activate('chart');
  }

  // live refresh: feeds + list widgets, only while the dashboard is visible
  setInterval(() => {
    for (const s of new Set(layout().filter((w) => w.type === 'quotes').flatMap((w) => quoteSyms(w.opts)))) {
      const q = quote(s); if (!q) continue; const a = sparks.get(s) || []; if (a[a.length - 1] !== q.bid || a.length < 2) { a.push(q.bid); if (a.length > 90) a.shift(); sparks.set(s, a); }
    }
    if (!active) return;
    tickFeeds();
    for (const [id, v] of views) if (v.tick) v.tick(id);
  }, 1000);
  THEME.onChange(() => { for (const v of views.values()) if (v.theme) v.theme(); });

  // ------------------------------------------------------------ open / close (desktop page tab, mobile overlay)
  let sideWas = null;
  function setActive(on) {
    if (on === active) return; active = on;
    // give the widgets the whole width: fold the side panel while the dashboard is open, restore it after
    if (!mobile && PT.setUI && S.ui) {
      if (on) { sideWas = !!S.ui.side; if (sideWas) PT.setUI('side', false); }
      else if (sideWas) { PT.setUI('side', true); sideWas = null; }
    }
    if (on) { if (!grid.children.length) build(); requestAnimationFrame(mountVisible); }
  }
  function open() {
    if (mobile) { root.classList.remove('hidden'); document.body.classList.add('dash-open'); setActive(true); return; }
    PAGES.open('dashboard');
  }
  function close() {
    if (mobile) { root.classList.add('hidden'); document.body.classList.remove('dash-open'); setActive(false); return; }
    PAGES.activate('chart');
  }
  renderLayoutSel();
  if (mobile) document.body.appendChild(root);
  else {
    PAGES.register('dashboard', 'แดชบอร์ด', root, IC.grid);
    window.addEventListener('pagechange', (e) => setActive(e.detail === 'dashboard'));
    setActive(PAGES.active() === 'dashboard');
    // titlebar button
    const tb = $('theme-btn'), btn = document.createElement('button');
    btn.id = 'dash-btn'; btn.className = 'ib'; btn.title = 'แดชบอร์ด — หลายกราฟ + widget (Ctrl/⌘ + D)'; btn.innerHTML = svg(IC.grid, 16);
    btn.onclick = () => (PAGES.active() === 'dashboard' ? close() : open());
    if (tb) tb.before(btn);
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); btn.click(); }
    });
  }
  build();
  return { open, close, onMsg, add, remove, layout, feeds: () => [...feeds.values()].map((f) => ({ sym: f.sym, tf: f.tf, slot: f.slot, n: f.candles.length, err: f.err })),
    setEdit, isActive: () => active, cfg: () => cfg, PRESETS: Object.keys(PRESETS), TYPES: Object.keys(TYPES) };
})();
