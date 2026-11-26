/* global S, store, $, esc, fmt, tf, TFS, TZ, vcg, onChartMsg, onQuotesMsg, loadChart, toast, desktopNotify, beep, el, txt, label, chartW, paneH,
   xIdx, timeToLogical, dirty:writable, chart, renderWatchlist, setAllData */
// Extras: Demo data source (Binance public market data), local candle cache, economic calendar, update checker.

// ---------------------------------------------------------------- helpers
const fetchJSON = (url) => (vcg.fetchJSON ? vcg.fetchJSON(url) : fetch(url).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }));
if (!vcg.capabilities?.vcg && S.source !== 'demo') { S.source = 'demo'; store.set('source', 'demo'); }

// ---------------------------------------------------------------- Demo data source (for practice without a VCG login)
const DEMO = (() => {
  const MAP = { XAUUSD: 'PAXGUSDT', BTCUSD: 'BTCUSDT', ETHUSD: 'ETHUSDT', EURUSD: 'EURUSDT', GBPUSD: 'GBPUSDT', SOLUSD: 'SOLUSDT', XRPUSD: 'XRPUSDT', BNBUSD: 'BNBUSDT' };
  const IV = { 0: '1m', 1: '5m', 2: '15m', 3: '1h', 4: '4h', 5: '1d', 6: '1w' };
  const REST = 'https://data-api.binance.vision/api/v3/klines';
  const WSS = 'wss://data-stream.binance.vision/stream?streams=';
  const map = (s) => MAP[s] || (/USD$/.test(s) ? s.replace(/USD$/, 'USDT') : s);
  const digitsOf = (s) => (/JPY/.test(s) ? 3 : /^[A-Z]{6}$/.test(s) && !/^(XAU|XAG|BTC|ETH|SOL|XRP|BNB)/.test(s) ? 5 : 2);
  let ws = null, wsKey = '', cur = null, retry = null;

  async function requestChart(o, handler) {
    if (o.slot === 'mtf') handler = (m) => MTF.onMsg({ ...m, slot: 'mtf' });
    handler = handler || onChartMsg;
    if (o.slot !== 'mtf') cur = o;
    try {
      const url = `${REST}?symbol=${map(o.symbol)}&interval=${IV[o.candleType]}&limit=${Math.min(1000, o.limit || 1000)}&endTime=${Date.parse(o.to)}`;
      const rows = await fetchJSON(url);
      if (o.slot !== 'mtf' && cur !== o && o.inclusive) return;
      const candles = rows.map((r) => ({ timeSeconds: r[0] / 1000, open: +r[1], high: +r[2], low: +r[3], close: +r[4] }));
      handler({ type: 'chart', data: { symbol: o.symbol, history: { candles } } });
      vcg.log('info', `Demo: ได้ ${candles.length} แท่ง ${o.symbol} (${map(o.symbol)})`, null, 'demo');
    } catch (e) {
      handler({ type: 'chartError', data: { message: 'Demo (Binance): ' + e.message } });
      vcg.log('error', 'Demo โหลดกราฟไม่สำเร็จ: ' + e.message, null, 'demo');
    }
    connect();
  }
  function connect() {
    if (S.source !== 'demo') return stop();
    const syms = [...new Set([...S.symbols, S.symbol])];
    const streams = syms.map((s) => map(s).toLowerCase() + '@ticker');
    streams.push(map(S.symbol).toLowerCase() + '@kline_' + IV[S.tf]);
    const mtfType = typeof MTF !== 'undefined' ? MTF.activeType() : null;
    if (mtfType != null && mtfType !== S.tf) streams.push(map(S.symbol).toLowerCase() + '@kline_' + IV[mtfType]);
    const key = streams.join('/');
    if (ws && wsKey === key && ws.readyState <= 1) return;
    stop(); wsKey = key;
    ws = new WebSocket(WSS + key);
    ws.onopen = () => { vcg.log('info', 'Demo: เชื่อมต่อ Binance stream แล้ว', null, 'demo'); setConn(true); };
    ws.onclose = () => { setConn(false); if (S.source === 'demo') { clearTimeout(retry); retry = setTimeout(connect, 3000); } };
    ws.onerror = () => vcg.log('warn', 'Demo: stream error', null, 'demo');
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch (_) { return; }
      const d = m.data; if (!d) return;
      if (d.e === '24hrTicker') {
        const sym = syms.find((s) => map(s) === d.s); if (!sym) return;
        const dg = digitsOf(sym), bid = +d.b, ask = +d.a;
        onQuotesMsg([{ symbol: sym, time: new Date(d.E).toISOString(), bid, ask: ask > bid ? ask : bid, digits: dg, spread: +(ask - bid).toFixed(dg), change: +d.p, changePct: +(+d.P).toFixed(3) }]);
      } else if (d.e === 'kline' && map(S.symbol) === d.s) {
        const k = d.k, msg = { type: 'chart', data: { updates: { candles: [{ timeSeconds: k.t / 1000, open: +k.o, high: +k.h, low: +k.l, close: +k.c }] } } };
        if (k.i === IV[S.tf]) onChartMsg(msg);
        if (typeof MTF !== 'undefined' && MTF.activeType() != null && k.i === IV[MTF.activeType()]) MTF.onMsg({ ...msg, slot: 'mtf' });
      }
    };
  }
  function stop() { if (ws) { ws.onclose = null; try { ws.close(); } catch (_) {} ws = null; } clearTimeout(retry); }
  function setConn(ok) { if (S.source !== 'demo') return; $('conn').classList.toggle('ok', ok); $('conn-text').textContent = ok ? 'Demo (Binance)' : 'Demo: กำลังเชื่อมต่อ…'; }
  return { requestChart, connect, stop, map };
})();

function setSource(src) {
  if (src === S.source) return;
  S.source = src; store.set('source', src); S.quotes = {};
  if (src !== 'demo' && vcg.setSource) vcg.setSource(src);
  if (src === 'mt5') toast('ใช้ราคาจาก MT5 — ต้องเปิด MT5 และลาก EA PriceTrackerBridge ลงกราฟ (ดูวิธีที่ ⚙ การตั้งค่า → แหล่งราคา)', 'info', 10000);
  if (src === 'demo') { DEMO.connect(); toast('ใช้ข้อมูล Demo จาก Binance สำหรับฝึก — XAUUSD ใช้ PAXG แทนทองคำ ราคาใกล้เคียงแต่ไม่เท่ากับโบรกเกอร์', 'info', 9000); }
  else DEMO.stop();
  renderWatchlist(); renderSourceSel(); loadChart();
  if (typeof renderConnect === 'function') renderConnect();
}
function renderSourceSel() {
  if (!$('src-sel')) {
    $('add-form').insertAdjacentHTML('afterend', `<div class="row" style="display:flex;gap:6px;align-items:center;margin-top:8px"><span class="muted">แหล่งข้อมูล</span>
      <select id="src-sel" style="flex:1"><option value="vcg">VCG (ราคาจริง)</option><option value="mt5">MT5 — โบรกเกอร์ใดก็ได้ (EA)</option><option value="demo">Demo — Binance (ฝึก)</option></select></div>`);
    $('src-sel').onchange = () => setSource($('src-sel').value);
  }
  $('src-sel').value = S.source;
  $('src-sel').querySelector('[value=vcg]').disabled = !vcg.capabilities?.vcg;
  const o5 = $('src-sel').querySelector('[value=mt5]'); o5.disabled = !vcg.capabilities?.mt5; o5.hidden = !vcg.capabilities?.mt5;
}
renderSourceSel();
if (S.source === 'mt5' && !vcg.capabilities?.mt5) { S.source = vcg.capabilities?.vcg ? 'vcg' : 'demo'; store.set('source', S.source); }
// desktop: the main process remembers vcg/mt5 — adopt it on start (Demo is a window-only choice)
if (vcg.capabilities?.mt5 && S.source !== 'demo') vcg.getSettings().then((c) => {
  if (c.source && c.source !== S.source) { S.source = c.source; store.set('source', c.source); renderSourceSel(); loadChart(); }
});
if (S.source === 'demo') setTimeout(() => DEMO.connect(), 500);
vcg.onStatus(() => { if (S.source === 'demo') DEMO.connect(); });

// ---------------------------------------------------------------- candle cache (IndexedDB)
const CACHE = (() => {
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('price-tracker', 1); r.onupgradeneeded = () => r.result.createObjectStore('candles'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const key = () => `${S.source}|${S.symbol}|${S.tf}`;
  async function get(k) { const d = await db(); return new Promise((res) => { const q = d.transaction('candles').objectStore('candles').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); }
  async function put(k, v) { const d = await db(); return new Promise((res) => { const t = d.transaction('candles', 'readwrite'); t.objectStore('candles').put(v, k); t.oncomplete = res; t.onerror = res; }); }
  return {
    async restore() {
      try {
        const k = key(), c = await get(k);
        if (!c || !S.pendingHistory || k !== key()) return;
        S.candles = c.candles.map((x) => ({ ...x, time: x.time + TZ }));
        setAllData(); $('loading').classList.add('hidden');
        chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, S.candles.length - 150), to: S.candles.length + 10 });
        vcg.log('info', `แสดงกราฟจากแคช (${S.candles.length} แท่ง) ระหว่างรอข้อมูลใหม่`, null, 'cache');
      } catch (_) {}
    },
    async peek() { return get(key()); },
    save() {
      if (S.replay || S.pendingHistory || !S.candles.length) return;
      put(key(), { saved: Date.now(), candles: S.candles.slice(-3000).map((x) => ({ time: x.time - TZ, open: x.open, high: x.high, low: x.low, close: x.close })) }).catch(() => {});
    },
  };
})();

// ---------------------------------------------------------------- economic calendar
const NEWS = (() => {
  const URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
  let events = store.get('news.cache', { at: 0, list: [] });
  const warned = new Set(store.get('news.warned', []));
  const ccyOf = (sym) => (/^XAU|^XAG/.test(sym) ? ['USD'] : /^[A-Z]{6}$/.test(sym) ? [sym.slice(0, 3), sym.slice(3)] : ['USD']);
  async function refresh(force) {
    if (!force && Date.now() - events.at < 3600e3 && events.list.length) return render();
    try {
      const list = await fetchJSON(URL);
      events = { at: Date.now(), list: list.map((e) => ({ title: e.title, ccy: e.country, t: Math.floor(Date.parse(e.date) / 1000), impact: e.impact, forecast: e.forecast, previous: e.previous })) };
      store.set('news.cache', events); vcg.log('info', `โหลดปฏิทินข่าว ${events.list.length} รายการ`, null, 'news');
    } catch (e) { vcg.log('warn', 'โหลดปฏิทินข่าวไม่สำเร็จ: ' + e.message, null, 'news'); }
    render();
  }
  const relevant = () => events.list.filter((e) => ccyOf(S.symbol).includes(e.ccy) && (e.impact === 'High' || e.impact === 'Medium'));
  const hhmm = (t) => { const d = new Date((t + TZ) * 1000); return `${['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'][d.getUTCDay()]} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
  function render() {
    let box = $('an-news');
    if (!box) { $('an-trend').insertAdjacentHTML('beforebegin', '<div class="panel" id="an-news"></div>'); box = $('an-news'); }
    const now = Date.now() / 1000;
    const list = relevant().filter((e) => e.t > now - 3 * 3600).slice(0, 12);
    box.innerHTML = `<div class="panel-h">ข่าวสำคัญสัปดาห์นี้ (${ccyOf(S.symbol).join('/')})</div>` + (list.length ? `<table class="stat"><tbody>${list.map((e) => {
      const soon = e.t - now < 1800 && e.t > now, past = e.t < now;
      return `<tr style="${past ? 'opacity:.45' : soon ? 'background:#5c4a1233' : ''}"><td>${e.impact === 'High' ? '🔴' : '🟠'} ${hhmm(e.t)}</td><td style="text-align:left">${esc(e.ccy)} ${esc(e.title)}</td><td class="muted">${esc(e.forecast || '')}</td></tr>`;
    }).join('')}</tbody></table>` : '<p class="muted">ไม่มีข่าวแรงที่เกี่ยวข้อง หรือยังโหลดไม่ได้</p>') + '<p class="muted">ข้อมูลจาก Forex Factory · 🔴 = ผลกระทบสูง · เวลาตาม timezone กราฟ</p>';
    dirty = true;
  }
  function check() {
    const now = Date.now() / 1000;
    for (const e of relevant()) {
      if (e.impact !== 'High' || e.t - now > 900 || e.t < now) continue;
      const k = e.t + e.title; if (warned.has(k)) continue;
      warned.add(k); store.set('news.warned', [...warned].slice(-100));
      const msg = `ข่าวแรงใน ${Math.round((e.t - now) / 60)} นาที: ${e.ccy} ${e.title}`;
      toast('📰 ' + msg, 'warn', 15000); desktopNotify('📰 ข่าวเศรษฐกิจ', msg); beep();
    }
  }
  // vertical markers on the chart (toggle in chart settings)
  function draw(W, H) {
    if (!S.chartCfg.news || !S.candles.length) return;
    const first = S.candles[0].time - TZ, last = S.candles[S.candles.length - 1].time - TZ + tf().sec * 30;
    for (const e of relevant()) {
      if (e.t < first || e.t > last) continue;
      const l = timeToLogical(e.t + TZ); const x = l == null ? null : lToX(chart.timeScale(), l);
      if (x == null || x < 0 || x > W) continue;
      const col = e.impact === 'High' ? '#ef5350' : '#ff9800';
      el('line', { x1: x, y1: 0, x2: x, y2: H, stroke: col, 'stroke-dasharray': '2 4', 'stroke-opacity': 0.7 });
      txt(x + 3, 12, (e.impact === 'High' ? '● ' : '○ ') + e.title.slice(0, 22), col, 'start', 9.5, 600);
    }
  }
  refresh(); setInterval(() => refresh(), 3600e3); setInterval(check, 30000);
  // next relevant events for the news tab
  function upcoming(n = 4) {
    const now = Date.now() / 1000;
    return relevant().filter((e) => e.t > now - 600).slice(0, n).map((e) => ({ ...e, when: hhmm(e.t) }));
  }
  return { refresh, render, draw, upcoming };
})();

// ---------------------------------------------------------------- update checker (GitHub Releases)
const UPDATE = (() => {
  const REPO = 'guitar-dev-io/trader-tacking';
  const cmp = (a, b) => { const pa = a.replace(/^v/, '').split('.').map(Number), pb = b.replace(/^v/, '').split('.').map(Number); for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); } return 0; };
  async function check(manual) {
    try {
      const cur = (await vcg.getSettings()).version || window.APP_VERSION;
      const r = await fetchJSON(`https://api.github.com/repos/${REPO}/releases/latest`);
      if (cur && r.tag_name && cmp(r.tag_name, cur) > 0) {
        const t = document.createElement('div'); t.className = 'toast ok'; t.style.pointerEvents = 'auto';
        t.innerHTML = `🆕 มีเวอร์ชันใหม่ ${esc(r.tag_name)} (ตอนนี้ ${esc(cur)}) <a href="${esc(r.html_url)}" target="_blank" style="color:#82aaff">ดาวน์โหลด</a> <button style="margin-left:6px">✕</button>`;
        t.querySelector('button').onclick = () => t.remove();
        $('toasts').appendChild(t);
        vcg.log('info', `มีเวอร์ชันใหม่ ${r.tag_name}`, null, 'update');
      } else if (manual) toast(`ใช้เวอร์ชันล่าสุดแล้ว (${cur})`, 'ok');
    } catch (e) { if (manual) toast('ตรวจสอบอัปเดตไม่ได้: ' + e.message, 'warn'); }
  }
  if (store.get('autoUpdateCheck', true)) { setTimeout(() => check(false), 8000); setInterval(() => check(false), 6 * 3600e3); }
  return { check };
})();
