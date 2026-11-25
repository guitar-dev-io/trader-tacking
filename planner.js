/* global S, store, $, esc, fmt, digits, activeSignal, el, label, chartW, yOf, dirty:writable, UP, DOWN, vcg */
// Position & scale-in calculator ("คำนวณ" tab): lot size from risk, add-on (เติมไม้) levels, average price,
// loss at SL, profit at TP, and the plan drawn on the chart.

S.plan = { balance: 1000, riskMode: 'pct', risk: 1, side: 'buy', entry: '', sl: '', tp1: '', tp2: '', vpp: '', lotStep: 0.01, minLot: 0.01,
  adds: 0, spacing: '', mode: 'avg', weight: 'equal', mult: 1.5, show: true, ...store.get('plan', {}) };
const savePlan = () => store.set('plan', S.plan);

// Contract size per 1.0 lot (typical; check your broker's contract specification)
function contractSize(sym) {
  if (/^XAU/.test(sym)) return 100;
  if (/^XAG/.test(sym)) return 5000;
  if (/^(XPT|XPD)/.test(sym)) return 100;
  if (/^(BTC|ETH|SOL|LTC|XRP|BNB|ADA|DOGE)/.test(sym)) return 1;
  if (/^[A-Z]{6}$/.test(sym)) return 100000;
  return 1;
}
// Converts a P/L amount in the symbol's quote currency to USD (account currency assumed USD)
function quoteToUSD(sym) {
  if (!/^[A-Z]{6,7}$/.test(sym)) return 1;
  const quote = sym.slice(-3), base = sym.slice(0, 3);
  if (quote === 'USD' || quote === 'UST') return 1;
  const q = S.quotes[sym];
  if (base === 'USD' && q) return 1 / q.bid;
  const direct = S.quotes[quote + 'USD'], inv = S.quotes['USD' + quote];
  if (direct) return direct.bid;
  if (inv) return 1 / inv.bid;
  return null;
}
// USD value of a 1.0 price move for 1.0 lot
function autoVpp(sym) { const c = quoteToUSD(sym); return c == null ? null : contractSize(sym) * c; }
function vpp() { const v = parseFloat(S.plan.vpp); return isFinite(v) && v > 0 ? v : autoVpp(S.symbol); }
const floorStep = (x, step) => Math.floor(x / step + 1e-9) * step;
const lotFmt = (x, step) => x.toFixed(Math.max(0, -Math.floor(Math.log10(step))));
const money = (v) => (v == null || !isFinite(v) ? '—' : (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 }));
function riskAmount() { const p = S.plan; return p.riskMode === 'pct' ? (+p.balance * +p.risk) / 100 : +p.risk; }

// lot for a single entry (used by the Long/Short drawing tool)
function plannerLot(entry, sl) {
  const v = vpp(); const dist = Math.abs(entry - sl); if (!v || !dist) return null;
  const lot = floorStep(riskAmount() / (dist * v), +S.plan.lotStep || 0.01);
  return lot >= (+S.plan.minLot || 0.01) ? lotFmt(lot, +S.plan.lotStep || 0.01) : null;
}

function computePlan() {
  const p = S.plan, dir = p.side === 'buy' ? 1 : -1;
  const entry = parseFloat(p.entry), sl = parseFloat(p.sl), tp1 = parseFloat(p.tp1), tp2 = parseFloat(p.tp2);
  const out = { warn: [], rows: [] };
  if (!isFinite(entry) || !isFinite(sl)) { out.warn.push('ใส่ราคาเข้าและ SL ก่อน'); return out; }
  if ((entry - sl) * dir <= 0) { out.warn.push(p.side === 'buy' ? 'Buy: SL ต้องต่ำกว่าราคาเข้า' : 'Sell: SL ต้องสูงกว่าราคาเข้า'); return out; }
  const v = vpp(); if (!v) { out.warn.push('คำนวณมูลค่าต่อจุดอัตโนมัติไม่ได้ (คู่เงินข้ามสกุล) — ใส่ "มูลค่า 1.0 ราคา ต่อ 1 lot (USD)" เอง หรือเพิ่มคู่ ???USD ใน watchlist'); return out; }
  const step = +p.lotStep || 0.01, minLot = +p.minLot || 0.01, adds = Math.max(0, Math.min(20, parseInt(p.adds, 10) || 0));
  const slDist = Math.abs(entry - sl);
  let spacing = parseFloat(p.spacing);
  if (!isFinite(spacing) || spacing <= 0) spacing = adds ? slDist / (adds + 1) : 0;
  const levels = [];
  for (let i = 0; i <= adds; i++) {
    const price = p.mode === 'avg' ? entry - dir * i * spacing : entry + dir * i * spacing;
    if (p.mode === 'avg' && (price - sl) * dir <= 0) { out.warn.push(`ไม้ที่ ${i + 1} (${fmt(price)}) เลย SL แล้ว — ตัดออก (ลดจำนวนไม้หรือระยะเติม)`); break; }
    if (p.mode === 'pyramid' && isFinite(tp2) && (price - tp2) * dir >= 0) { out.warn.push(`ไม้ที่ ${i + 1} เลย TP2 แล้ว — ตัดออก`); break; }
    levels.push({ i, price, w: p.weight === 'mult' ? (+p.mult || 1) ** i : p.weight === 'down' ? (+p.mult || 1) ** (adds - i) : 1 });
  }
  const risk = riskAmount();
  const denom = levels.reduce((s, L) => s + L.w * Math.abs(L.price - sl) * v, 0);
  const base = risk / denom;
  let cumLot = 0, cumCost = 0;
  for (const L of levels) {
    L.lot = floorStep(base * L.w, step);
    if (L.lot < minLot) { out.warn.push(`ไม้ที่ ${L.i + 1} ได้ ${lotFmt(base * L.w, 0.0001)} lot ต่ำกว่าขั้นต่ำ ${minLot} — เพิ่มทุน/ความเสี่ยง หรือลดจำนวนไม้`); L.lot = 0; }
    cumLot += L.lot; cumCost += L.lot * L.price;
    const avg = cumLot ? cumCost / cumLot : null;
    const pnl = (target) => (isFinite(target) && cumLot ? (target - avg) * dir * cumLot * v : null);
    out.rows.push({ ...L, cumLot, avg, slLoss: pnl(sl), tp1: pnl(tp1), tp2: pnl(tp2), dist: (L.price - entry) * dir });
  }
  const last = out.rows[out.rows.length - 1];
  out.totalLot = cumLot; out.avg = last && last.avg; out.maxLoss = last && last.slLoss; out.v = v; out.spacing = spacing; out.risk = risk;
  out.firstOnly = out.rows[0];
  if (p.mode === 'avg' && adds) out.warn.push('การเติมไม้เฉลี่ยต้นทุน (สวนทาง) จะเพิ่มขนาดสถานะตอนราคาวิ่งผิดทาง — ต้องตั้ง SL รวมเสมอ ห้ามเลื่อน SL ออก');
  if (p.mode === 'pyramid' && adds) out.warn.push('Pyramid: ปกติควรเลื่อน SL ตามขึ้นมาเมื่อเติมไม้ ตารางนี้คิดแบบ SL เดิม (กรณีแย่สุด)');
  if (out.maxLoss != null && Math.abs(out.maxLoss) > +p.balance * 0.05) out.warn.push(`ขาดทุนสูงสุด ${money(out.maxLoss)} เกิน 5% ของทุน`);
  return out;
}

function renderPlanner() {
  const p = S.plan, r = computePlan(), d = digits(), step = +p.lotStep || 0.01;
  const q = S.quotes[S.symbol], av = autoVpp(S.symbol);
  const seg = (k, opts) => `<div class="seg">${opts.map(([v, t, cls = '']) => `<button data-seg="${k}" data-v="${v}" class="${p[k] === v ? 'on ' + cls : ''}">${t}</button>`).join('')}</div>`;
  const inp = (k, lbl, ph = '') => `<label>${lbl}<input data-k="${k}" type="number" step="any" value="${esc(p[k])}" placeholder="${ph}"></label>`;
  $('planner').innerHTML = `
    <div class="panel-h">เครื่องคำนวณขนาดไม้ / จุดเติม · ${S.symbol}</div>
    ${seg('side', [['buy', '▲ Buy', 'buy'], ['sell', '▼ Sell', 'sell']])}
    <div class="grid" style="margin-top:8px">
      ${inp('balance', 'ทุน (USD)')}
      <label>ความเสี่ยงต่อแผน<div class="seg"><input data-k="risk" type="number" step="any" value="${esc(p.risk)}" style="border-radius:6px 0 0 6px;min-width:0">
        <button data-seg="riskMode" data-v="pct" class="${p.riskMode === 'pct' ? 'on' : ''}">%</button><button data-seg="riskMode" data-v="amt" class="${p.riskMode === 'amt' ? 'on' : ''}">$</button></div></label>
      ${inp('entry', 'ราคาเข้า (ไม้แรก)', q ? fmt(p.side === 'buy' ? q.ask : q.bid) : '')}
      ${inp('sl', 'Stop Loss')}
      ${inp('tp1', 'TP1')}
      ${inp('tp2', 'TP2')}
    </div>
    <div class="btns" style="margin-top:8px">
      <button id="pl-now">ใช้ราคาตอนนี้</button><button id="pl-sig">จากสัญญาณล่าสุด</button><button id="pl-atr">SL = 1.5 ATR</button><button id="pl-rr">TP = 1R / 2R</button>
    </div>
    <h4>เติมไม้</h4>
    ${seg('mode', [['avg', 'เฉลี่ยต้นทุน (ราคาสวน)'], ['pyramid', 'Pyramid (ราคาไปทางเรา)']])}
    <div class="grid" style="margin-top:8px">
      ${inp('adds', 'จำนวนไม้เติม', '0')}
      ${inp('spacing', 'ระยะห่างแต่ละไม้ (ราคา)', r.spacing ? fmt(r.spacing) : 'อัตโนมัติ')}
      <label>แบ่ง lot<select data-k="weight"><option value="equal">เท่ากันทุกไม้</option><option value="mult">ไม้หลังใหญ่ขึ้น ×</option><option value="down">ไม้หลังเล็กลง ×</option></select></label>
      ${inp('mult', 'ตัวคูณ', '1.5')}
    </div>
    <h4>สเปกสัญญา</h4>
    <div class="grid">
      ${inp('vpp', 'มูลค่า 1.0 ราคา ต่อ 1 lot (USD)', av ? String(av) : 'ใส่เอง')}
      ${inp('lotStep', 'lot step')}
    </div>
    <p class="muted">อัตโนมัติ: ${S.symbol} 1 lot = ${contractSize(S.symbol).toLocaleString()} หน่วย${av ? ` → ราคาขยับ 1.0 = $${av.toLocaleString()} ต่อ lot` : ''} · ตรวจกับสเปกโบรกเกอร์อีกครั้ง</p>
    ${r.warn.map((w) => `<div class="warn">⚠️ ${esc(w)}</div>`).join('')}
    ${r.rows.length ? `
    <div class="sum">
      <span>ความเสี่ยงที่ตั้ง</span><b>${money(r.risk)}</b>
      <span>lot รวม (ทุกไม้)</span><b>${lotFmt(r.totalLot, step)}</b>
      <span>ต้นทุนเฉลี่ย / จุดคุ้มทุน</span><b>${fmt(r.avg)}</b>
      <span class="down">ขาดทุนถ้าโดน SL (ครบทุกไม้)</span><b class="down">${money(r.maxLoss)} (${((r.maxLoss / p.balance) * 100).toFixed(2)}%)</b>
      ${r.rows[r.rows.length - 1].tp1 != null ? `<span class="up">กำไรที่ TP1 (ครบทุกไม้)</span><b class="up">${money(r.rows[r.rows.length - 1].tp1)}</b>` : ''}
      ${r.rows[r.rows.length - 1].tp2 != null ? `<span class="up">กำไรที่ TP2 (ครบทุกไม้)</span><b class="up">${money(r.rows[r.rows.length - 1].tp2)}</b>` : ''}
      ${r.firstOnly.tp2 != null ? `<span>ถ้าได้แค่ไม้แรก → TP2</span><b>${money(r.firstOnly.tp2)} · RR ${(r.firstOnly.tp2 / -r.firstOnly.slLoss).toFixed(2)}</b>` : ''}
    </div>
    <table><thead><tr><th>#</th><th>ราคา</th><th>ระยะ</th><th>lot</th><th>รวม</th><th>เฉลี่ย</th><th>โดน SL</th><th>TP2</th></tr></thead><tbody>
    ${r.rows.map((x) => `<tr><td>${x.i + 1}</td><td>${fmt(x.price)}</td><td>${x.i ? (x.dist >= 0 ? '+' : '') + fmt(x.dist) : '—'}</td><td>${lotFmt(x.lot, step)}</td><td>${lotFmt(x.cumLot, step)}</td>
      <td>${fmt(x.avg)}</td><td class="down">${money(x.slLoss)}</td><td class="up">${money(x.tp2)}</td></tr>`).join('')}
    </tbody></table>
    <p class="muted">แต่ละแถว = ผลถ้าได้ไม้ถึงแถวนั้น (ไม้ 1..n) · ระยะ = ห่างจากไม้แรก</p>` : ''}
    <label class="chk"><input type="checkbox" id="pl-show" ${p.show ? 'checked' : ''}> แสดงแผนบนกราฟ</label>
    <p class="disclaimer" style="margin-top:8px">ตัวเลขเป็นการประมาณ ไม่รวมสเปรด/ค่าคอมมิชชัน/swap · ไม่ใช่คำแนะนำการลงทุน</p>`;

  const sel = $('planner').querySelector('select[data-k="weight"]'); sel.value = p.weight;
  $('planner').querySelectorAll('input[data-k], select[data-k]').forEach((i) => (i.onchange = () => { p[i.dataset.k] = i.value; savePlan(); renderPlanner(); dirty = true; }));
  $('planner').querySelectorAll('[data-seg]').forEach((b) => (b.onclick = () => { p[b.dataset.seg] = b.dataset.v; savePlan(); renderPlanner(); dirty = true; }));
  $('pl-show').onchange = () => { p.show = $('pl-show').checked; savePlan(); dirty = true; };
  $('pl-now').onclick = () => { const qq = S.quotes[S.symbol]; if (!qq) return; p.entry = fmt(p.side === 'buy' ? qq.ask : qq.bid); savePlan(); renderPlanner(); dirty = true; };
  $('pl-sig').onclick = () => {
    const s = activeSignal() || (S.A && S.A.signals[S.A.signals.length - 1]); if (!s) return;
    Object.assign(p, { side: s.dir === 1 ? 'buy' : 'sell', entry: fmt(s.entry), sl: fmt(s.sl), tp1: fmt(s.tp1), tp2: fmt(s.tp2) }); savePlan(); renderPlanner(); dirty = true;
  };
  $('pl-atr').onclick = () => {
    const a = S.A && S.A.atr[S.A.n - 1]; const e = parseFloat(p.entry); if (!a || !isFinite(e)) return;
    p.sl = fmt(e - (p.side === 'buy' ? 1 : -1) * 1.5 * a); savePlan(); renderPlanner(); dirty = true;
  };
  $('pl-rr').onclick = () => {
    const e = parseFloat(p.entry), s = parseFloat(p.sl); if (!isFinite(e) || !isFinite(s)) return;
    p.tp1 = fmt(e + (e - s)); p.tp2 = fmt(e + 2 * (e - s)); savePlan(); renderPlanner(); dirty = true;
  };
}

// fill from a Long/Short drawing (double-click it)
function plannerFrom(d) {
  const e = d.pts[0].price, sl = d.pts[1].price, rr = d.rr || 2;
  Object.assign(S.plan, { side: d.type === 'long' ? 'buy' : 'sell', entry: fmt(e), sl: fmt(sl), tp1: fmt(e + (e - sl)), tp2: fmt(e + (e - sl) * rr) });
  savePlan(); renderPlanner(); dirty = true;
  document.querySelector('#tabs [data-tab="calc"]').click();
}

function drawPlanner(W) {
  if (!S.plan.show || $('tab-calc').classList.contains('hidden')) return;
  const r = computePlan(); if (!r.rows.length) return;
  const line = (price, color, text, dash) => { const y = yOf(price); if (y == null) return; el('line', { x1: W * 0.55, y1: y, x2: W, y2: y, stroke: color, 'stroke-width': 1.2, 'stroke-dasharray': dash || '' }); label(W * 0.55, y + 4, text, color, '#fff', 'end'); };
  const step = +S.plan.lotStep || 0.01;
  line(parseFloat(S.plan.sl), DOWN, `SL ${fmt(parseFloat(S.plan.sl))}`);
  if (isFinite(parseFloat(S.plan.tp1))) line(parseFloat(S.plan.tp1), '#1e7d74', `TP1 ${fmt(parseFloat(S.plan.tp1))}`, '4 3');
  if (isFinite(parseFloat(S.plan.tp2))) line(parseFloat(S.plan.tp2), UP, `TP2 ${fmt(parseFloat(S.plan.tp2))}`);
  r.rows.forEach((x) => line(x.price, '#2962ff', `${x.i ? 'เติม #' + (x.i + 1) : 'Entry'} ${lotFmt(x.lot, step)} lot`, x.i ? '5 4' : ''));
  if (r.rows.length > 1) line(r.avg, '#d6d9e0', `เฉลี่ย ${fmt(r.avg)}`, '2 3');
}

document.querySelector('#tabs [data-tab="calc"]').addEventListener('click', () => { renderPlanner(); dirty = true; });
renderPlanner();
