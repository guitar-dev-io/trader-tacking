import { PT, def } from './src/pt.ts';
import { toast } from './src/ui/toast.ts';
import { $, S, TZ, store } from './app-core.js';
import { main } from './src/chart/chart.ts';
import { connStatus, switchSymbol } from './app-data.js';
import { mount, flushSync } from 'svelte';
import Positions from './src/ui/tabs/Positions.svelte';
import { posView } from './src/ui/tabs/positions-view.ts';

def({ POSITIONS: [() => POSITIONS] });
// "My orders" (MT5, READ-ONLY): the EA reports the user's own open positions, pending orders and deal history.
// Shown in the ราคา tab and as lines/markers on the chart. Nothing here can place, change or close an order.
const POSITIONS = (() => {
  if (!vcg.mt5Positions) return { data: () => null };
  let data = null, subscribed = false, lines = [], linesFor = null, markersApi = null, deals = null, dealsSym = null, lastKey = '';
  const opt = { onChart: store.get('posOnChart', true), hist: store.get('posHist', false), days: store.get('posDays', 7) };
  const base = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const same = (a, b) => a && b && (a === b || a.toUpperCase() === b.toUpperCase() || base(a) === base(b));
  const money = (v, cur) => (v >= 0 ? '+' : '') + Number(v).toFixed(2) + (cur ? ' ' + cur : '');
  const ORD = { buy_limit: 'Buy Limit', sell_limit: 'Sell Limit', buy_stop: 'Buy Stop', sell_stop: 'Sell Stop', buy_stop_limit: 'Buy Stop Limit', sell_stop_limit: 'Sell Stop Limit' };

  function panel() {
    let el = $('positions-panel');
    if (!el) {
      const wl = $('wl'); if (!wl) return null;
      el = document.createElement('div'); el.id = 'positions-panel';
      const host = wl.closest('section,.sec,.card,.box') || wl.parentElement;
      host.insertAdjacentElement('afterend', el);
    }
    return el;
  }

  // ------------------------------------------------------------ panel (src/ui/tabs/Positions.svelte)
  let mounted = false;
  function setOpt(k, v) {
    opt[k] = v; store.set('pos' + k[0].toUpperCase() + k.slice(1), opt[k]);
    if (k !== 'onChart') { deals = null; if (opt.hist) loadDeals(); }
    lastKey = ''; render(); drawChart();
  }
  function render() {
    const el = panel(); if (!el) return;
    const show = S.source === 'mt5';
    el.classList.toggle('hidden', !show);
    if (!show) return;
    if (!mounted) { mounted = true; el.replaceChildren(); mount(Positions, { target: el, props: { onRow: (sym) => { if (!same(sym, S.symbol)) switchSymbol(sym); }, onOpt: setOpt } }); }
    posView.set({ data, deals, opt: { ...opt }, mt5: (connStatus || {}).mt5 || {}, same: (x) => same(x, S.symbol) }); flushSync();
  }

  // ------------------------------------------------------------ chart
  function clearChart() {
    for (const { s, l } of lines) { try { s.removePriceLine(l); } catch (_) {} }
    lines = [];
    if (markersApi) { try { markersApi.setMarkers([]); } catch (_) {} }
  }
  function drawChart() {
    if (typeof main === 'undefined' || !main) return;
    const key = JSON.stringify([S.symbol, opt.onChart, opt.hist, data && data.positions, data && data.orders, deals && deals.length, TZ]);
    if (key === lastKey && linesFor === main) return;
    clearChart(); lastKey = key;
    if (linesFor !== main) markersApi = null;
    linesFor = main;
    if (S.source !== 'mt5' || !opt.onChart) return;
    const LS = LightweightCharts.LineStyle, add = (price, color, title, style = LS.Solid, w = 1) => {
      if (!(price > 0)) return;
      lines.push({ s: main, l: main.createPriceLine({ price, color, lineWidth: w, lineStyle: style, axisLabelVisible: true, title }) });
    };
    for (const p of (data && data.positions) || []) {
      if (!same(p.s, S.symbol)) continue;
      const c = p.side === 'buy' ? '#2962ff' : '#e91e63';
      add(p.open, c, `${p.side === 'buy' ? 'BUY' : 'SELL'} ${p.vol} ${money(p.profit + p.swap)}`, LS.Solid, 2);
      add(p.sl, '#ef5350', 'SL', LS.Dashed); add(p.tp, '#26a69a', 'TP', LS.Dashed);
    }
    for (const o of (data && data.orders) || []) {
      if (!same(o.s, S.symbol)) continue;
      add(o.price, '#9e9e9e', ORD[o.type] || o.type, LS.Dotted, 1); add(o.sl, '#ef535088', 'SL', LS.Dotted); add(o.tp, '#26a69a88', 'TP', LS.Dotted);
    }
    if (opt.hist && deals && LightweightCharts.createSeriesMarkers) {
      const mk = deals.filter((x) => same(x.s, S.symbol)).map((x) => ({
        time: x.time + TZ, position: x.side === 'buy' ? 'belowBar' : 'aboveBar', shape: x.side === 'buy' ? 'arrowUp' : 'arrowDown',
        color: x.entry === 'in' ? (x.side === 'buy' ? '#2962ff' : '#e91e63') : '#ff9800',
        text: x.entry === 'in' ? `${x.side === 'buy' ? 'B' : 'S'} ${x.vol}` : money(x.profit + x.commission + x.swap) }));
      // snap to candle times (markers must sit on an existing bar)
      const ts = (S.candles || []).map((c) => c.time), snap = (t) => { let lo = 0, hi = ts.length - 1; if (hi < 0 || t < ts[0]) return null; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ts[m] <= t) lo = m; else hi = m - 1; } return ts[lo]; };
      const ok = mk.map((m) => ({ ...m, time: snap(m.time) })).filter((m) => m.time != null).sort((a, b) => a.time - b.time);
      try { if (!markersApi) markersApi = LightweightCharts.createSeriesMarkers(main, ok); else markersApi.setMarkers(ok); } catch (_) {}
    }
  }

  async function loadDeals() {
    try { deals = await vcg.mt5Deals(Date.now() / 1000 - opt.days * 86400, 0); dealsSym = S.symbol; }
    catch (e) { deals = []; toast('อ่านประวัติจาก MT5 ไม่ได้: ' + e.message, 'warn', 6000); }
    lastKey = ''; render(); drawChart();
  }
  function update(p) { data = p; render(); drawChart(); }

  vcg.onPositions(update);
  setInterval(() => {
    const want = S.source === 'mt5';
    if (want !== subscribed) { subscribed = want; vcg.mt5Positions(want).then((p) => { if (want && p) update(p); }).catch(() => {}); if (!want) { data = null; deals = null; } }
    if (want && opt.hist && !deals) { deals = []; loadDeals(); }
    if (dealsSym && dealsSym !== S.symbol) { dealsSym = S.symbol; lastKey = ''; }
    render(); drawChart();          // also re-adds the lines after the chart series is rebuilt (timeframe / chart type)
  }, 1000);

  return { data: () => data, deals: () => deals, refresh: () => { lastKey = ''; render(); drawChart(); } };
})();
export { POSITIONS };
