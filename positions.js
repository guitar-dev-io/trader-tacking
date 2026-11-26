import { PT, def } from './src/pt.ts';
import { $, S, TZ, esc, store } from './app-core.js';
import { main } from './app-chart.js';
import { connStatus, switchSymbol } from './app-data.js';
import { toast } from './settings.js';
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
  const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');
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

  // ------------------------------------------------------------ panel
  function render() {
    const el = panel(); if (!el) return;
    const show = S.source === 'mt5';
    el.classList.toggle('hidden', !show);
    if (!show) return;
    const d = data, a = (d && d.acct) || {}, cur = a.currency || '';
    const head = `<div class="pos-h"><b>ออเดอร์ของฉัน (MT5)</b><span class="pos-ro" title="แอปนี้อ่านอย่างเดียว ส่ง/แก้/ปิดออเดอร์ไม่ได้">${PT.ICON.html('lock', 11)}อ่านอย่างเดียว</span>${d ? `<span class="pos-acc ${a.demo ? 'demo' : 'real'}">${a.demo ? 'DEMO' : 'REAL'}</span>` : ''}</div>`;
    let body;
    if (!d) {
      const m = ((typeof connStatus !== 'undefined' && connStatus) || {}).mt5 || {};
      body = `<p class="muted pos-empty">${!m.connected ? 'รอ EA ใน MT5 เชื่อมต่อ…' : m.eaVersion && m.eaVersion < 2 ? 'EA ใน MT5 เป็นรุ่นเก่า — กด "เปิด MT5 พร้อม EA" ในคู่มือ หรือติดตั้ง EA ใหม่ เพื่อดูออเดอร์ของคุณ' : 'กำลังอ่านข้อมูลบัญชี…'}</p>`;
    } else {
      const fl = (a.equity || 0) - (a.balance || 0);
      const pos = d.positions.map((p) => `<tr data-s="${esc(p.s)}" class="${same(p.s, S.symbol) ? 'cur' : ''}"><td>${esc(p.s)}</td>
          <td class="${p.side === 'buy' ? 'up' : 'down'}">${p.side === 'buy' ? 'Buy' : 'Sell'} ${p.vol}</td><td>${p.open}<small>→ ${p.price}</small></td>
          <td class="${cls(p.profit + p.swap)}">${money(p.profit + p.swap)}</td></tr>`).join('');
      const ord = d.orders.map((o) => `<tr data-s="${esc(o.s)}" class="${same(o.s, S.symbol) ? 'cur' : ''}"><td>${esc(o.s)}</td><td>${ORD[o.type] || esc(o.type)} ${o.vol}</td><td>${o.price}</td><td class="muted">รอ</td></tr>`).join('');
      body = `<div class="pos-acct"><span>Balance<b>${Number(a.balance || 0).toFixed(2)}</b></span><span>Equity<b>${Number(a.equity || 0).toFixed(2)}</b></span><span>ลอยตัว<b class="${cls(fl)}">${money(fl)}</b></span><small>${esc(cur)}${a.leverage ? ' · 1:' + a.leverage : ''}</small></div>
        ${d.positions.length || d.orders.length ? `<table class="pos-t"><tbody>${pos}${ord}</tbody></table>` : '<p class="muted pos-empty">ไม่มีออเดอร์เปิดอยู่</p>'}`;
    }
    const hist = deals ? histHtml() : '';
    const html = head + body + `<div class="pos-opts"><label class="chk"><input type="checkbox" data-o="onChart" ${opt.onChart ? 'checked' : ''}> เส้นบนกราฟ</label>
      <label class="chk"><input type="checkbox" data-o="hist" ${opt.hist ? 'checked' : ''}> ประวัติ</label>
      ${opt.hist ? `<select data-o="days">${[1, 7, 30, 90].map((n) => `<option value="${n}" ${n === opt.days ? 'selected' : ''}>${n} วัน</option>`).join('')}</select>` : ''}</div>${hist}`;
    if (html === el._html) return;
    el._html = html; el.innerHTML = html;
    el.querySelectorAll('tr[data-s]').forEach((tr) => (tr.onclick = () => { if (!same(tr.dataset.s, S.symbol)) switchSymbol(tr.dataset.s); }));
    el.querySelectorAll('[data-o]').forEach((i) => (i.onchange = () => {
      const k = i.dataset.o; opt[k] = k === 'days' ? +i.value : i.checked; store.set('pos' + k[0].toUpperCase() + k.slice(1), opt[k]);
      if (k !== 'onChart') { deals = null; if (opt.hist) loadDeals(); }
      lastKey = ''; render(); drawChart();
    }));
  }
  function histHtml() {
    const closed = deals.filter((x) => x.entry === 'out' || x.entry === 'inout' || x.entry === 'outby');
    const net = closed.reduce((s, x) => s + x.profit + x.commission + x.swap, 0) + deals.filter((x) => x.entry === 'in').reduce((s, x) => s + x.commission, 0);
    const win = closed.filter((x) => x.profit > 0).length;
    const rows = closed.slice(-15).reverse().map((x) => `<tr data-s="${esc(x.s)}"><td>${new Date(x.time * 1000).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
      <td>${esc(x.s)}</td><td>${x.side === 'sell' ? 'ปิด Buy' : 'ปิด Sell'} ${x.vol}</td><td class="${cls(x.profit)}">${money(x.profit + x.commission + x.swap)}</td></tr>`).join('');
    return `<div class="pos-hist"><div class="pos-sum">ปิดไป <b>${closed.length}</b> ครั้ง · ชนะ <b>${closed.length ? Math.round((win / closed.length) * 100) : 0}%</b> · สุทธิ <b class="${cls(net)}">${money(net)}</b></div>
      ${rows ? `<table class="pos-t"><tbody>${rows}</tbody></table>` : '<p class="muted pos-empty">ไม่มีการซื้อขายในช่วงนี้</p>'}</div>`;
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
