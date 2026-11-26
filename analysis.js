// Price-action analysis engine.
// Input: CLOSED candles only [{time, open, high, low, close}] (the forming candle must be excluded).
// Everything used for a signal at bar k is known at the close of bar k (no look-ahead):
// pivots count only after their right-side bars have closed, and the "learning" statistics
// for a signal use only earlier signals whose outcome was already decided before bar k.
(function () {
  const PAT = {
    morning: { name: 'Morning Star', short: 'MS', dir: 1, rank: 5 },
    evening: { name: 'Evening Star', short: 'ES', dir: -1, rank: 5 },
    bullEng: { name: 'Bullish Engulfing', short: 'BE', dir: 1, rank: 4 },
    bearEng: { name: 'Bearish Engulfing', short: 'SE', dir: -1, rank: 4 },
    hammer: { name: 'Hammer / Pin bar', short: 'HM', dir: 1, rank: 3 },
    star: { name: 'Shooting Star / Pin bar', short: 'SS', dir: -1, rank: 3 },
    doji: { name: 'Doji', short: 'DJ', dir: 0, rank: 1 },
    inside: { name: 'Inside Bar', short: 'IB', dir: 0, rank: 1 },
  };
  const SETUP = {
    pullback: { name: 'ย่อตามเทรนด์ (Pullback)', short: 'PB' },
    choch: { name: 'กลับตัวหลัง CHoCH', short: 'CH' },
    sr: { name: 'เด้งแนวรับ/แนวต้าน', short: 'SR' },
  };

  function atrArr(c, n = 14) {
    const out = new Array(c.length).fill(null); let r = null;
    for (let i = 0; i < c.length; i++) {
      const tr = i === 0 ? c[i].high - c[i].low : Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close));
      if (i < n - 1) { r = (r || 0) + tr; continue; }
      if (i === n - 1) { r = (r + tr) / n; out[i] = r; continue; }
      r = (r * (n - 1) + tr) / n; out[i] = r;
    }
    return out;
  }

  // Raw pivots (fractals): high/low that is the extreme of L bars on each side.
  function pivots(c, L) {
    const out = [];
    for (let i = L; i < c.length - L; i++) {
      let isH = true, isL = true;
      for (let j = i - L; j <= i + L && (isH || isL); j++) {
        if (j === i) continue;
        if (j < i) { if (c[j].high >= c[i].high) isH = false; if (c[j].low <= c[i].low) isL = false; }
        else { if (c[j].high > c[i].high) isH = false; if (c[j].low < c[i].low) isL = false; }
      }
      if (isH) out.push({ i, type: 'H', price: c[i].high, conf: i + L });
      if (isL) out.push({ i, type: 'L', price: c[i].low, conf: i + L });
    }
    return out;
  }

  // Alternating swings for display (zigzag) with HH/HL/LH/LL labels and bars per leg.
  function swings(c, piv) {
    const alt = [];
    for (const p of piv) {
      const s = { ...p }, last = alt[alt.length - 1];
      if (last && last.type === s.type) {
        if ((s.type === 'H' && s.price > last.price) || (s.type === 'L' && s.price < last.price)) alt[alt.length - 1] = s;
      } else alt.push(s);
    }
    let pH = null, pL = null;
    alt.forEach((s, k) => {
      if (s.type === 'H') { s.label = pH ? (s.price > pH.price ? 'HH' : 'LH') : 'H'; pH = s; }
      else { s.label = pL ? (s.price > pL.price ? 'HL' : 'LL') : 'L'; pL = s; }
      s.time = c[s.i].time;
      s.legBars = k ? s.i - alt[k - 1].i : null;
    });
    return alt;
  }

  // Market structure: BOS = break in trend direction, CHoCH = first break against the trend.
  function structure(c, piv) {
    const n = c.length, trendAt = new Array(n).fill(0), events = [], lastEventAt = new Array(n).fill(null);
    const byConf = [...piv].sort((a, b) => a.conf - b.conf);
    let trend = 0, lastH = null, lastL = null, bH = false, bL = false, pi = 0, lastEv = null;
    for (let k = 0; k < n; k++) {
      while (pi < byConf.length && byConf[pi].conf <= k) {
        const p = byConf[pi++];
        if (p.type === 'H') { lastH = p; bH = false; } else { lastL = p; bL = false; }
      }
      if (lastH && !bH && c[k].close > lastH.price) {
        lastEv = { type: trend === -1 ? 'CHoCH' : 'BOS', dir: 1, from: lastH.i, idx: k, price: lastH.price };
        events.push(lastEv); trend = 1; bH = true;
      } else if (lastL && !bL && c[k].close < lastL.price) {
        lastEv = { type: trend === 1 ? 'CHoCH' : 'BOS', dir: -1, from: lastL.i, idx: k, price: lastL.price };
        events.push(lastEv); trend = -1; bL = true;
      }
      trendAt[k] = trend; lastEventAt[k] = lastEv;
    }
    return { trendAt, events, lastEventAt };
  }

  function candlePatterns(c, atr) {
    return c.map((x, i) => {
      const out = [], a = atr[i] || (x.high - x.low) || 1e-9;
      const body = Math.abs(x.close - x.open), range = x.high - x.low || 1e-9;
      const upper = x.high - Math.max(x.open, x.close), lower = Math.min(x.open, x.close) - x.low;
      const bull = x.close > x.open, bear = x.close < x.open;
      if (i >= 1) {
        const p = c[i - 1], pb = Math.abs(p.close - p.open);
        if (p.close < p.open && bull && x.close >= p.open && x.open <= p.close && body > pb && body > 0.3 * a) out.push('bullEng');
        if (p.close > p.open && bear && x.close <= p.open && x.open >= p.close && body > pb && body > 0.3 * a) out.push('bearEng');
        if (x.high < p.high && x.low > p.low) out.push('inside');
      }
      if (range > 0.6 * a) {
        if (lower >= 2 * body && upper <= 0.25 * range) out.push('hammer');
        if (upper >= 2 * body && lower <= 0.25 * range) out.push('star');
      }
      if (body <= 0.1 * range && range > 0.4 * a && !out.includes('hammer') && !out.includes('star')) out.push('doji');
      if (i >= 2) {
        const a2 = c[i - 2], a1 = c[i - 1], b2 = Math.abs(a2.close - a2.open), b1 = Math.abs(a1.close - a1.open);
        if (a2.close < a2.open && b2 > 0.6 * a && b1 < 0.4 * b2 && bull && x.close > (a2.open + a2.close) / 2) out.push('morning');
        if (a2.close > a2.open && b2 > 0.6 * a && b1 < 0.4 * b2 && bear && x.close < (a2.open + a2.close) / 2) out.push('evening');
      }
      return out;
    });
  }

  // TD Sequential setup count (1–9): consecutive closes above/below the close 4 bars earlier.
  function tdCount(c) {
    const up = new Array(c.length).fill(0), dn = new Array(c.length).fill(0);
    for (let i = 4; i < c.length; i++) {
      up[i] = c[i].close > c[i - 4].close ? (up[i - 1] >= 9 ? 1 : up[i - 1] + 1) : 0;
      dn[i] = c[i].close < c[i - 4].close ? (dn[i - 1] >= 9 ? 1 : dn[i - 1] + 1) : 0;
    }
    return { up, dn };
  }

  // Support / resistance zones from clustered recent pivots (display only).
  function zones(c, piv, atr) {
    const n = c.length; if (!n) return [];
    const a = atr[n - 1] || (c[n - 1].high - c[n - 1].low);
    const recent = piv.filter((p) => p.i > n - 400).sort((x, y) => x.price - y.price);
    const groups = [];
    for (const p of recent) {
      const g = groups[groups.length - 1];
      if (g && p.price - g.mean <= 0.5 * a) { g.m.push(p); g.mean = g.m.reduce((s, q) => s + q.price, 0) / g.m.length; }
      else groups.push({ m: [p], mean: p.price });
    }
    const last = c[n - 1].close;
    const z = groups.filter((g) => g.m.length >= 2).map((g) => ({
      top: Math.max(...g.m.map((q) => q.price)) + 0.1 * a, bottom: Math.min(...g.m.map((q) => q.price)) - 0.1 * a,
      touches: g.m.length, first: Math.min(...g.m.map((q) => q.i)), last: Math.max(...g.m.map((q) => q.i)),
      kind: g.mean < last ? 'support' : 'resistance', mid: g.mean,
    }));
    const sup = z.filter((x) => x.kind === 'support').sort((x, y) => y.mid - x.mid).slice(0, 4);
    const res = z.filter((x) => x.kind === 'resistance').sort((x, y) => x.mid - y.mid).slice(0, 4);
    return sup.concat(res);
  }

  function simulate(c, k, dir, sl, tp, maxBars) {
    for (let j = k + 1; j < c.length && j <= k + maxBars; j++) {
      const hitSL = dir === 1 ? c[j].low <= sl : c[j].high >= sl;
      const hitTP = dir === 1 ? c[j].high >= tp : c[j].low <= tp;
      if (hitSL) return { res: 'loss', at: j };          // same-bar SL+TP → count as loss (conservative)
      if (hitTP) return { res: 'win', at: j };
    }
    return { res: c.length - 1 >= k + maxBars ? 'expired' : 'open', at: null };
  }

  function emptyStat() { return { n: 0, w1: 0, w2: 0, l2: 0, open: 0 }; }
  function addStat(st, s) {
    if (s.r2.res === 'open') { st.open++; return; }
    st.n++; if (s.r1.res === 'win') st.w1++;
    if (s.r2.res === 'win') st.w2++; else if (s.r2.res === 'loss') st.l2++;
  }
  function finishStat(st, rr2) {
    st.wr1 = st.n ? st.w1 / st.n : null; st.wr2 = st.n ? st.w2 / st.n : null;
    st.exp = st.n ? (st.w2 * rr2 - st.l2) / st.n : null; // R per trade at TP2 (expired trades = 0R)
    return st;
  }

  function analyze(c, opt = {}) {
    const o = { swingLen: 5, rr1: 1, rr2: 2, maxBars: 100, minSamples: 5, slBuf: 0.2, ...opt };
    const n = c.length;
    if (n < 50) return null;
    const F = (v) => (o.digits != null ? Number(v).toFixed(o.digits) : String(+Number(v).toPrecision(8)));
    const atr = atrArr(c, 14);
    const piv = pivots(c, o.swingLen);
    const sw = swings(c, piv);
    const st = structure(c, piv);
    const pats = candlePatterns(c, atr);
    const td = tdCount(c);
    const zn = zones(c, piv, atr);

    // ---- signals (rule-based setups) ----
    const signals = [];
    const recentL = [], recentH = [];
    const byConf = [...piv].sort((a, b) => a.conf - b.conf);
    let pi = 0; const lastSig = { 1: -99, '-1': -99 };
    for (let k = 30; k < n; k++) {
      while (pi < byConf.length && byConf[pi].conf <= k) { const p = byConf[pi++]; (p.type === 'L' ? recentL : recentH).push(p); }
      const a = atr[k]; if (!a) continue;
      const cand = pats[k].filter((p) => PAT[p].dir !== 0).sort((x, y) => PAT[y].rank - PAT[x].rank);
      if (!cand.length) continue;
      const pat = cand[0], dir = PAT[pat].dir;
      if (k - lastSig[dir] <= 3) continue;
      const extreme = dir === 1 ? Math.min(c[k].low, c[k - 1].low) : Math.max(c[k].high, c[k - 1].high);
      const pool = (dir === 1 ? recentL : recentH).slice(-8);
      const near = pool.filter((p) => Math.abs(extreme - p.price) <= 0.5 * a).sort((x, y) => y.i - x.i)[0];
      const touches = near ? pool.filter((p) => Math.abs(p.price - near.price) <= 0.5 * a).length : 0;
      const trend = st.trendAt[k], ev = st.lastEventAt[k];
      let setup = null;
      if (trend === dir && near) setup = 'pullback';
      else if (ev && ev.type === 'CHoCH' && ev.dir === dir && k - ev.idx <= 20) setup = 'choch';
      else if (near && touches >= 2) setup = 'sr';
      if (!setup) continue;

      const entry = c[k].close;
      let sl = dir === 1 ? Math.min(extreme, near ? near.price : extreme) - o.slBuf * a : Math.max(extreme, near ? near.price : extreme) + o.slBuf * a;
      const risk = Math.abs(entry - sl);
      if (risk < 0.3 * a || risk > 4 * a) continue;
      const tp1 = entry + dir * risk * o.rr1, tp2 = entry + dir * risk * o.rr2;
      const opp = (dir === 1 ? recentH : recentL).slice().reverse().find((p) => (dir === 1 ? p.price > entry : p.price < entry));
      const reasons = [];
      reasons.push(trend === 1 ? 'โครงสร้างเป็นขาขึ้น (ทำ HH/HL และ BOS ขึ้น)' : trend === -1 ? 'โครงสร้างเป็นขาลง (ทำ LH/LL และ BOS ลง)' : 'ยังไม่มีเทรนด์ชัดเจน');
      if (ev && k - ev.idx <= 20) reasons.push(`${ev.type} ${ev.dir === 1 ? 'ขึ้น' : 'ลง'} เมื่อ ${k - ev.idx} แท่งก่อน`);
      if (near) reasons.push(`ราคากลับมาแตะ Swing ${dir === 1 ? 'Low' : 'High'} เดิมที่ ${F(near.price)}${touches >= 2 ? ` (โซนนี้ถูกทดสอบ ${touches} ครั้ง)` : ''}`);
      reasons.push(`เกิดแท่งเทียน ${PAT[pat].name}`);
      if (opp) reasons.push(`เป้าตามโครงสร้าง: Swing ${dir === 1 ? 'High' : 'Low'} ล่าสุด ${F(opp.price)}`);
      const s = { idx: k, time: c[k].time, dir, setup, pattern: pat, entry, sl, tp1, tp2, tpS: opp ? opp.price : null, risk, reasons };
      s.r1 = simulate(c, k, dir, sl, tp1, o.maxBars);
      s.r2 = simulate(c, k, dir, sl, tp2, o.maxBars);
      signals.push(s); lastSig[dir] = k;
    }

    // ---- learning: walk-forward statistics per setup + pattern ----
    const prior = {};
    for (const s of signals) {
      const key = s.setup + '|' + s.pattern;
      const known = signals.filter((x) => x !== s && x.setup + '|' + x.pattern === key && x.r2.at != null && x.r2.at < s.idx);
      const ps = emptyStat(); known.forEach((x) => addStat(ps, x)); finishStat(ps, o.rr2);
      s.prior = ps;
      s.learned = ps.n >= o.minSamples ? (ps.exp > 0 ? 'good' : 'bad') : 'unknown';
      prior[key] = ps;
    }
    const stats = { all: emptyStat(), learned: emptyStat(), bySetup: {}, byPattern: {}, byCombo: {} };
    for (const s of signals) {
      addStat(stats.all, s);
      if (s.learned === 'good') addStat(stats.learned, s);
      (stats.bySetup[s.setup] ||= emptyStat()); addStat(stats.bySetup[s.setup], s);
      (stats.byPattern[s.pattern] ||= emptyStat()); addStat(stats.byPattern[s.pattern], s);
      const key = s.setup + '|' + s.pattern; (stats.byCombo[key] ||= emptyStat()); addStat(stats.byCombo[key], s);
    }
    [stats.all, stats.learned, ...Object.values(stats.bySetup), ...Object.values(stats.byPattern), ...Object.values(stats.byCombo)].forEach((x) => finishStat(x, o.rr2));

    const lastTrend = st.trendAt[n - 1];
    return { n, atr, pivots: piv, swings: sw, events: st.events, trendAt: st.trendAt, lastEvent: st.lastEventAt[n - 1],
      lastTrend, patterns: pats, td, zones: zn, signals, stats, opt: o };
  }

  const api = { analyze, PAT, SETUP, _pivots: pivots, _structure: structure, _patterns: candlePatterns, _td: tdCount };
  if (typeof window !== 'undefined') window.AN = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
