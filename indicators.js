import { PT, def } from './src/pt.ts';
// Technical indicators. Input: candles [{time, open, high, low, close}] sorted by time.
// Output: arrays of {time, value} (null values skipped).
(function () {
  const pts = (c, vals) => c.map((x, i) => (vals[i] == null || !isFinite(vals[i]) ? null : { time: x.time, value: vals[i] })).filter(Boolean);

  function smaArr(v, n) {
    const out = new Array(v.length).fill(null); let s = 0;
    for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= n) s -= v[i - n]; if (i >= n - 1) out[i] = s / n; }
    return out;
  }
  function emaArr(v, n) {
    const out = new Array(v.length).fill(null); const k = 2 / (n + 1); let e = null;
    for (let i = 0; i < v.length; i++) {
      if (v[i] == null) continue;
      if (e == null) { if (i >= n - 1) { let s = 0; for (let j = i - n + 1; j <= i; j++) s += v[j]; e = s / n; out[i] = e; } continue; }
      e = v[i] * k + e * (1 - k); out[i] = e;
    }
    return out;
  }
  function wmaArr(v, n) {
    const out = new Array(v.length).fill(null); const d = (n * (n + 1)) / 2;
    for (let i = n - 1; i < v.length; i++) { let s = 0; for (let j = 0; j < n; j++) s += v[i - j] * (n - j); out[i] = s / d; }
    return out;
  }
  function stdArr(v, n, ma) {
    const out = new Array(v.length).fill(null);
    for (let i = n - 1; i < v.length; i++) { let s = 0; for (let j = i - n + 1; j <= i; j++) s += (v[j] - ma[i]) ** 2; out[i] = Math.sqrt(s / n); }
    return out;
  }
  function trArr(c) {
    return c.map((x, i) => (i === 0 ? x.high - x.low : Math.max(x.high - x.low, Math.abs(x.high - c[i - 1].close), Math.abs(x.low - c[i - 1].close))));
  }
  function rmaArr(v, n) { // Wilder smoothing
    const out = new Array(v.length).fill(null); let r = null;
    for (let i = 0; i < v.length; i++) {
      if (r == null) { if (i >= n - 1) { let s = 0; for (let j = i - n + 1; j <= i; j++) s += v[j]; r = s / n; out[i] = r; } continue; }
      r = (r * (n - 1) + v[i]) / n; out[i] = r;
    }
    return out;
  }

  // Each indicator: name, pane ('main' | 'sub'), default params, lines (key → color), calc(candles, params) → {key: points}
  const DEFS = {
    sma: { name: 'SMA', pane: 'main', params: { period: 20 }, lines: { v: '#f5a623' },
      calc: (c, p) => ({ v: pts(c, smaArr(c.map((x) => x.close), p.period)) }) },
    ema: { name: 'EMA', pane: 'main', params: { period: 50 }, lines: { v: '#2962ff' },
      calc: (c, p) => ({ v: pts(c, emaArr(c.map((x) => x.close), p.period)) }) },
    wma: { name: 'WMA', pane: 'main', params: { period: 20 }, lines: { v: '#e040fb' },
      calc: (c, p) => ({ v: pts(c, wmaArr(c.map((x) => x.close), p.period)) }) },
    bb: { name: 'Bollinger Bands', pane: 'main', params: { period: 20, mult: 2 }, lines: { up: '#7e57c2', mid: '#ff9800', lo: '#7e57c2' },
      calc: (c, p) => { const v = c.map((x) => x.close), m = smaArr(v, p.period), sd = stdArr(v, p.period, m);
        return { up: pts(c, m.map((x, i) => x == null ? null : x + p.mult * sd[i])), mid: pts(c, m), lo: pts(c, m.map((x, i) => x == null ? null : x - p.mult * sd[i])) }; } },
    donchian: { name: 'Donchian Channel', pane: 'main', params: { period: 20 }, lines: { up: '#26a69a', lo: '#ef5350' },
      calc: (c, p) => { const n = p.period; const up = [], lo = [];
        for (let i = 0; i < c.length; i++) { if (i < n - 1) { up.push(null); lo.push(null); continue; }
          let h = -Infinity, l = Infinity; for (let j = i - n + 1; j <= i; j++) { h = Math.max(h, c[j].high); l = Math.min(l, c[j].low); } up.push(h); lo.push(l); }
        return { up: pts(c, up), lo: pts(c, lo) }; } },
    keltner: { name: 'Keltner Channel', pane: 'main', params: { period: 20, mult: 2 }, lines: { up: '#00bcd4', mid: '#00bcd4', lo: '#00bcd4' },
      calc: (c, p) => { const m = emaArr(c.map((x) => x.close), p.period), a = rmaArr(trArr(c), p.period);
        return { up: pts(c, m.map((x, i) => x == null || a[i] == null ? null : x + p.mult * a[i])), mid: pts(c, m), lo: pts(c, m.map((x, i) => x == null || a[i] == null ? null : x - p.mult * a[i])) }; } },
    rsi: { name: 'RSI', pane: 'sub', params: { period: 14 }, lines: { v: '#ab47bc' }, levels: [70, 30],
      calc: (c, p) => { const ch = c.map((x, i) => (i ? x.close - c[i - 1].close : 0)).slice(1);
        const g = rmaArr(ch.map((d) => Math.max(d, 0)), p.period), l = rmaArr(ch.map((d) => Math.max(-d, 0)), p.period);
        const r = [null].concat(g.map((x, i) => (x == null ? null : l[i] === 0 ? 100 : 100 - 100 / (1 + x / l[i]))));
        return { v: pts(c, r) }; } },
    macd: { name: 'MACD', pane: 'sub', params: { fast: 12, slow: 26, signal: 9 }, lines: { macd: '#2962ff', sig: '#ff6d00', hist: 'hist' },
      calc: (c, p) => { const v = c.map((x) => x.close), f = emaArr(v, p.fast), s = emaArr(v, p.slow);
        const m = f.map((x, i) => (x == null || s[i] == null ? null : x - s[i]));
        const first = m.findIndex((x) => x != null);
        const sigPart = emaArr(m.slice(first), p.signal); const sig = new Array(first).fill(null).concat(sigPart);
        const h = m.map((x, i) => (x == null || sig[i] == null ? null : x - sig[i]));
        return { macd: pts(c, m), sig: pts(c, sig), hist: pts(c, h) }; } },
    stoch: { name: 'Stochastic', pane: 'sub', params: { k: 14, smooth: 3, d: 3 }, lines: { k: '#2962ff', d: '#ff6d00' }, levels: [80, 20],
      calc: (c, p) => { const raw = c.map((x, i) => { if (i < p.k - 1) return null; let h = -Infinity, l = Infinity;
          for (let j = i - p.k + 1; j <= i; j++) { h = Math.max(h, c[j].high); l = Math.min(l, c[j].low); } return h === l ? 50 : (100 * (x.close - l)) / (h - l); });
        const f = raw.findIndex((x) => x != null); const k = new Array(f).fill(null).concat(smaArr(raw.slice(f), p.smooth));
        const f2 = k.findIndex((x) => x != null); const d = new Array(f2).fill(null).concat(smaArr(k.slice(f2), p.d));
        return { k: pts(c, k), d: pts(c, d) }; } },
    atr: { name: 'ATR', pane: 'sub', params: { period: 14 }, lines: { v: '#ef5350' },
      calc: (c, p) => ({ v: pts(c, rmaArr(trArr(c), p.period)) }) },
    cci: { name: 'CCI', pane: 'sub', params: { period: 20 }, lines: { v: '#26a69a' }, levels: [100, -100],
      calc: (c, p) => { const tp = c.map((x) => (x.high + x.low + x.close) / 3), m = smaArr(tp, p.period);
        const out = tp.map((x, i) => { if (m[i] == null) return null; let md = 0; for (let j = i - p.period + 1; j <= i; j++) md += Math.abs(tp[j] - m[i]); md /= p.period; return md === 0 ? 0 : (x - m[i]) / (0.015 * md); });
        return { v: pts(c, out) }; } },
  };

  function heikinAshi(c) {
    const out = []; let po, pc;
    for (const x of c) {
      const close = (x.open + x.high + x.low + x.close) / 4;
      const open = po == null ? (x.open + x.close) / 2 : (po + pc) / 2;
      out.push({ time: x.time, open, close, high: Math.max(x.high, open, close), low: Math.min(x.low, open, close) });
      po = open; pc = close;
    }
    return out;
  }

  PT.IND = { DEFS, heikinAshi, _smaArr: smaArr, _emaArr: emaArr };
  if (typeof module !== 'undefined') module.exports = PT.IND;
})();
