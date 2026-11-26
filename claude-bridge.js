/* global S, TZ, TFS, tf, vcg, store, drawings:writable, saveDrawings, switchSymbol, renderTfs, loadChart, fmt, dirty:writable, computePlan, renderPlanner, savePlan, AN, BOUNCE, uid, toast */
// Commands the local API (and the Claude MCP server on top of it) can run inside the app window.
// Read: view, candles, analysis, bounce · Act on the chart: open_chart, draw, clear_drawings · Calculator: plan.
// Times in and out are UTC unix seconds (the chart itself is shifted by the display timezone TZ).
(function () {
  if (!vcg.onApiCmd) return;   // desktop only
  const tfOf = (x) => TFS.find((t) => t.label.toLowerCase() === String(x).toLowerCase() || t.type === +x);
  const utc = (t) => t - TZ;
  const toChart = (t) => {
    if (t == null || t === '') return null;
    const s = typeof t === 'number' ? (t > 1e12 ? t / 1000 : t) : Date.parse(t) / 1000;
    return isFinite(s) ? Math.round(s) + TZ : null;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const bar = (c) => c && { time: utc(c.time), iso: new Date(utc(c.time) * 1000).toISOString(), open: c.open, high: c.high, low: c.low, close: c.close };

  function view() {
    const c = S.candles, q = S.quotes[S.symbol];
    let range = null;
    try { const r = chart.timeScale().getVisibleRange(); if (r) range = { from: utc(r.from), to: utc(r.to) }; } catch (_) {}
    return {
      symbol: S.symbol, timeframe: tf().label, source: S.source, bars: c.length, lastBar: bar(c[c.length - 1]),
      quote: q ? { bid: q.bid, ask: q.ask, time: q.time, changePct: q.changePct } : null,
      visibleRange: range, timezoneOffsetSec: TZ,
      drawings: drawings.length, claudeDrawings: drawings.filter((d) => d.by === 'claude').length,
      overlays: Object.keys(S.an).filter((k) => S.an[k] === true),
    };
  }
  async function openChart({ symbol, timeframe }) {
    const want = symbol ? String(symbol).toUpperCase() : S.symbol, t = timeframe != null ? tfOf(timeframe) : null;
    if (timeframe != null && !t) throw new Error('timeframe ต้องเป็นหนึ่งใน ' + TFS.map((x) => x.label).join(', '));
    const before = S.candles.length && S.candles[S.candles.length - 1].time;
    if (want !== S.symbol) { if (!(S.symbols || []).includes(want)) vcg.addSymbol(want); switchSymbol(want); }
    if (t && t.type !== S.tf) { S.tf = t.type; store.set('tf', t.type); renderTfs(); loadChart(); }
    for (let i = 0; i < 60; i++) {   // wait up to ~15 s for the new candles
      await sleep(250);
      const last = S.candles.length && S.candles[S.candles.length - 1].time;
      if (S.symbol === want && S.candles.length > 20 && (!t || S.tf === t.type) && (last !== before || i > 8)) break;
    }
    return view();
  }
  function candles({ limit = 200 } = {}) {
    const n = Math.max(1, Math.min(2000, +limit || 200));
    return { symbol: S.symbol, timeframe: tf().label, note: 'แท่งสุดท้ายคือแท่งที่ยังไม่ปิด', candles: S.candles.slice(-n).map(bar) };
  }
  function analysis() {
    const A = S.A; if (!A) return { note: 'ยังไม่มีข้อมูลกราฟพอสำหรับวิเคราะห์' };
    const sig = (s) => s && { side: s.dir === 1 ? 'BUY' : 'SELL', time: utc(s.time), setup: s.setup, pattern: AN.PAT[s.pattern] && AN.PAT[s.pattern].name,
      entry: s.entry, sl: s.sl, tp1: s.tp1, tp2: s.tp2, reasons: s.reasons, result: s.r1 && s.r1.res };
    return {
      symbol: S.symbol, timeframe: tf().label, bars: A.n, atr: A.atr[A.n - 1],
      trend: A.lastTrend === 1 ? 'up' : A.lastTrend === -1 ? 'down' : 'sideways',
      lastStructureEvent: A.lastEvent && { type: A.lastEvent.type, dir: A.lastEvent.dir, price: A.lastEvent.price, time: S.candles[A.lastEvent.idx] && utc(S.candles[A.lastEvent.idx].time) },
      swings: A.swings.slice(-12).map((s) => ({ label: s.label, price: s.price, time: utc(s.time) })),
      zones: A.zones.slice(0, 10).map((z) => ({ kind: z.kind, top: z.top, bottom: z.bottom, touches: z.touches })),
      lastSignals: A.signals.slice(-5).map(sig),
      stats: A.stats && { all: A.stats.all, bySetup: A.stats.bySetup },
    };
  }
  function bounce() {
    if (typeof runBounce === 'function' && !S.B) runBounce();
    const B = S.B; if (!B) return { note: 'ยังไม่มีข้อมูลพอ (ต้องการอย่างน้อย 60 แท่ง)' };
    const z = (x) => ({ zone: [Math.min(x.lo, x.hi), Math.max(x.lo, x.hi)], stars: x.stars, status: x.status, types: x.types,
      entry: x.entry, sl: x.sl, tp1: x.tp1, tp2: x.tp2, rr1: +x.rr1.toFixed(2), distanceAtr: +Math.abs(x.distAtr).toFixed(2),
      reasons: x.why.map((w) => (w.neg ? '(-) ' : '') + w.txt), history: x.stat });
    return { symbol: S.symbol, timeframe: tf().label, price: B.price, atr: B.atr, buy: B.buy.map(z), sell: B.sell.map(z),
      liquidity: { above: B.liq.highs.slice(0, 5).map((p) => ({ price: p.price, kind: BOUNCE.poolName(p, false), strength: p.strength })),
        below: B.liq.lows.slice(0, 5).map((p) => ({ price: p.price, kind: BOUNCE.poolName(p, false), strength: p.strength })),
        recentSweeps: B.liq.sweeps.map((s) => ({ side: s.side, price: s.price, barsAgo: S.A ? S.A.n - 1 - s.j : null })) },
      statsByZoneType: B.stats };
  }
  const TYPES = ['hline', 'trend', 'ray', 'rect', 'text', 'callout', 'arrowUp', 'arrowDown', 'fib', 'fibext', 'long', 'short'];
  function draw(a) {
    const type = a.type; if (!TYPES.includes(type)) throw new Error('type ต้องเป็นหนึ่งใน ' + TYPES.join(', '));
    const c = S.candles; if (!c.length) throw new Error('ยังไม่มีกราฟ');
    const last = c[c.length - 1].time, span = tf().sec;
    const pts = (a.points || []).map((p, i) => ({ time: toChart(p.time) ?? (last - (((a.points.length - 1 - i) * 30) * span)), price: +p.price }));
    const need = { hline: 1, text: 1, callout: 1, arrowUp: 1, arrowDown: 1, fibext: 3 }[type] || 2;
    if (pts.length < need || pts.some((p) => !isFinite(p.price))) throw new Error(`${type} ต้องมี ${need} จุด {time?, price}`);
    const d = { id: uid(), type, pts: pts.slice(0, need === 1 ? 1 : need), color: a.color || ({ rect: '#2962ff', hline: '#f6c343' }[type] || '#ab47bc'), by: 'claude' };
    if (a.text) d.text = String(a.text).slice(0, 500);
    if (type === 'text' || type === 'callout') {   // optional style: fontSize 12-24, bg (bool), bold, border
      d.size = Math.max(10, Math.min(28, +a.fontSize || 14)); d.bg = a.bg !== false; d.bold = !!a.bold; d.border = a.border ?? (type === 'callout');
      if (type === 'callout') d.off = { dx: +a.offsetX || 24, dy: +a.offsetY || -56 };
    }
    if (type === 'fib' && a.reverse != null) d.reverse = !!a.reverse;
    if ((type === 'text' || type === 'callout') && !d.text) throw new Error(type + ' ต้องมีข้อความ');
    drawings.push(d); saveDrawings(); dirty = true;
    if (a.label && type !== 'text' && type !== 'callout') { d.label = String(a.label).slice(0, 200); saveDrawings(); }   // caption drawn on the shape
    toast('Claude วาด ' + type + (a.label ? ': ' + a.label : ''), 'info', 2500);
    return { ok: true, id: d.id, claudeDrawings: drawings.filter((x) => x.by === 'claude').length };
  }
  function clearDrawings({ all } = {}) {
    const before = drawings.length;
    drawings = all ? [] : drawings.filter((d) => d.by !== 'claude');
    saveDrawings(); dirty = true;
    return { removed: before - drawings.length };
  }
  function plan(a) {
    const p = S.plan;
    const set = (k, v) => { if (v != null && v !== '') p[k] = typeof v === 'number' ? fmt(v) : String(v); };
    if (a.side) p.side = String(a.side).toLowerCase() === 'sell' ? 'sell' : 'buy';
    set('entry', a.entry); set('sl', a.sl); p.tp1 = a.tp1 != null ? fmt(a.tp1) : ''; p.tp2 = a.tp2 != null ? fmt(a.tp2) : '';
    if (a.balance != null) p.balance = String(a.balance);
    if (a.riskPct != null) { p.risk = String(a.riskPct); p.riskMode = 'pct'; }
    p.adds = String(a.adds || 0);            // each call is a fresh calculation: no scale-in unless asked
    p.spacing = a.spacing != null ? fmt(a.spacing) : '';
    if (a.mode) p.mode = a.mode === 'pyramid' ? 'pyramid' : 'avg';
    if (a.account) p.account = a.account === 'cent' ? 'cent' : a.account === 'auto' ? 'auto' : 'std';   // cent: balance in USC, lots in cent lots
    savePlan(); renderPlanner(); dirty = true;
    const r = computePlan();
    return { input: { side: p.side, entry: p.entry, sl: p.sl, tp1: p.tp1, tp2: p.tp2, balance: p.balance, risk: p.risk, riskMode: p.riskMode, account: p.account },
      account: isCentAcct() ? { type: 'cent', currency: 'USC', lotUnit: 'cent lot (1.00 = 0.01 standard lot)', usdPerUsc: 0.01 } : { type: 'standard', currency: 'USD', lotUnit: 'lot' },
      valuePerPricePer1Lot: r.v, pointSize: 10 ** -((S.quotes[S.symbol] || {}).digits || 2), totalLot: r.totalLot, avgEntry: r.avg, riskBudget: r.risk, maxLossAtSL: r.maxLoss,
      rows: (r.rows || []).map((x) => ({ price: x.price, lot: x.lot, cumLot: x.cumLot, avg: x.avg, lossAtSL: x.slLoss, profitTP1: x.tp1, profitTP2: x.tp2 })),
      warnings: r.warn, error: r.error || r.err || null };
  }
  async function perf() {
    const n = S.candles.length, closed = S.candles.slice(0, -1);
    const time = (f, k = 3) => { const t = []; for (let i = 0; i < k; i++) { const a = performance.now(); f(); t.push(performance.now() - a); } return Math.round(Math.min(...t)); };
    const out = { symbol: S.symbol, timeframe: tf().label, bars: n, lastRun: { ...PERF } };
    if (closed.length >= 60) {
      let A = null;
      out.analyzeMs = time(() => { A = AN.analyze(closed, { swingLen: S.an.swingLen, digits: 2 }); });
      out.bounceMs = time(() => BOUNCE.find(closed, A, {}));
      out.redrawMs = time(() => { dirty = true; redraw(); }, 5);
    }
    if (typeof CACHE !== 'undefined') { const a = performance.now(); await CACHE.peek(); out.cacheReadMs = Math.round(performance.now() - a); }
    const fr = await new Promise((res) => { let k = 0; const a = performance.now(); const f = () => (++k < 30 ? requestAnimationFrame(f) : res(Math.round((performance.now() - a) / 30 * 10) / 10)); requestAnimationFrame(f); });
    out.frameMs = fr;
    out.memoryMB = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null;
    out.cpuCores = navigator.hardwareConcurrency;
    return out;
  }
  const CMDS = {
    perf,
    news: (a) => (typeof HEADLINES !== 'undefined' ? { symbol: S.symbol, headlines: HEADLINES.list(a || {}), calendar: typeof NEWS !== 'undefined' && NEWS.upcoming ? NEWS.upcoming(10) : [] } : { headlines: [] }),
    view, open_chart: openChart, candles, analysis, bounce, draw, clear_drawings: clearDrawings, plan,
    chart_rect: () => { const r = document.getElementById('chart-wrap').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; },
  };
  vcg.onApiCmd(async ({ id, name, args }) => {
    try {
      const f = CMDS[name]; if (!f) throw new Error('ไม่รู้จักคำสั่ง ' + name + ' (มี: ' + Object.keys(CMDS).join(', ') + ')');
      vcg.apiResult({ id, data: await f(args || {}) });
    } catch (e) { vcg.apiResult({ id, error: e.message || String(e) }); }
  });
})();
