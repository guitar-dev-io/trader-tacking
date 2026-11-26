import { PT, def } from './src/pt.ts';
import { toast } from './src/ui/toast.ts';
def({ MM_LEARN: [() => MM_LEARN] });
import { LESSONS_EXTRA, LESSON_CATS } from './lessons-guide.js';
import { ICON } from './icons.js';
import { MM } from './src/legacy/core.ts';
import { esc, store } from './app-core.js';
import { pages } from './src/pages/registry.ts';
let MM_LEARN; // set below; exported (was window.MM_LEARN)
// Money Management (MM) lessons, the "MM plan by account size" table and random calculation practice.
// Loaded after lessons-guide.js (adds a lesson category) and before app.js renders the lesson book.
(function () {
  const ic = (n, s = 14) => (typeof ICON !== 'undefined' && ICON.html ? ICON.html(n, s) : '');
  const $$ = (r, q) => r.querySelector(q);
  const usd = (v, d = 2) => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: v % 1 ? Math.min(d, 2) : 0, maximumFractionDigits: d });
  const n = (v, d = 2) => Number(v).toLocaleString('en-US', { maximumFractionDigits: d });
  const lot = (v) => Number(v).toFixed(2);
  const withUnit = (v, u) => (u === '$' ? usd(v, 4) : `${n(v, 4)}${u ? ' ' + u : ''}`);

  // ------------------------------------------------------------ small theme-aware figures (currentColor + CSS vars)
  function bars(items, o = {}) {      // items: [{label, v, col}] horizontal bars
    const W = 300, rowH = 22, H = items.length * rowH + 8, max = o.max || Math.max(...items.map((x) => Math.abs(x.v))), L = o.lw || 92;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="mm-fig" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif" font-size="10">`;
    items.forEach((x, i) => {
      const y = 6 + i * rowH, w = Math.max(2, ((W - L - 50) * Math.abs(x.v)) / max);
      s += `<text x="${L - 6}" y="${y + 12}" text-anchor="end" style="fill:var(--muted)">${x.label}</text>`;
      s += `<rect x="${L}" y="${y + 2}" width="${w.toFixed(1)}" height="14" rx="3" style="fill:${x.col || 'var(--accent)'};opacity:.85"/>`;
      s += `<text x="${(L + w + 5).toFixed(1)}" y="${y + 13}" style="fill:var(--text)">${x.t || n(x.v)}</text>`;
    });
    return `<div class="lg-fig">${s}</svg>${o.cap ? `<div class="lg-cap">${o.cap}</div>` : ''}</div>`;
  }
  function curve(series, o = {}) {   // series: [{pts:[y...], col, label}] line chart
    const W = 300, H = 120, P = 26, all = series.flatMap((x) => x.pts), lo = Math.min(...all), hi = Math.max(...all), N = series[0].pts.length - 1;
    const X = (i) => P + (i / N) * (W - P - 8), Y = (v) => H - 16 - ((v - lo) / (hi - lo || 1)) * (H - 28);
    let s = `<svg viewBox="0 0 ${W} ${H}" class="mm-fig" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif" font-size="9">`;
    s += `<line x1="${P}" x2="${W - 6}" y1="${H - 16}" y2="${H - 16}" style="stroke:var(--line)"/><line x1="${P}" x2="${P}" y1="8" y2="${H - 16}" style="stroke:var(--line)"/>`;
    s += `<text x="${P - 3}" y="${Y(hi) + 3}" text-anchor="end" style="fill:var(--muted)">${n(hi, 0)}</text><text x="${P - 3}" y="${Y(lo) + 3}" text-anchor="end" style="fill:var(--muted)">${n(lo, 0)}</text>`;
    series.forEach((sr, k) => {
      s += `<polyline fill="none" stroke-width="2" style="stroke:${sr.col}" points="${sr.pts.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}"/>`;
      s += `<text x="${W - 8}" y="${Y(sr.pts[N]) + (k ? 11 : -4)}" text-anchor="end" style="fill:${sr.col}">${sr.label}</text>`;
    });
    if (o.xl) s += `<text x="${W - 6}" y="${H - 4}" text-anchor="end" style="fill:var(--muted)">${o.xl}</text>`;
    return `<div class="lg-fig">${s}</svg>${o.cap ? `<div class="lg-cap">${o.cap}</div>` : ''}</div>`;
  }
  const UPC = 'var(--up)', DNC = 'var(--down)', AC = 'var(--accent)', WC = 'var(--warn)';
  const NA = '<p class="lg-warn">เนื้อหาเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน — ตัวเลขสเปกเป็นค่าทั่วไป ตรวจกับโบรกเกอร์ของคุณเสมอ</p>';
  const practiceBtn = (kind) => `<button class="mm-go" data-mm-practice="${kind || ''}">${ic('calculator')}ฝึกโจทย์${kind ? ' ' + MM.KIND_NAME[kind] : 'คำนวณ'}</button>`;

  // numbers used in the lesson text come from mm.js so they always match the calculator
  const P1000 = MM.plan(1000), P100 = MM.plan(100);
  const comp = (() => { const a = [1000], b = [1000]; for (let i = 0; i < 24; i++) { a.push(a[i] * 1.03); b.push(b[i] + 30); } return { a, b }; })();
  const streak = Array.from({ length: 11 }, (_, i) => i);

  const LESSONS = [
    { t: 'ความเสี่ยงต่อไม้ 1–2% คืออะไร ทำไมต้องจำกัด', b: `
${bars([1, 2, 5, 10].map((p) => ({ label: `เสี่ยง ${p}%/ไม้`, v: 100 - MM.afterLosses(100, p, 10), t: `-${n(100 - MM.afterLosses(100, p, 10), 1)}%`, col: p <= 2 ? UPC : p <= 5 ? WC : DNC })), { cap: 'แพ้ติดกัน 10 ไม้ พอร์ตหายไปเท่าไร' })}
<p><b>ความเสี่ยงต่อไม้</b> = เงินที่ยอมเสียถ้าโดน SL คิดเป็น % ของทุน เช่น ทุน $1,000 เสี่ยง 1% = เสียได้ไม่เกิน <b>$10</b> ต่อไม้</p>
<ul><li>แพ้ติดกัน 10 ไม้เกิดขึ้นได้จริงแม้ระบบดี — ที่ 1% พอร์ตลดแค่ ~${n(100 - MM.afterLosses(100, 1, 10), 1)}% แต่ที่ 10% พอร์ตหายไป ~${n(100 - MM.afterLosses(100, 10, 10), 0)}%</li>
<li>มือใหม่: <b>0.5–1%</b> · มีระบบชัดเจนและบันทึกผลแล้ว: <b>1–2%</b> · เกิน 2% ต่อไม้ = เสี่ยงล้างพอร์ตเร็วมาก</li>
<li>เปิดหลายไม้พร้อมกันให้นับรวม: 3 ไม้ × 1% = เสี่ยงรวม 3%</li></ul>
<p class="lg-tip">ตั้ง % ความเสี่ยงก่อน แล้วค่อยคำนวณ lot จาก SL — ไม่ใช่เลือก lot ก่อนแล้วค่อยหาที่วาง SL</p>${practiceBtn('lot')}${NA}` },

    { t: 'สูตรคำนวณ lot: ทองคำ (XAUUSD) และ Forex', b: `
<table class="lt"><tr><th></th><th>XAUUSD (ทอง)</th><th>EURUSD (Forex)</th></tr>
<tr><td>1.00 lot</td><td>100 ออนซ์</td><td>100,000 EUR</td></tr>
<tr><td>หน่วยเล็กสุด</td><td>1 จุด = 0.01</td><td>1 pip = 0.0001 (= 10 จุด)</td></tr>
<tr><td>มูลค่าต่อหน่วย @1.00 lot</td><td><b>$1 ต่อจุด</b></td><td><b>$10 ต่อ pip</b></td></tr>
<tr><td>@0.01 lot</td><td>$0.01 ต่อจุด</td><td>$0.10 ต่อ pip</td></tr></table>
<p class="mm-formula">lot = เงินที่ยอมเสีย ÷ (ระยะ SL × มูลค่าต่อหน่วยที่ 1.00 lot)</p>
<ol><li>ทุน $1,000 เสี่ยง 1% = <b>$10</b></li>
<li>ทอง SL 1,000 จุด: 1.00 lot เสีย $1,000 → lot = 10 ÷ 1,000 = <b>${lot(P1000.gold[2].lotStd)}</b></li>
<li>ทอง SL 500 จุด → 10 ÷ 500 = <b>${lot(P1000.gold[1].lotStd)}</b> · SL 300 จุด → 10 ÷ 300 = 0.033 → ปัดลง <b>${lot(P1000.gold[0].lotStd)}</b></li>
<li>EURUSD SL 20 pips: 1.00 lot เสีย $200 → 10 ÷ 200 = <b>${lot(P1000.eur[0].lotStd)}</b></li></ol>
<p class="lg-tip">ปัด lot <b>ลง</b>เสมอ ปัดขึ้นเมื่อไรความเสี่ยงเกินที่ตั้งไว้ · แท็บ "คำนวณ" ในแอปทำให้อัตโนมัติ</p>${practiceBtn('lot')}${NA}` },

    { t: 'SL เป็นจุด ↔ เป็นเงิน (1000 จุด = เท่าไร)', b: `
${bars([300, 500, 1000, 1500, 2000].map((p) => ({ label: `SL ${n(p, 0)} จุด`, v: MM.lossAt('XAUUSD', 0.01, p), t: usd(MM.lossAt('XAUUSD', 0.01, p)), col: AC })), { cap: 'ทอง 0.01 lot: ขาดทุนถ้าโดน SL' })}
<p>คนเทรดทองชอบพูดว่า "SL 1000 จุด" = ราคาห่าง <b>10.00</b> (เช่น เข้า 3580.00 SL 3570.00)</p>
<ul><li>0.01 lot × 1,000 จุด = <b>$10</b> · 0.10 lot = $100 · 1.00 lot = $1,000</li>
<li>บางคนพูด "100 pips" ของทอง = 10.00 เหมือนกัน (โบรกส่วนใหญ่ 1 pip ทอง = 0.1) — ถามให้ชัดว่าหมายถึงจุดหรือ pip</li>
<li>Forex 5 ตำแหน่ง: 1 pip = 10 จุด → "SL 200 จุด" EURUSD = 20 pips</li></ul>${practiceBtn('loss')}${NA}` },

    { t: 'R:R และ Win rate ที่ต้องได้เพื่อเสมอตัว', b: `
${bars([0.5, 1, 1.5, 2, 3].map((rr) => ({ label: `R:R 1:${rr}`, v: MM.breakEvenWinRate(rr), t: `ต้องชนะ ≥ ${n(MM.breakEvenWinRate(rr), 1)}%`, col: rr >= 2 ? UPC : rr >= 1 ? WC : DNC })), { max: 70, cap: 'Win rate ขั้นต่ำที่ไม่ขาดทุน' })}
<p class="mm-formula">Win rate เสมอตัว = 1 ÷ (1 + R:R)</p>
<ul><li>R:R 1:2 → ชนะแค่ ${n(MM.breakEvenWinRate(2), 1)}% ก็ไม่ขาดทุน · R:R 1:0.5 (TP ใกล้กว่า SL) ต้องชนะเกิน ${n(MM.breakEvenWinRate(0.5), 1)}%</li>
<li>ความคาดหวังต่อไม้ (Expectancy) = Win% × RR − Loss% · ชนะ 45% ที่ RR 2 → ${n(MM.expectancy(45, 2), 2)}R ต่อไม้</li>
<li>สเปรด/คอมมิชชันกิน R:R จริง โดยเฉพาะ SL แคบ — คิดเผื่อเสมอ</li></ul>${practiceBtn('breakeven')}${NA}` },

    { t: 'Drawdown: ขาดทุน 50% ต้องกำไร 100% ถึงจะคืนทุน', b: `
${bars([10, 20, 30, 50, 70].map((d) => ({ label: `ขาดทุน ${d}%`, v: MM.recoveryPct(d), t: `ต้อง +${n(MM.recoveryPct(d), 1)}%`, col: d <= 20 ? WC : DNC })), { cap: 'กำไรที่ต้องทำเพื่อกลับมาเท่าทุน' })}
<p class="mm-formula">กำไรที่ต้องได้คืน = DD ÷ (100 − DD) × 100</p>
<p>ทุน $1,000 ขาดทุน 50% เหลือ $500 — จะกลับไป $1,000 ต้องได้ +$500 จากฐาน $500 = <b>+100%</b> ยิ่งลึกยิ่งกู้ยากแบบทวีคูณ</p>
<p class="lg-tip">จำกัด Drawdown ไว้ไม่เกิน 10–20% แล้วหยุดทบทวนระบบ ดีกว่าพยายาม "เอาคืน" ด้วยไม้ใหญ่</p>${practiceBtn('recovery')}${NA}` },

    { t: 'จำกัดขาดทุนรายวัน / รายสัปดาห์ และจำนวนไม้ที่เปิดพร้อมกัน', b: `
<table class="lt"><tr><th>กฎ (ทุน $1,000 เสี่ยง 1%)</th><th>ตัวเลข</th></tr>
<tr><td>เสี่ยงต่อไม้</td><td>${usd(P1000.risk)}</td></tr>
<tr><td>หยุดเทรดวันนั้นเมื่อขาดทุน 3R</td><td>${usd(P1000.dailyStop)} (${P1000.dailyStopPct}%)</td></tr>
<tr><td>หยุดทั้งสัปดาห์เมื่อขาดทุน 6R</td><td>${usd(P1000.weeklyStop)} (${P1000.weeklyStopPct}%)</td></tr>
<tr><td>ความเสี่ยงรวมไม้ที่เปิดพร้อมกัน ≤ 5%</td><td>สูงสุด ${P1000.maxOpen} ไม้ (${usd(P1000.maxOpenRisk)})</td></tr></table>
<ul><li>ขาดทุนติดกันแล้วอารมณ์จะพาเพิ่ม lot — กฎหยุดรายวันกันพอร์ตพังในวันเดียว</li>
<li>คู่ที่วิ่งไปทางเดียวกัน (เช่น XAUUSD กับ XAGUSD, EURUSD กับ GBPUSD) นับเป็นความเสี่ยงก้อนเดียวกัน</li></ul>${NA}` },

    { t: 'เติมไม้: เฉลี่ยต้นทุน vs Pyramid และอันตรายของ Martingale / Grid', b: `
${curve([{ pts: [1, 2, 4, 8, 16, 32, 64].map((x) => x * 0.01 * 100), col: DNC, label: 'Martingale ×2' }, { pts: [1, 1, 1, 1, 1, 1, 1].map((x) => x * 0.01 * 100), col: UPC, label: 'lot คงที่' }], { xl: 'ไม้ที่ 1 → 7', cap: 'ขนาดไม้ (หน่วย 0.01 lot) เมื่อแพ้ติดกัน' })}
<ul><li><b>เฉลี่ยต้นทุน (ราคาสวน)</b>: เพิ่มขนาดตอนผิดทาง ได้จุดคุ้มทุนใกล้ขึ้น แต่ความเสี่ยงรวมโตขึ้น — ต้องคำนวณ lot <b>ทุกไม้รวมกัน</b>ให้อยู่ในงบความเสี่ยง และมี SL เดียวของทั้งชุด</li>
<li><b>Pyramid (ราคาไปทางเรา)</b>: เติมเมื่อถูกทาง แล้วเลื่อน SL ตาม — ความเสี่ยงไม่โตเกินแผน</li>
<li><b>Martingale</b> (แพ้แล้ว ×2): แพ้ 6 ไม้ติด lot ไม้ที่ 7 ใหญ่ขึ้น 64 เท่า — โอกาสล้างพอร์ตสูงมาก</li>
<li><b>Grid ไม่มี SL</b>: ดูกำไรสม่ำเสมอจนเจอเทรนด์ยาวครั้งเดียวแล้วล้างพอร์ต</li></ul>
<p class="lg-tip">ราคาเฉลี่ย = Σ(ราคา × lot) ÷ lot รวม — ใช้แท็บ "คำนวณ" → เติมไม้ เพื่อเห็นขาดทุนรวมถ้าโดน SL ก่อนเข้า</p>${practiceBtn('avg')}${NA}` },

    { t: 'ทบต้น (Compounding) vs lot คงที่', b: `
${curve([{ pts: comp.a, col: UPC, label: `ทบต้น 3%/เดือน → ${usd(comp.a[24], 0)}` }, { pts: comp.b, col: AC, label: `คงที่ +$30/เดือน → ${usd(comp.b[24], 0)}` }], { xl: '24 เดือน', cap: 'ทุน $1,000 เป้ากำไร 3% ต่อเดือน' })}
<ul><li><b>ทบต้น (% คงที่)</b>: lot โตตามทุน — กำไรเร่งขึ้นเมื่อพอร์ตโต และ lot เล็กลงเองตอนขาดทุน (ปลอดภัยกว่า)</li>
<li><b>lot คงที่</b>: เข้าใจง่าย แต่ตอนพอร์ตลด ความเสี่ยงต่อไม้เป็น % จะสูงขึ้น</li>
<li>คำนวณ lot ใหม่จากยอด Balance ล่าสุด สัปดาห์ละครั้งก็พอ</li></ul>${NA}` },

    { t: 'Margin, Leverage, Margin level และ Stop out', b: `
${bars([100, 500, 2000].map((lv) => ({ label: `1:${lv}`, v: MM.margin('XAUUSD', 0.1, 3500, lv), t: `Margin ${usd(MM.margin('XAUUSD', 0.1, 3500, lv))}`, col: AC })), { cap: 'ทอง 0.10 lot ที่ราคา 3,500 ใช้ Margin เท่าไร' })}
<p class="mm-formula">Margin = lot × ขนาดสัญญา × ราคา ÷ Leverage</p>
<ul><li>ทอง 0.10 lot = 10 ออนซ์ × 3,500 = มูลค่า $35,000 → ที่ 1:500 ใช้ Margin <b>${usd(MM.margin('XAUUSD', 0.1, 3500, 500))}</b> · 1:100 ใช้ ${usd(MM.margin('XAUUSD', 0.1, 3500, 100))}</li>
<li><b>Margin level</b> = Equity ÷ Margin ที่ใช้ × 100% — ต่ำถึงระดับ Stop out (มักราว 20–50%) โบรกจะปิดไม้ให้อัตโนมัติ</li>
<li><b>Leverage สูง (1:500, 1:2000) ไม่ได้ทำให้เสี่ยงขึ้นเอง</b> — ความเสี่ยงจริงมาจาก lot และ SL · แต่ Leverage สูงทำให้ "เปิด lot ใหญ่เกินตัว" ได้ง่าย</li>
<li>วางแผนด้วย % ความเสี่ยง แล้วเช็ก Margin เป็นเงื่อนไขรอง: ไม่ควรใช้ Margin เกิน ~10–20% ของทุน</li></ul>${practiceBtn('margin')}${NA}` },

    { t: 'บัญชีเซ็นต์ (Cent / USC) สำหรับทุนน้อย', b: `
<div class="mm-cent-fig"><div><b>บัญชีมาตรฐาน</b><span>ฝาก $100</span><span>Balance <b>100.00 USD</b></span><span>lot ต่ำสุด 0.01 = 1 ออนซ์</span></div>
<div><b>บัญชีเซ็นต์</b><span>ฝาก $100</span><span>Balance <b>10,000 USC</b></span><span>0.01 cent lot = 0.01 ออนซ์</span></div></div>
<ul><li><b>USC</b> = เซ็นต์ดอลลาร์ · $1 = 100 USC → ฝาก $100 เห็นยอด <b>10,000</b> ในแอป</li>
<li><b>1.00 cent lot = 0.01 lot มาตรฐาน</b> (เล็กกว่า 100 เท่า) — ชื่อ symbol มักมีคำต่อท้าย เช่น <b>XAUUSDc</b>, EURUSD.c, XAUUSDcent</li>
<li>ทำไมเหมาะกับทุนน้อย: ทุน $100 เสี่ยง 1% = $1 · บัญชีมาตรฐาน lot เล็กสุด 0.01 ทอง SL 1000 จุด = เสีย $10 (10% ของพอร์ต!) · บัญชีเซ็นต์เปิดได้ <b>${lot(P100.gold[2].lotCent)} cent lot</b> = เสีย $1 พอดี</li>
<li>ในบัญชีเซ็นต์ ใช้สูตรเดิมได้เลยถ้าคิดทุกอย่างเป็น USC: ทอง 1.00 cent lot = 1 USC ต่อจุด</li>
<li>ข้อควรรู้: สเปรด/เงื่อนไขต่างจากบัญชีปกติ, ถอนเงินเป็น USD ตามอัตรา 100:1, บางโบรกจำกัดยอดสูงสุดของบัญชีเซ็นต์</li></ul>
<p class="lg-tip">แท็บ "คำนวณ" ในแอปเลือกประเภทบัญชี "เซ็นต์ (USC)" ได้ — ใส่ทุนเป็น USC แล้วได้ lot เป็น cent lot พร้อมค่าเทียบบัญชีมาตรฐาน</p>${practiceBtn('cent')}${NA}` },

    { t: 'แผน MM ตามขนาดพอร์ต: $100 ถึง $10,000', b: `
<p>เลือกขนาดพอร์ต % ความเสี่ยง และ Leverage — ตัวเลขทุกช่องคำนวณจากสูตรในบทก่อนหน้า (ทอง 3,500 · EURUSD 1.08 · ปัด lot ลง)</p>
<div class="mm-widget" data-w="plan"></div>${NA}` },

    { t: 'เช็กลิสต์จิตวิทยาก่อนกดเข้า', b: `
<ol class="mm-check"><li>รู้ว่าถ้าโดน SL จะเสียกี่ดอลลาร์ และรับได้ (≤ 1–2%)</li>
<li>วาง SL ตามโครงสร้างราคา ไม่ใช่ตามเงินที่อยากเสีย — แล้วค่อยปรับ lot</li>
<li>ไม่ได้เข้าเพื่อ "เอาคืน" จากไม้ที่แล้ว</li>
<li>ยังไม่ชนลิมิตขาดทุนวันนี้ / สัปดาห์นี้</li>
<li>ความเสี่ยงรวมไม้ที่เปิดอยู่ ≤ 5% และไม่ใช่คู่ที่วิ่งไปทางเดียวกันซ้อน</li>
<li>ไม่มีข่าวแรง (NFP, CPI, FOMC) ในอีกไม่กี่นาที — ดูแท็บข่าว</li>
<li>บันทึกเหตุผลการเข้าไว้ในแท็บฝึก/บันทึก เพื่อทบทวน</li></ol>
<p class="lg-tip">ถ้าตอบ "ไม่แน่ใจ" ข้อไหน = ยังไม่ต้องเข้า ตลาดเปิดทุกวัน</p>${practiceBtn()}${NA}` },
  ];

  if (LESSON_CATS && LESSONS_EXTRA) {
    const cat = { id: 'mm', name: 'Money Management (MM) / บัญชีเซ็นต์', icon: 'coins' };
    const i = LESSON_CATS.findIndex((c) => c.id === 'risk');
    if (!LESSON_CATS.some((c) => c.id === 'mm')) LESSON_CATS.splice(i >= 0 ? i + 1 : LESSON_CATS.length, 0, cat);
    LESSONS_EXTRA.push(...LESSONS.map((l) => ({ c: 'mm', ...l })));
  }

  // ------------------------------------------------------------ widget: MM plan by account size
  const pref = { size: 1000, risk: 1, lev: 500, type: 'auto', ...store.get('mmPlan', {}) };
  const TYPE_NAME = { cent: 'บัญชีเซ็นต์ (USC)', either: 'เซ็นต์ หรือ มาตรฐาน', standard: 'บัญชีมาตรฐาน' };
  function reasons(p) {
    const g = p.gold[2], out = [];
    if (p.type === 'cent') out.push(`ทุน ${usd(p.balance)} เสี่ยง ${p.riskPct}% = ${usd(p.risk)} แต่ lot ต่ำสุดบัญชีมาตรฐาน (0.01) ทอง SL 1000 จุด เสีย ${usd(g.riskAtMinLot)} = ${g.riskAtMinLotPct}% ของพอร์ต → ใช้บัญชีเซ็นต์ คุมความเสี่ยงได้ตามแผน`);
    else if (p.type === 'either') out.push(`บัญชีมาตรฐานเปิด 0.01 lot ได้เมื่อ SL ไม่เกิน ~${n(p.risk / 0.01, 0)} จุด · ถ้าชอบ SL กว้างกว่านั้นใช้บัญชีเซ็นต์`);
    else out.push(`ทุนพอให้ใช้บัญชีมาตรฐานได้ทุกระยะ SL ในตาราง (lot ต่ำสุด 0.01)`);
    out.push(`เปิดพร้อมกันไม่เกิน ${p.maxOpen} ไม้ (รวม ${p.maxOpenRiskPct}%) · หยุดวันนั้นเมื่อเสีย ${usd(p.dailyStop)} (${p.dailyStopPct}%)`);
    out.push(`แพ้ติด 10 ไม้ที่ ${p.riskPct}% พอร์ตลด ~${p.lossStreak10Pct}% (${usd(p.lossStreak10)}) — ยังกู้คืนได้`);
    out.push(`เป้าที่สมจริง 2–5%/เดือน = ${usd(p.monthly.low)}–${usd(p.monthly.high)}${p.balance <= 500 ? ' — ทุนน้อยให้เน้นฝึกวินัยและสถิติ ไม่ใช่เร่งโตพอร์ต' : ''}`);
    return out;
  }
  function planWidget(root) {
    const draw = () => {
      const p = MM.plan(pref.size, { riskPct: pref.risk, leverage: pref.lev, type: pref.type === 'auto' ? undefined : pref.type });
      const cent = p.type !== 'standard';
      const lotCell = (g) => (cent ? `<b>${lot(g.lotCent)}</b><small>cent lot · = ${n(g.centStd, 4)} lot</small>` + (g.tooSmall ? '' : `<small>มาตรฐาน ${lot(g.lotStd)}</small>`)
        : g.tooSmall ? `<b class="down">ต่ำกว่า 0.01</b><small>0.01 lot เสี่ยง ${g.riskAtMinLotPct}%</small>` : `<b>${lot(g.lotStd)}</b><small>lot</small>`);
      const seg = (k, vals, f) => `<div class="seg mm-seg">${vals.map((v) => `<button data-p="${k}" data-v="${v}" class="${String(pref[k]) === String(v) ? 'on' : ''}">${f ? f(v) : v}</button>`).join('')}</div>`;
      root.innerHTML = `<div class="mm-plan">
        <div class="mm-ctl"><label>ขนาดพอร์ต (USD)</label>${seg('size', MM.SIZES, (v) => n(v, 0))}</div>
        <div class="mm-ctl2"><div class="mm-ctl"><label>ความเสี่ยง/ไม้</label>${seg('risk', [0.5, 1, 2], (v) => v + '%')}</div>
          <div class="mm-ctl"><label>Leverage</label>${seg('lev', [100, 500, 2000], (v) => '1:' + v)}</div>
          <div class="mm-ctl"><label>ประเภทบัญชี</label>${seg('type', ['auto', 'cent', 'standard'], (v) => ({ auto: 'แนะนำ', cent: 'เซ็นต์', standard: 'มาตรฐาน' })[v])}</div></div>
        <div class="mm-sum">
          <div><span>ประเภทบัญชี</span><b>${TYPE_NAME[p.type]}</b></div>
          <div><span>ทุน</span><b>${usd(p.balance)}</b>${cent ? `<small>= ${n(MM.usdToUsc(p.balance), 0)} USC</small>` : ''}</div>
          <div><span>เสี่ยงต่อไม้</span><b>${usd(p.risk)}</b><small>${p.riskPct}%${cent ? ` · ${n(MM.usdToUsc(p.risk), 0)} USC` : ''}</small></div>
          <div><span>หยุดรายวัน</span><b class="down">${usd(p.dailyStop)}</b><small>${p.dailyStopPct}% · 3R</small></div>
        </div>
        <table class="mm-t"><thead><tr><th>ทองคำ (XAUUSD${cent ? 'c' : ''})</th><th>lot</th><th>เสียถ้าโดน SL</th><th>Margin 1:${p.leverage}</th></tr></thead><tbody>
          ${p.gold.map((g) => `<tr><td>SL ${n(g.sl, 0)} จุด<small>ราคาห่าง ${(g.sl / 100).toFixed(2)}</small></td><td>${lotCell(g)}</td><td>${usd(g.lossUSD)}</td><td>${usd(g.marginUSD)}</td></tr>`).join('')}
        </tbody></table>
        <table class="mm-t"><thead><tr><th>EURUSD${cent ? 'c' : ''}</th><th>lot</th><th>เสียถ้าโดน SL</th><th>Margin 1:${p.leverage}</th></tr></thead><tbody>
          ${p.eur.map((g) => `<tr><td>SL ${g.sl} pips<small>${g.points} จุด</small></td><td>${lotCell(g)}</td><td>${usd(g.lossUSD)}</td><td>${usd(g.marginUSD)}</td></tr>`).join('')}
        </tbody></table>
        <ul class="mm-why">${reasons(p).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
        <p class="lg-warn">ตัวอย่างเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน — ไม่รวมสเปรด/คอมมิชชัน/swap · สเปกสัญญาแต่ละโบรกอาจต่างกัน</p></div>`;
      root.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { const k = b.dataset.p; pref[k] = k === 'type' ? b.dataset.v : +b.dataset.v; store.set('mmPlan', pref); draw(); }));
    };
    draw();
  }

  // ------------------------------------------------------------ widget: random calculation practice
  const Q = { level: 1, kind: '', right: 0, total: 0, streak: 0, best: 0, ...store.get('mmQuiz', {}) };
  const saveQ = () => store.set('mmQuiz', { level: Q.level, kind: Q.kind, right: Q.right, total: Q.total, streak: Q.streak, best: Q.best });
  const quizRoots = new Set();
  function quizWidget(root) {
    quizRoots.add(root);
    let cur = MM.problem(Q.kind, Q.level), state = null, tries = 0;
    const draw = () => {
      root.innerHTML = `<div class="mm-quiz">
        <div class="mm-qh"><b>${ic('calculator', 16)}โจทย์ฝึกคำนวณ MM</b><span class="mm-score" title="ถูก / ทั้งหมด · ถูกติดกัน (สูงสุด)">${Q.right}/${Q.total} · ติดกัน ${Q.streak} (สูงสุด ${Q.best})</span></div>
        <div class="mm-ctl2"><div class="seg mm-seg">${[1, 2, 3].map((l) => `<button data-lv="${l}" class="${Q.level === l ? 'on' : ''}">${['ง่าย', 'กลาง', 'ยาก'][l - 1]}</button>`).join('')}</div>
          <select data-kind><option value="">ทุกหัวข้อ (สุ่ม)</option>${MM.KINDS.map((k) => `<option value="${k}" ${Q.kind === k ? 'selected' : ''}>${MM.KIND_NAME[k]}</option>`).join('')}</select></div>
        <div class="mm-q"><span class="mm-tag">${esc(cur.kindName)}</span>${esc(cur.q)}</div>
        <form class="mm-ans"><input inputmode="decimal" autocomplete="off" placeholder="คำตอบ${cur.unit ? ' (' + cur.unit + ')' : ''}" ${state === 'ok' ? 'disabled' : ''}>
          <button class="primary" ${state === 'ok' ? 'disabled' : ''}>ตรวจคำตอบ</button></form>
        <div class="mm-fb">${state === 'ok' ? `<div class="mm-ok">${ic('circle-check')}ถูกต้อง! ${esc(withUnit(cur.answer, cur.unit))}</div>`
          : state === 'bad' ? `<div class="mm-bad">${ic('circle-x')}ยังไม่ถูก ลองอีกครั้ง หรือดูวิธีทำ</div>` : state === 'show' ? `<div class="mm-bad">${ic('info')}คำตอบ: <b>${esc(withUnit(cur.answer, cur.unit))}</b></div>` : ''}
          ${state === 'ok' || state === 'show' ? `<ol class="mm-steps">${cur.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}</div>
        <div class="btns"><button data-a="show" ${state === 'ok' || state === 'show' ? 'disabled' : ''}>ดูวิธีทำ</button><button data-a="next">ข้อถัดไป ›</button></div></div>`;
      const inp = $$(root, '.mm-ans input');
      $$(root, '.mm-ans').onsubmit = (e) => {
        e.preventDefault(); if (state === 'ok') return;
        const r = MM.check(cur, inp.value); if (r.empty) return;
        tries++;
        if (r.ok) { if (state !== 'show') { Q.right += tries === 1 ? 1 : 0; Q.total += tries === 1 ? 1 : 0; Q.streak = tries === 1 ? Q.streak + 1 : 0; Q.best = Math.max(Q.best, Q.streak); } state = 'ok'; }
        else { if (tries === 1) { Q.total++; Q.streak = 0; } state = 'bad'; }
        saveQ(); draw(); const i2 = $$(root, '.mm-ans input'); if (state === 'bad') { i2.value = r.value; i2.focus(); i2.select(); }
      };
      root.querySelectorAll('[data-lv]').forEach((b) => (b.onclick = () => { Q.level = +b.dataset.lv; saveQ(); next(); }));
      $$(root, '[data-kind]').onchange = (e) => { Q.kind = e.target.value; saveQ(); next(); };
      $$(root, '[data-a=show]').onclick = () => { if (!tries) { Q.total++; Q.streak = 0; saveQ(); } tries = Math.max(tries, 1); state = 'show'; draw(); };
      $$(root, '[data-a=next]').onclick = next;
    };
    const next = () => { cur = MM.problem(Q.kind, Q.level); state = null; tries = 0; draw(); const i = $$(root, '.mm-ans input'); if (i && root.offsetParent) i.focus({ preventScroll: true }); };
    root._mm = { get: () => cur, next, draw };
    draw();
  }

  // ------------------------------------------------------------ mount: widgets inside a lesson / practice view
  function mount(scope = document) {
    scope.querySelectorAll('.mm-widget[data-w]:not([data-on])').forEach((w) => { w.dataset.on = 1; (w.dataset.w === 'plan' ? planWidget : quizWidget)(w); });
  }
  document.addEventListener('toggle', (e) => { if (e.target.tagName === 'DETAILS' && e.target.open) mount(e.target); }, true);
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mm-practice]'); if (!b) return;
    e.preventDefault();
    if (b.dataset.mmPractice !== Q.kind) { Q.kind = b.dataset.mmPractice; saveQ(); }
    // practice lives in the learning center (src/pages/learn)
    if (pages.learn) pages.learn.open('p:mmquiz');
    if (typeof toast === 'function') toast('ฝึกโจทย์: ' + (MM.KIND_NAME[Q.kind] || 'ทุกหัวข้อ'), 'info', 2500);
  });
  MM_LEARN = { mount, planWidget, quizWidget };
})();
export { MM_LEARN };
