import { def } from '../pt';
import { showWatchlist, quoteWatchlist, showAlerts } from '../ui/tabs/market-view';
import { ui } from '../ui/registry';
import { connStatus, setConnStatus } from '../state';
import { view } from '../state';
import { toast } from '../ui/toast';
import { ICON } from './icons';
import { $, S, TZ, esc, fmt, store, tf, qs, qsa } from './app-core';
import { askLine, buildIndicators, chart, displayData, main, priceFormat, refreshPriceLines, renderLegend, updateIndicators } from '../chart/chart';
import { renderAnalysis, runAnalysis } from './app-analysis';
import { bounceTick } from './app-bounce';
import { pages } from '../pages/registry';
import { mountTools, setTools } from '../ui/tabs/tools-view';
import { renderConnect as connectView, isConnecting } from '../ui/connect/connect';
import { emitChart, chartHooks } from '../chart/hooks';
import type { Quote } from '../main/types';
import type { ChartMsg } from '../main/types';
import type { Candle } from '../core/types';
def({ loadChart: [() => loadChart], onChartMsg: [() => onChartMsg], onQuotesMsg: [() => onQuotesMsg], renderConnect: [() => renderConnect], desktopNotify: [() => desktopNotify], beep: [() => beep] });
// Price Tracker renderer · data: chart loading, live quotes/watchlist, status, price alerts
// ---------------------------------------------------------------- data loading
let loadTimeout: ReturnType<typeof setTimeout> | undefined = undefined;
function loadChart() {
  S.candles = []; S.pendingHistory = true; S.loadingMore = false; S.noMore = false; S.A = null;
  if (main) main.setData([]);
  updateIndicators(); renderAnalysis();
  $('loading').textContent = 'กำลังโหลดกราฟ…'; $('loading').classList.remove('hidden');
  (S.source === 'demo' ? ui.demo!.requestChart : vcg.requestChart)({ symbol: S.symbol, candleType: tf().type, to: new Date().toISOString(), inclusive: true, limit: Math.max(200, Math.min(5000, +S.prefs.historyBars || 1500)) });
  if (ui.cache) ui.cache.restore();
  clearTimeout(loadTimeout);
  loadTimeout = setTimeout(() => { if (S.pendingHistory) { $('loading').textContent = 'ยังไม่ได้ข้อมูลกราฟ — ตรวจสอบว่า login แล้ว (เปิด WebTrader) หรือกด "เชื่อมต่อใหม่" · ดูรายละเอียดในแท็บ Log'; vcg.log('warn', `ยังไม่ได้แท่งเทียน ${S.symbol} ${tf().label} หลัง 12 วินาที`, null, 'chart'); } }, 12000);
  emitChart('load');
}
function loadMore() {
  if (S.replay) return;
  if (S.loadingMore || S.noMore || S.pendingHistory || !S.candles.length) return;
  S.loadingMore = true;
  const to = new Date((S.candles[0].time - TZ) * 1000 - 1000).toISOString();
  (S.source === 'demo' ? ui.demo!.requestChart : vcg.requestChart)({ symbol: S.symbol, candleType: tf().type, to, inclusive: false, limit: 1000 });
  setTimeout(() => { S.loadingMore = false; }, 8000);
}
const num = (v: { value: any; scale: any; }|null) => (v == null ? null : typeof v === 'object' ? ('value' in v ? Number(v.value) / 10 ** (v.scale || 0) : null) : Number(v));
const toCandle = (c: { timeSeconds?: any; time?: any; open: any; high: any; low: any; close: any; }): Candle => ({ time: Number(c.timeSeconds ?? c.time) + TZ, open: num(c.open)!, high: num(c.high)!, low: num(c.low)!, close: num(c.close)! });
const valid = (c: Candle) => isFinite(c.time) && c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0;
function dedupe(arr: Candle[]) { const out = []; for (const c of arr) { if (out.length && out[out.length - 1].time === c.time) out[out.length - 1] = c; else out.push(c); } return out; }

function setAllData() {
  if (!main) return;
  main.setData(displayData());
  updateIndicators();
  runAnalysis();
  renderLegend();
  pushChartData();
}
let pushChartTimer: ReturnType<typeof setTimeout> | undefined = undefined;
function pushChartData() {
  clearTimeout(pushChartTimer);
  pushChartTimer = setTimeout(() => (ui.cache && ui.cache.save(), vcg.pushChart({ symbol: S.symbol, timeframe: tf().label,
    candles: S.candles.map((c: { time: number; open: any; high: any; low: any; close: any; }) => ({ time: c.time - TZ, open: c.open, high: c.high, low: c.low, close: c.close })) })), 500);
}

function onChartMsg(m: ChartMsg) {
  if (m.type === 'chartAuthRenew') { if (S.pendingHistory) $('loading').textContent = 'token หมดอายุ — กำลังขอ token ใหม่และโหลดซ้ำ…'; else toast('ต่อ token ใหม่ให้กราฟแล้ว (token ของ VCG มีอายุ 15 นาที)', 'info'); return; }
  if (m.type === 'chartError') {
    const msg = (m.data && (m.data as { message?: string }).message) || JSON.stringify(m.data).slice(0, 200);
    if (S.candles.length && !S.pendingHistory) toast('กราฟ: ' + msg, 'warn');
    else { $('loading').textContent = 'โหลดกราฟไม่สำเร็จ: ' + msg + ' — กำลังลองใหม่'; $('loading').classList.remove('hidden'); }
    return;
  }
  if (m.type !== 'chart' || !m.data) return;
  const d = m.data as { symbol?: string; history?: { symbol?: string; candles?: any[] }; updates?: { candles?: any[] } };
  const sym = d.symbol || (d.history && d.history.symbol);
  if (sym && sym !== S.symbol) return;
  if (d.history && d.history.candles) {
    const arr = d.history.candles.map(toCandle).filter(valid).sort((a: { time: number; }, b: { time: number; }) => a.time - b.time);
    if (S.pendingHistory) {
      const q = S.quotes[S.symbol], lastC = arr[arr.length - 1];
      if (q && lastC && Math.abs(lastC.close - q.bid) / q.bid > 0.25) { vcg.log('warn', `ข้ามข้อมูลกราฟที่ไม่ตรงกับ ${S.symbol} (ราคา ${lastC.close} vs ${q.bid}) — น่าจะเป็นของ symbol ก่อนหน้า`, null, 'chart'); return; }
      S.pendingHistory = false; $('loading').classList.add('hidden');
      S.candles = dedupe(arr);
      vcg.log('info', `ได้แท่งเทียน ${S.symbol} ${tf().label} ${S.candles.length} แท่ง`, null, 'chart');
      setAllData();
      if (S.candles.length > 150) chart.timeScale().setVisibleLogicalRange({ from: S.candles.length - 150, to: S.candles.length + 10 });
      else chart.timeScale().fitContent();
      emitChart('loaded');
    } else if (S.loadingMore) {
      S.loadingMore = false;
      const older = arr.filter((c: { time: number; }) => c.time < S.candles[0].time);
      if (!older.length) { S.noMore = true; return; }
      const r = chart.timeScale().getVisibleLogicalRange();
      S.candles = older.concat(S.candles);
      if (S.candles.length > 20000) { S.noMore = true; }
      setAllData();
      if (r) chart.timeScale().setVisibleLogicalRange({ from: r.from + older.length, to: r.to + older.length });
    }
  }
  if (d.updates && d.updates.candles && !S.pendingHistory) d.updates.candles.map(toCandle).filter(valid).forEach(upsert);
}
vcg.onChart((m) => { if (S.source === 'demo') return; if (m.slot === 'mtf') { ui.mtf?.onMsg(m); } else if (m.slot && /^w\d/.test(m.slot)) { if (pages.dash) pages.dash.onMsg(m); } else onChartMsg(m); });

function upsert(c: { time: number; }) {
  if (S.replay) return;
  const cs = S.candles; if (!cs.length) return;
  const last = cs[cs.length - 1];
  if (c.time < last.time) { const i = cs.findIndex((x: { time: any; }) => x.time === c.time); if (i >= 0) { cs[i] = c; setAllData(); } return; }
  const isNew = c.time > last.time;
  if (isNew) cs.push(c); else cs[cs.length - 1] = c;
  pushLast(isNew);
}
function pushLast(isNew: boolean) {
  const cs = S.candles; const last = cs[cs.length - 1];
  if (!main || !last) return;
  if (S.ctype === 'ha') main.setData(displayData());
  else main.update(S.ctype === 'line' || S.ctype === 'area' ? { time: last.time, value: last.close } : last);
  if (isNew) { updateIndicators(); runAnalysis(); pushChartData(); } // a candle just closed
  else updateIndicators(true);
  view.dirty = true;
}
function tickToCandle(q: { bid: number|null; time: string; }) {
  if (S.replay) return;   // chart is frozen during Bar Replay
  const cs = S.candles; if (!cs.length || q.bid == null) return;
  const t = Math.floor(Date.parse(q.time) / 1000) + TZ;
  const last = cs[cs.length - 1]; const sec = tf().sec;
  if (sec <= 14400 && t >= last.time + sec) {
    const start = Math.floor((t - TZ) / sec) * sec + TZ;
    cs.push({ time: start, open: q.bid, high: q.bid, low: q.bid, close: q.bid });
    pushLast(true);
  } else {
    last.close = q.bid; last.high = Math.max(last.high, q.bid); last.low = Math.min(last.low, q.bid);
    pushLast(false);
  }
}
chart.timeScale().subscribeVisibleLogicalRangeChange((r: { from: number; }) => { view.dirty = true; if (r && r.from < 15) loadMore(); });

// ---------------------------------------------------------------- quotes / watchlist
// other modules (paper trading, …) add a hook instead of wrapping onQuotesMsg
const quoteHooks: any[] = [];
function onQuotes(fn: (...a: any[]) => unknown) { quoteHooks.push(fn); }
function onQuotesMsg(list: Quote[]|{ symbol: any; time: string; bid: number; ask: number; digits: number; spread: number; change: number; changePct: number; }[]) {
  let cur = null;
  for (const q of list) {
    S.quotes[q.symbol] = q;
    if (S.digits[q.symbol] !== q.digits) {
      S.digits[q.symbol] = q.digits;
      if (q.symbol === S.symbol && main) { main.applyOptions({ priceFormat: priceFormat() }); buildIndicators(); }
    }
    updateRow(q);
    checkAlerts(q);
    if (q.symbol === S.symbol) cur = q;
  }
  if (cur) {
    tickToCandle(cur);
    if (askLine && cur.ask != null) askLine.applyOptions({ price: cur.ask });
    else if (S.showAsk && !askLine) refreshPriceLines();
    updateHeader();
    bounceTick();
  }
  for (const h of quoteHooks) h(list);
}
vcg.onQuotes((list) => { if (S.source !== 'demo') onQuotesMsg(list); });
function updateHeader() {
  const q = S.quotes[S.symbol];
  $('cur-sym').textContent = S.symbol;
  $('cur-bid').textContent = q ? fmt(q.bid) : '—';
  const c = $('cur-chg');
  if (q && q.changePct != null) { c.textContent = `${q.change >= 0 ? '+' : ''}${fmt(q.change)} (${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%)`; c.className = q.change >= 0 ? 'up' : 'down'; }
  else c.textContent = '';
  document.title = q ? `${S.symbol} ${fmt(q.bid)} — Price Tracker` : 'Price Tracker';
}
const wlApi = { pick: (s: any) => switchSymbol(s), rm: (s: string) => vcg.removeSymbol(s), star: (s: string) => vcg.setTray(s), fmt };
function renderWatchlist() {
  showWatchlist({ symbols: S.symbols.slice(), sel: S.symbol, tray: S.traySymbol, quotes: { ...S.quotes } }, wlApi);
}
// per tick: patch just this symbol's row (Watchlist.svelte flashes the bid cell)
function updateRow(q: Quote) { quoteWatchlist(q); }
$('add-form').onsubmit = (e) => {
  e.preventDefault();
  const s = $('add-input').value.trim().toUpperCase(); if (!s) return;
  vcg.addSymbol(s); $('add-input').value = ''; switchSymbol(s);
};
function switchSymbol(s: unknown) {
  if (s === S.symbol) return;
  if (S.replay && ui.replay) ui.replay.exit();
  S.symbol = s; store.set('symbol', s);
  chartHooks.reloadDrawings?.(); S.selected = null; S.pending = null; S.measure = null;
  if (main) main.applyOptions({ priceFormat: priceFormat() });
  refreshPriceLines(); buildIndicators(); renderWatchlist(); renderAlerts(); updateHeader();
  if (ui.news) ui.news.render();
  if (ui.headlines) ui.headlines.render();
  if (S.source === 'demo' && ui.demo) ui.demo.connect();
  loadChart();
}

// ---------------------------------------------------------------- status
let lastConnected: boolean|null = null;
// ---------------------------------------------------------------- connect screen (shown until prices flow) → src/ui/connect
function connectAction(k: string|any[]) {
  if (k === 'login') { const ok: unknown = vcg.showTrader(); vcg.log('info', 'ผู้ใช้กดเข้าสู่ระบบ VCG จากหน้าเชื่อมต่อ', null, 'auth'); if (ok === false) toast('เปิดหน้า login ไม่ได้ — ดูแท็บ Log', 'error'); }
  else if (k === 'demo') ui.setSource?.('demo');
  else if (k === 'retry') { vcg.reloadTrader(); toast('กำลังเชื่อมต่อใหม่…', 'info'); setTimeout(loadChart, 8000); }
  else if (k === 'guide') ui.setup?.open();
  else if (k === 'mt5guide') ui.setup?.open('mt5', 0);
  else if (k === 'log') { $('connect').classList.add('hidden'); qs('#tabs [data-tab="log"]').click(); }
  else if (k === 'src:vcg' || k === 'src:mt5') { const src = k.slice(4); if (S.source !== src) ui.setSource?.(src); if (src === 'mt5') ui.setup?.open('mt5', 0); }
}
function renderConnect(st = connStatus) {
  connectView(st, { source: S.source, replay: !!S.replay, mobile: document.body.classList.contains('mobile'), desktopMt5: !!(vcg.capabilities && vcg.capabilities.mt5), onAction: connectAction });
}
setTimeout(() => renderConnect(), 2600);
setInterval(() => { if (isConnecting()) renderConnect(); }, 5000);   // flips to the "taking long" hint
vcg.onStatus((st) => {
  setConnStatus(st); renderConnect(st);
  const symChanged = JSON.stringify(st.symbols) !== JSON.stringify(S.symbols) || st.traySymbol !== S.traySymbol;
  S.symbols = st.symbols; S.traySymbol = st.traySymbol;
  if (symChanged) renderWatchlist();
  const inv = (st.invalid || []).join(',');
  if (inv !== S.invalidKey) {
    S.invalidKey = inv;
    qsa('#wl tr').forEach((tr) => { const bad = (st.invalid || []).includes(tr.dataset.s); tr.classList.toggle('invalid', bad); tr.title = bad ? 'ไม่พบ symbol นี้ใน VCG — ลองชื่ออื่น เช่น BTCUSD.x / BTCUSDT' : ''; });
    if (inv) toast(`ไม่พบใน VCG: ${inv} — ตรวจชื่อ symbol`, 'warn', 8000);
  }
  setTools({ csv: !!st.csv, api: st.api || { enabled: false } });
  if (S.source === 'mt5') {
    const m = st.mt5 || {};
    $('conn').classList.toggle('ok', !!m.connected);
    $('conn-text').textContent = m.connected ? `MT5: ${m.broker || 'เชื่อมต่อแล้ว'}` : `MT5: รอ EA (พอร์ต ${m.port || 7788})`;
    if (m.connected && S.mt5WasDown && S.pendingHistory) loadChart();
    // brokers often add a suffix (XAUUSD.m, XAUUSDm…) — switch to the name this MT5 actually has
    if (m.connected && (m.symbols || []).length && !m.symbols.includes(S.symbol)) {
      const base = S.symbol.replace(/[^A-Z]/g, '').slice(0, 6);
      const alt = m.symbols.find((x) => x.toUpperCase().replace(/[^A-Z]/g, '').startsWith(base));
      if (alt && alt !== S.symbol) { toast(`MT5 ใช้ชื่อ ${alt} แทน ${S.symbol}`, 'info', 8000); vcg.addSymbol(alt); switchSymbol(alt); }
    }
    S.mt5WasDown = !m.connected;
  }
  if (S.source === 'vcg') $('conn').classList.toggle('ok', st.connected);
  if (S.source === 'vcg') $('conn-text').textContent = st.connected ? 'เชื่อมต่อแล้ว' : st.loggedIn ? 'กำลังเชื่อมต่อ…' : 'ยังไม่ได้ login';
  // VCG: the main process re-sends the pending chart request itself once chart-history is ready, so no reload here
  // (reloading cleared the cached chart and repeated the analysis). MT5 handles its own reconnect above.
  if (st.connected && lastConnected === false && S.pendingHistory && S.source !== 'vcg') loadChart();
  lastConnected = st.connected;
});
mountTools({ toggleCsv: () => vcg.toggleCsv(), openCsv: () => vcg.openCsv(), showTrader: () => vcg.showTrader(), reload: () => { vcg.reloadTrader(); setTimeout(loadChart, 8000); } });

// ---------------------------------------------------------------- alerts
const alertApi = { fmt, rm: (id: any) => { S.alerts = S.alerts.filter((a: { id: any; }) => a.id !== id); store.set('alerts', S.alerts); renderAlerts(); refreshPriceLines(); } };
function renderAlerts() { showAlerts(S.symbol, S.alerts.filter((a: { symbol: any; }) => a.symbol === S.symbol), alertApi); }
function addAlert(price: number) {
  const q = S.quotes[S.symbol]; if (!isFinite(price)) return;
  const cur = q ? q.bid : (S.candles.slice(-1)[0] || {}).close;
  S.alerts.push({ id: Date.now(), symbol: S.symbol, price, dir: cur != null && price < cur ? 'down' : 'up', fired: false });
  store.set('alerts', S.alerts); renderAlerts(); refreshPriceLines();
  vcg.log('info', `ตั้ง alert ${S.symbol} @ ${price}`, null, 'alert');
}
$('alert-form').onsubmit = (e) => { e.preventDefault(); addAlert(parseFloat($('alert-input').value)); $('alert-input').value = ''; };
ui.notify = { desktop: (t, b) => desktopNotify(t, b), beep: () => beep() };
function desktopNotify(title: string, body: string) { if (S.prefs.desktop) try { new Notification(title, { body }); } catch (_: any) {} }
function beep() {
  if (!S.prefs.sound) return;
  try { const ac = new AudioContext(); [0, 0.25].forEach((t) => { const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(ac.destination); g.gain.setValueAtTime(0.2, ac.currentTime + t);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 0.2); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.2); }); } catch (_: any) {}
}
function checkAlerts(q: { symbol: any; bid: number|null; digits: any; ask: number|null; time: any; }) {
  let changed = false;
  for (const a of S.alerts) {
    if (a.fired || a.symbol !== q.symbol || q.bid == null) continue;
    if ((a.dir === 'up' && q.bid >= a.price) || (a.dir === 'down' && q.bid <= a.price)) {
      a.fired = true; changed = true;
      const title = `🔔 ${a.symbol} ${a.dir === 'up' ? 'ขึ้นถึง' : 'ลงถึง'} ${fmt(a.price, q.digits)}`;
      const body = `ราคาตอนนี้ Bid ${fmt(q.bid, q.digits)} / Ask ${fmt(q.ask, q.digits)}`;
      desktopNotify(title, body); beep();
      vcg.log('info', title, null, 'alert');
      vcg.notify('alert', { symbol: a.symbol, price: a.price, direction: a.dir, bid: q.bid, ask: q.ask, time: q.time }, `${title}\n${body}`);
    }
  }
  if (changed) { store.set('alerts', S.alerts); renderAlerts(); refreshPriceLines(); }
}
export { onQuotes, addAlert, beep, connStatus, dedupe, desktopNotify, loadChart, onChartMsg, onQuotesMsg, pushLast, renderAlerts, renderConnect, renderWatchlist, setAllData, switchSymbol, toCandle, updateHeader, valid };
