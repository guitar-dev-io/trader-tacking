// Bounce finder ("หาจุดเด้ง"): zones where price is likely to react, ranked by confluence, with a ready
// limit-order plan (entry / SL / TP) and a walk-forward "did it bounce?" statistic per zone type.
// Input: CLOSED candles + the AN.analyze() result for the same candles. Sell zones are found by running the
// buy logic on a price-mirrored copy of the candles, so both sides use exactly the same rules.
(function () {
  const TYPE = {
    ob: { name: 'Order Block (Demand)', sname: 'Order Block (Supply)', short: 'OB', w: 3 },
    fvg: { name: 'FVG ยังไม่ถูกเติม', sname: 'FVG ยังไม่ถูกเติม', short: 'FVG', w: 2 },
    sr: { name: 'แนวรับ (Swing Low ซ้ำ)', sname: 'แนวต้าน (Swing High ซ้ำ)', short: 'S/R', w: 2 },
    swing: { name: 'Swing Low เดิม', sname: 'Swing High เดิม', short: 'SW', w: 1 },
    fib: { name: 'Fibo 61.8–78.6% (Golden pocket)', sname: 'Fibo 61.8–78.6% (Golden pocket)', short: 'FIB', w: 2 },
  };
  const PRIO = ['ob', 'fvg', 'sr', 'fib', 'swing'];

  const flip = (c) => c.map((b) => ({ time: b.time, open: -b.open, close: -b.close, high: -b.low, low: -b.high }));

  // first bar after `from` whose low reaches `hi`; stops (broken) if a close lands below `lo` first
  function firstTouch(c, from, lo, hi, to) {
    for (let j = from; j < to; j++) {
      if (c[j].low <= hi) return j;
      if (c[j].close < lo) return -1;
    }
    return null;
  }

  // All demand-type zones that exist at the end of c (buy side).
  function rawZones(c, atr, piv, upto) {
    const n = upto, out = [];
    // 1) Order blocks: last bearish candle before a strong impulse up
    for (let i = 5; i < n - 3; i++) {
      const a = atr[i]; if (!a || c[i].close >= c[i].open) continue;
      let mx = -Infinity; for (let k = i + 1; k <= i + 3; k++) mx = Math.max(mx, c[k].close);
      if (mx - c[i].high < 1.0 * a || mx - c[i].low < 2 * a) continue;
      if (c[i + 1].close <= c[i + 1].open) continue;                   // impulse must start on the next bar
      const prevH = piv.filter((p) => p.type === 'H' && p.conf <= i).slice(-1)[0];
      out.push({ type: 'ob', lo: c[i].low, hi: c[i].open, born: i + 3, at: i, bos: !!(prevH && mx > prevH.price) });
      i += 2;
    }
    // 2) Bullish fair value gaps
    for (let i = 2; i < n; i++) {
      const a = atr[i]; if (!a) continue;
      const gLo = c[i - 2].high, gHi = c[i].low;
      if (gHi - gLo >= 0.3 * a) out.push({ type: 'fvg', lo: gLo, hi: gHi, born: i, at: i - 1 });
    }
    // 3) swing lows (single) and clusters (S/R)
    const lows = piv.filter((p) => p.type === 'L' && p.conf < n && p.i > n - 500);
    const a0 = atr[n - 1] || 1;
    const groups = [];
    for (const p of [...lows].sort((x, y) => x.price - y.price)) {
      const g = groups[groups.length - 1];
      if (g && p.price - g.max <= 0.5 * a0) { g.m.push(p); g.max = p.price; } else groups.push({ m: [p], max: p.price, min: p.price });
    }
    for (const g of groups) {
      const last = g.m.reduce((x, y) => (y.conf > x.conf ? y : x));
      out.push({ type: g.m.length >= 2 ? 'sr' : 'swing', lo: g.min - 0.1 * a0, hi: g.max + 0.1 * a0, born: last.conf, at: Math.min(...g.m.map((p) => p.i)), touches: g.m.length });
    }
    // 4) golden pocket of the latest up-leg (last confirmed swing low → highest high after it)
    const lastL = lows.filter((p) => p.conf <= n - 1).slice(-1)[0];
    if (lastL) {
      let hiI = lastL.i; for (let k = lastL.i; k < n; k++) if (c[k].high > c[hiI].high) hiI = k;
      const H = c[hiI].high, L = lastL.price, rng = H - L;
      if (rng > 3 * a0 && hiI > lastL.i) out.push({ type: 'fib', lo: H - 0.786 * rng, hi: H - 0.618 * rng, born: hiI, at: lastL.i, leg: { L, H } });
    }
    return out;
  }

  // keep zones still valid at bar n-1: not closed through, and below/at current price
  function alive(c, z, n) {
    let touches = 0, inTouch = false;
    for (let j = z.born + 1; j < n; j++) {
      if (c[j].close < z.lo) return null;
      if (z.type === 'fvg' && c[j].low <= z.lo) return null;          // gap fully filled
      const t = c[j].low <= z.hi;
      if (t && !inTouch) touches++;
      inTouch = t;
    }
    return { ...z, retests: touches };
  }

  // walk-forward bounce statistic per type: limit at zone top on first touch, SL under the zone, did it reach 1R / 2R?
  function history(c, atr, zs, n, slBuf, maxBars) {
    const st = {};
    for (const z of zs) {
      if (z.type !== 'ob' && z.type !== 'fvg') continue;
      const j = firstTouch(c, z.born + 1, z.lo, z.hi, n); if (j == null || j < 0) continue;
      const a = atr[z.born] || atr[j]; const entry = Math.min(c[j].open, z.hi), sl = z.lo - slBuf * a, risk = entry - sl;
      if (risk <= 0) continue;
      let r1 = null, r2 = null;
      for (let k = j; k < n && k <= j + maxBars; k++) {
        if (c[k].low <= sl) { r1 ??= 'loss'; r2 ??= 'loss'; break; }
        if (k > j || c[k].close > entry) {                               // the touch bar itself only counts if it closed up
          if (r1 == null && c[k].high >= entry + risk) r1 = 'win';
          if (r2 == null && c[k].high >= entry + 2 * risk) { r2 = 'win'; break; }
        }
      }
      if (r2 == null && j + maxBars >= n) continue;                     // still open → not counted
      const key = z.type + (z.trend === 1 ? '+' : '');
      for (const k of [z.type, key]) { const s = (st[k] ||= { n: 0, w1: 0, w2: 0 }); s.n++; if (r1 === 'win') s.w1++; if (r2 === 'win') s.w2++; }
    }
    for (const s of Object.values(st)) { s.wr1 = s.w1 / s.n; s.wr2 = s.w2 / s.n; }
    return st;
  }

  // Liquidity map ("SL เม่า"): untaken swing highs/lows, equal highs/lows and previous-day high/low are where
  // retail stop-losses pile up. Sweeps = a wick runs those stops and the bar closes back (stop hunt).
  function liquidity(c, piv, atr, n, price) {
    const a = atr[n - 1] || 1, pools = { lows: [], highs: [] }, sweeps = [];
    const lvls = [];
    for (const p of piv) if (p.conf < n && p.i > n - 400) lvls.push({ price: p.price, side: p.type === 'L' ? 'low' : 'high', i: p.i, conf: p.conf, kind: 'swing' });
    // previous day high/low (intraday timeframes only)
    const step = n > 1 ? c[n - 1].time - c[n - 2].time : 86400;
    if (step < 86400) {
      const day = (t) => Math.floor(t / 86400), d0 = day(c[n - 1].time);
      let k = n - 1; while (k >= 0 && day(c[k].time) === d0) k--;
      if (k >= 0) { const d1 = day(c[k].time); let hi = -Infinity, lo = Infinity, hiI = k, loI = k;
        for (let j = k; j >= 0 && day(c[j].time) === d1; j--) { if (c[j].high > hi) { hi = c[j].high; hiI = j; } if (c[j].low < lo) { lo = c[j].low; loI = j; } }
        lvls.push({ price: hi, side: 'high', i: hiI, conf: k + 1, kind: 'pd' }, { price: lo, side: 'low', i: loI, conf: k + 1, kind: 'pd' }); }
    }
    for (const L of lvls) {
      let taken = null;
      for (let j = L.conf; j < n; j++) {
        const through = L.side === 'low' ? c[j].low < L.price : c[j].high > L.price;
        if (!through) continue;
        const back = L.side === 'low' ? c[j].close > L.price : c[j].close < L.price;
        if (back && n - 1 - j <= 40) sweeps.push({ j, side: L.side, price: L.price, kind: L.kind, depth: Math.abs((L.side === 'low' ? c[j].low : c[j].high) - L.price) });
        taken = j; break;
      }
      if (taken == null && Math.abs(L.price - price) <= 15 * a) (L.side === 'low' ? pools.lows : pools.highs).push(L);
    }
    // merge equal highs / lows
    const merge = (arr) => { arr.sort((x, y) => x.price - y.price); const out = [];
      for (const L of arr) { const g = out[out.length - 1];
        if (g && L.price - g.max <= 0.15 * a) { g.m.push(L); g.max = L.price; g.min = Math.min(g.min, L.price); }
        else out.push({ m: [L], min: L.price, max: L.price }); }
      return out.map((g) => { const sw = g.m.filter((x) => x.kind === 'swing').length, pd = g.m.some((x) => x.kind === 'pd');
        return { price: g.m[0].side === 'low' ? g.min : g.max, side: g.m[0].side, count: sw, pd, first: Math.min(...g.m.map((x) => x.i)),
          strength: sw + (pd ? 1 : 0) + (sw >= 2 ? 1 : 0) }; }); };
    pools.lows = merge(pools.lows).filter((p) => p.price < price).sort((x, y) => y.price - x.price);
    pools.highs = merge(pools.highs).filter((p) => p.price > price).sort((x, y) => x.price - y.price);
    sweeps.sort((x, y) => y.j - x.j);
    return { ...pools, sweeps: sweeps.slice(0, 6) };
  }
  const poolName = (p, sell) => { const lowWord = sell ? 'High' : 'Low', highWord = sell ? 'Low' : 'High'; const w = p.side === 'low' ? lowWord : highWord;
    return p.count >= 2 ? `Equal ${w}s ×${p.count}${p.pd ? ' + ' + (p.side === 'low' ? (sell ? 'PDH' : 'PDL') : (sell ? 'PDL' : 'PDH')) : ''}` : p.pd && !p.count ? (p.side === 'low' ? (sell ? 'PDH' : 'PDL') : (sell ? 'PDL' : 'PDH')) + ' (ของเมื่อวาน)' : `Swing ${w}${p.pd ? ' + ' + (p.side === 'low' ? (sell ? 'PDH' : 'PDL') : (sell ? 'PDL' : 'PDH')) : ''}`; };

  function side(c, A, piv, trendAt, o) {
    const n = c.length, atr = A.atr, a = atr[n - 1] || (c[n - 1].high - c[n - 1].low), price = o.price;
    const all = rawZones(c, atr, piv, n).map((z) => ({ ...z, trend: trendAt[z.at] || 0 }));
    const stats = history(c, atr, all, n, o.slBuf, o.maxBars);
    let live = all.map((z) => alive(c, z, n)).filter(Boolean).filter((z) => z.lo <= price && price - z.hi <= 10 * a && z.hi - z.lo <= 3 * a);
    // merge overlapping zones into confluence areas
    live.sort((x, y) => y.hi - x.hi);
    const areas = [];
    for (const z of live) {
      const g = areas.find((g) => z.hi >= g.lo - 0.25 * a && z.lo <= g.hi + 0.25 * a);
      if (g) g.parts.push(z); else areas.push({ parts: [z], lo: z.lo, hi: z.hi });
      if (g) { const ulo = Math.min(g.lo, z.lo), uhi = Math.max(g.hi, z.hi); if (uhi - ulo <= 1.5 * a) { g.lo = ulo; g.hi = uhi; } }
    }
    const trendNow = trendAt[n - 1] || 0;
    const highs = piv.filter((p) => p.type === 'H' && p.conf < n);
    const LQ = liquidity(c, piv, atr, n, price);
    const out = areas.map((g) => {
      const types = [...new Set(g.parts.map((p) => p.type))].sort((x, y) => PRIO.indexOf(x) - PRIO.indexOf(y));
      const main = g.parts.find((p) => p.type === types[0]);
      let score = 0; const why = [];
      for (const t of types) {
        const p = g.parts.find((q) => q.type === t);
        score += TYPE[t].w;
        if (t === 'ob') { if (p.bos) score += 1; why.push({ t, txt: (o.sell ? 'Order Block: แท่งเขียวสุดท้ายก่อนราคาร่วงแรง' : 'Order Block: แท่งแดงสุดท้ายก่อนราคาพุ่งแรง') + (p.bos ? ' และทะลุโครงสร้าง (BOS)' : '') }); }
        else if (t === 'fvg') why.push({ t, txt: 'Fair Value Gap (ช่องว่างราคา) ที่ยังไม่ถูกเติมเต็ม' });
        else if (t === 'sr') { if (p.touches >= 3) score += 1; why.push({ t, txt: `${o.sell ? 'แนวต้าน' : 'แนวรับ'}ที่ราคาเคยกลับตัว ${p.touches} ครั้ง` }); }
        else if (t === 'swing') why.push({ t, txt: `${o.sell ? 'Swing High' : 'Swing Low'} เดิม (เคยกลับตัวตรงนี้)` });
        else if (t === 'fib') why.push({ t, txt: `Fibo 61.8–78.6% ของขา${o.sell ? 'ลง' : 'ขึ้น'}ล่าสุด` });
      }
      if (types.length >= 2) { score += types.length - 1; why.push({ t: 'conf', txt: `มีเหตุผลซ้อนกัน ${types.length} อย่าง (confluence)` }); }
      const retests = Math.max(...g.parts.filter((p) => p.type === 'ob' || p.type === 'fvg').map((p) => p.retests), -1);
      if (retests === 0) { score += 1; why.push({ t: 'fresh', txt: 'โซนยังไม่เคยถูกทดสอบ (fresh) — แรงเด้งมักดีที่สุดครั้งแรก' }); }
      else if (retests >= 2) { score -= 1; why.push({ t: 'used', txt: `ถูกทดสอบไปแล้ว ${retests} ครั้ง — แรงอาจเหลือน้อย`, neg: true }); }
      // (in the mirrored sell run trend +1 means "with the trade" too)
      if (trendNow === 1) { score += 2; why.push({ t: 'trend', txt: o.sell ? 'ตามเทรนด์ขาลง (ขายตอนราคาเด้งขึ้น)' : 'ตามเทรนด์ขาขึ้น (ซื้อตอนราคาย่อ)' }); }
      else if (trendNow === -1) { score -= 2; why.push({ t: 'trend', txt: (o.sell ? 'สวนเทรนด์ขาขึ้น' : 'สวนเทรนด์ขาลง') + ' — เสี่ยงกว่า ควรรอแท่งยืนยัน', neg: true }); }
      else why.push({ t: 'trend', txt: 'ตลาดยังไม่มีเทรนด์ชัด (ไซด์เวย์) — เด้งในกรอบ เป้าไม่ควรไกล' });
      const dA = (price - g.hi) / a;
      if (dA > 3) { const pen = Math.floor(dA / 2) - 1; score -= pen; why.push({ t: 'far', txt: `ยังอยู่ไกลจากราคาปัจจุบัน (เกิน ${(pen + 1) * 2} ATR)`, neg: true }); }
      // stops resting just above the zone → price often dips to grab them, then bounces from the zone
      const above = LQ.lows.find((p) => p.price > g.hi && p.price - g.hi <= 1.5 * a);
      if (above) { score += 1; why.push({ t: 'liq', txt: `${o.sell ? 'ใต้' : 'เหนือ'}โซนมี SL เม่ากองอยู่ (${poolName(above, o.sell)} ที่ ${o.F(above.price)}) — ราคามัก${o.sell ? 'ขึ้น' : 'ลง'}มากวาดตรงนั้นก่อนแล้วเด้งในโซน` }); }
      const entry = g.hi; let sl = g.lo - o.slBuf * a;
      // our SL must not sit on an obvious stop cluster (it would be hunted together with everyone else's)
      const trap = LQ.lows.find((p) => p.price <= g.lo && p.price > sl - 0.4 * a);
      if (trap) { sl = Math.min(sl, trap.price - 0.3 * a); why.push({ t: 'slhunt', txt: `ขยับ SL ${o.sell ? 'ขึ้นไปเหนือ' : 'ลงไปใต้'} ${poolName(trap, o.sell)} (${o.F(trap.price)}) ที่คนวาง SL กันเยอะ — กันโดนกวาด` }); }
      const risk = Math.max(entry - sl, 0.3 * a);
      // target = the nearest untaken opposite pool ("ที่ที่มีเงิน"), else the nearest swing high
      const pool = LQ.highs.find((p) => p.price > entry + 0.5 * risk && p.price - entry <= 6 * risk);
      const tgt = pool || highs.filter((p) => p.price > entry + 0.5 * risk).sort((x, y) => x.price - y.price)[0];
      const tp1 = tgt ? tgt.price : entry + o.rr1 * risk;
      if (pool) why.push({ t: 'tgt', txt: `TP1 = ${poolName(pool, o.sell)} ที่ ${o.F(pool.price)} — มี SL ฝั่งตรงข้ามกองอยู่ ราคามักวิ่งไปเก็บ` });
      if (tp1 - entry < risk) { score -= 1; why.push({ t: 'rr', txt: 'เป้าแรก (Swing ถัดไป) ใกล้กว่า 1R — ผลตอบแทนไม่คุ้มความเสี่ยง', neg: true }); }
      const tp2 = Math.max(entry + o.rr2 * risk, tp1);
      // status from the live price and the last closed bar
      const b = c[n - 1];
      let status = 'wait';
      if (price <= g.hi) status = 'in';
      const sw = LQ.sweeps.find((x) => x.side === 'low' && n - 1 - x.j <= 3 && x.price >= g.lo - 0.5 * a && x.price <= g.hi + 1.5 * a);
      if (sw) { score += 2; why.push({ t: 'sweep', txt: `เพิ่งกวาด SL เม่า${o.sell ? 'เหนือ' : 'ใต้'} ${o.F(sw.price)} แล้วปิดกลับ (${n - 1 - sw.j === 0 ? 'แท่งล่าสุด' : n - 1 - sw.j + ' แท่งก่อน'}) — สัญญาณเด้งที่ดี` }); }
      const pat = (A.patterns[n - 1] || []).filter((p) => (o.sell ? ['bearEng', 'star', 'evening'] : ['bullEng', 'hammer', 'morning']).includes(p));
      if (b.low <= g.hi && b.close > g.hi - 0.1 * (g.hi - g.lo) && b.close >= b.open && (pat.length || b.close > g.hi)) status = 'confirmed';
      if (sw && sw.j === n - 1 && b.close >= g.lo) status = 'confirmed';
      const st = stats[main.type + (trendNow === 1 ? '+' : '')] && stats[main.type + (trendNow === 1 ? '+' : '')].n >= 5 ? stats[main.type + (trendNow === 1 ? '+' : '')] : stats[main.type];
      return { lo: g.lo, hi: g.hi, born: Math.min(...g.parts.map((p) => p.at)), types, main: main.type, score, stars: Math.max(1, Math.min(5, Math.round(score / 2))),
        why, entry, sl, risk, tp1, tp2, rr1: (tp1 - entry) / risk, rr2: (tp2 - entry) / risk, dist: price - g.hi, distAtr: (price - g.hi) / a, status, pattern: pat[0] || null, stat: st || null };
    });
    out.sort((x, y) => y.score - x.score || x.dist - y.dist);
    return { zones: out.slice(0, o.max), stats, LQ };
  }

  function find(c, A, opt = {}) {
    if (!A || c.length < 60) return null;
    const o = { slBuf: 0.2, rr1: 1, rr2: 2, maxBars: 100, max: 4, swingLen: 5, ...opt };
    const n = c.length; if (o.price == null) o.price = c[n - 1].close;
    const F = o.F || ((v) => String(+Number(v).toPrecision(8)));
    o.F = (v) => F(Math.abs(v)); // prices in the mirrored run are negative
    const buy = side(c, A, A.pivots, A.trendAt, { ...o, sell: false });
    const fc = flip(c), fpiv = A.pivots.map((p) => ({ ...p, type: p.type === 'H' ? 'L' : 'H', price: -p.price }));
    const fA = { ...A, patterns: A.patterns };
    const sellRaw = side(fc, fA, fpiv, A.trendAt.map((t) => -t), { ...o, price: -o.price, sell: true });
    const un = (z) => ({ ...z, lo: -z.hi, hi: -z.lo, entry: -z.entry, sl: -z.sl, tp1: -z.tp1, tp2: -z.tp2 });
    // in the mirrored run "bullish close" means a bearish close in reality — status logic already mirrored via flip
    return { buy: buy.zones, sell: sellRaw.zones.map(un), stats: { buy: buy.stats, sell: sellRaw.stats }, price: o.price, atr: A.atr[n - 1], liq: buy.LQ };
  }

  const api = { find, TYPE, poolName };
  if (typeof window !== 'undefined') window.BOUNCE = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
