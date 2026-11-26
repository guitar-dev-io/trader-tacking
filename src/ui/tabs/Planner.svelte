<script lang="ts">
  // "คำนวณ" tab: position size / scale-in calculator. The maths stays in planner.js (computePlan & friends);
  // this component renders S.plan and writes user input back into it. `tick` re-renders after outside changes
  // (symbol switch, quotes, Claude's `plan` command → renderPlanner()).
  import Icon from '../Icon.svelte';
  import { plannerTick } from './planner-view';
  import { S, fmt } from '../../../app-core.js';

  interface Api {
    computePlan: () => any; autoVpp: (s: string) => number | null; contractSize: (s: string) => number; isCentAcct: () => boolean; CUR: () => string;
    money: (v: number | null | undefined) => string; lotFmt: (x: number, step: number) => string; pointSize: () => number; toPts: (d: number) => number;
    savePlan: () => void; changed: () => void; activeSignal: () => any;
  }
  let { api }: { api: Api } = $props();

  const v = $derived.by(() => {
    $plannerTick;
    const p = S.plan, r = api.computePlan(), step = +p.lotStep || 0.01, q = S.quotes[S.symbol], av = api.autoVpp(S.symbol);
    const e = parseFloat(p.entry), sl = parseFloat(p.sl), tp1 = parseFloat(p.tp1);
    return { p, r, step, q, av, cent: api.isCentAcct(), cur: api.CUR(), sym: S.symbol, contract: api.contractSize(S.symbol), pt: api.pointSize(),
      slPts: isFinite(e) && isFinite(sl) ? api.toPts(e - sl) : '', tpPts: isFinite(e) && isFinite(tp1) ? api.toPts(tp1 - e) : '',
      spPts: parseFloat(p.spacing) > 0 ? api.toPts(parseFloat(p.spacing)) : '', last: r.rows.length ? r.rows[r.rows.length - 1] : null,
      hasTrail: r.rows.some((x: any) => x.trailSL != null), slDist: Math.abs(e - sl) };
  });
  const usdOf = (x: number | null | undefined) => (v.cent && x != null && isFinite(x) ? `≈ $${(Math.abs(x) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '');

  // ---- input → S.plan
  const set = (k: string, val: unknown) => { S.plan[k] = val; api.savePlan(); api.changed(); };
  const dirN = () => (S.plan.side === 'buy' ? 1 : -1);
  function entryNow() {
    const p = S.plan, e = parseFloat(p.entry); if (isFinite(e)) return e;
    const qq = S.quotes[S.symbol]; if (!qq) return null; p.entry = fmt(p.side === 'buy' ? qq.ask : qq.bid); return parseFloat(p.entry);
  }
  function setSlPts(n: number) { const e = entryNow(); if (e == null || !(n > 0)) return; S.plan.sl = fmt(e - dirN() * n * api.pointSize()); api.savePlan(); api.changed(); }
  function setTpPts(n: number) {
    const e = entryNow(); if (e == null || !(n > 0)) return; const p = S.plan;
    p.tp1 = fmt(e + dirN() * n * api.pointSize()); if (isFinite(parseFloat(p.sl))) p.tp2 = fmt(e + dirN() * 2 * n * api.pointSize()); api.savePlan(); api.changed();
  }
  function setSpPts(n: number) { S.plan.spacing = n > 0 ? fmt(n * api.pointSize()) : ''; api.savePlan(); api.changed(); }
  function now() { const qq = S.quotes[S.symbol]; if (!qq) return; S.plan.entry = fmt(S.plan.side === 'buy' ? qq.ask : qq.bid); api.savePlan(); api.changed(); }
  function fromSignal() {
    const s = api.activeSignal() || (S.A && S.A.signals[S.A.signals.length - 1]); if (!s) return;
    Object.assign(S.plan, { side: s.dir === 1 ? 'buy' : 'sell', entry: fmt(s.entry), sl: fmt(s.sl), tp1: fmt(s.tp1), tp2: fmt(s.tp2) }); api.savePlan(); api.changed();
  }
  function atrSl() {
    const a = S.A && S.A.atr[S.A.n - 1], e = parseFloat(S.plan.entry); if (!a || !isFinite(e)) return;
    S.plan.sl = fmt(e - dirN() * 1.5 * a); api.savePlan(); api.changed();
  }
  function rrTp() {
    const e = parseFloat(S.plan.entry), s = parseFloat(S.plan.sl); if (!isFinite(e) || !isFinite(s)) return;
    S.plan.tp1 = fmt(e + (e - s)); S.plan.tp2 = fmt(e + 2 * (e - s)); api.savePlan(); api.changed();
  }
  const val = (ev: Event) => (ev.currentTarget as HTMLInputElement).value;
</script>

{#snippet seg(k: string, opts: [string, string, string?][])}
  <div class="seg">{#each opts as [val, t, cls]}<button data-seg={k} data-v={val} class={v.p[k] === val ? 'on ' + (cls || '') : ''} onclick={() => set(k, val)}>{t}</button>{/each}</div>
{/snippet}
{#snippet inp(k: string, lbl: string, ph = '')}
  <label>{lbl}<input data-k={k} type="number" step="any" value={v.p[k]} placeholder={ph} onchange={(e) => set(k, val(e))}></label>
{/snippet}

<div class="panel-h">เครื่องคำนวณขนาดไม้ / จุดเติม · {v.sym}</div>
{@render seg('side', [['buy', '▲ Buy', 'buy'], ['sell', '▼ Sell', 'sell']])}
<div style="margin-top:8px">{@render seg('account', [['auto', 'บัญชี: อัตโนมัติ'], ['std', 'มาตรฐาน (USD)'], ['cent', 'เซ็นต์ (USC)']])}
  <div class="pl-acct-hint">{#if v.p.account === 'auto'}ตรวจจากชื่อ {v.sym}: <b>{v.cent ? 'บัญชีเซ็นต์' : 'บัญชีมาตรฐาน'}</b> · {/if}{v.cent ? 'ใส่ทุนเป็น USC (10,000 USC = $100) · lot เป็น cent lot (1.00 = 0.01 lot มาตรฐาน)' : 'ทุนเป็น USD · lot มาตรฐาน'}</div></div>
<div class="grid" style="margin-top:8px">
  {@render inp('balance', `ทุน (${v.cur})`)}
  <label>ความเสี่ยงต่อแผน<div class="seg"><input data-k="risk" type="number" step="any" value={v.p.risk} style="border-radius:6px 0 0 6px;min-width:0" onchange={(e) => set('risk', val(e))}>
    <button data-seg="riskMode" data-v="pct" class={v.p.riskMode === 'pct' ? 'on' : ''} onclick={() => set('riskMode', 'pct')}>%</button><button data-seg="riskMode" data-v="amt" class={v.p.riskMode === 'amt' ? 'on' : ''} onclick={() => set('riskMode', 'amt')}>$</button></div></label>
  {@render inp('entry', 'ราคาเข้า (ไม้แรก)', v.q ? fmt(v.p.side === 'buy' ? v.q.ask : v.q.bid) : '')}
  {@render inp('sl', 'Stop Loss')}
  {@render inp('tp1', 'TP1')}
  {@render inp('tp2', 'TP2')}
</div>
<div class="grid" style="margin-top:6px">
  <label>SL เป็นจุด (points)<input id="pl-slpts" type="number" step="1" min="0" value={v.slPts} placeholder="เช่น 1000" onchange={(e) => setSlPts(+val(e))}></label>
  <label>TP เป็นจุด (points)<input id="pl-tppts" type="number" step="1" min="0" value={v.tpPts} placeholder="เช่น 2000" onchange={(e) => setTpPts(+val(e))}></label>
</div>
<div class="btns pts">SL: {#each [300, 500, 1000, 1500, 2000] as n}<button data-slpts={n} onclick={() => setSlPts(n)}>{n}</button>{/each}<span class="muted">จุด · 1 จุด = {fmt(v.pt)} → 1000 จุด = {fmt(1000 * v.pt)}</span></div>
<div class="btns" style="margin-top:8px">
  <button id="pl-now" onclick={now}>ใช้ราคาตอนนี้</button><button id="pl-sig" onclick={fromSignal}>จากสัญญาณล่าสุด</button><button id="pl-atr" onclick={atrSl}>SL = 1.5 ATR</button><button id="pl-rr" onclick={rrTp}>TP = 1R / 2R</button>
</div>
<h4>เติมไม้</h4>
{@render seg('mode', [['avg', 'เฉลี่ยต้นทุน (ราคาสวน)'], ['pyramid', 'Pyramid (ราคาไปทางเรา)']])}
<div class="grid" style="margin-top:8px">
  {@render inp('adds', 'จำนวนไม้เติม', '0')}
  {@render inp('spacing', 'ระยะห่างแต่ละไม้ (ราคา)', v.r.spacing ? fmt(v.r.spacing) : 'อัตโนมัติ')}
  <label>ระยะห่างเป็นจุด<input id="pl-sppts" type="number" step="1" min="0" value={v.spPts} placeholder={v.r.spacing ? String(api.toPts(v.r.spacing)) : 'อัตโนมัติ'} onchange={(e) => setSpPts(+val(e))}></label>
  {#if v.p.mode === 'pyramid'}
    <label>เลื่อน SL เมื่อเข้าต่อ<select data-k="trail" value={v.p.trail || 'none'} onchange={(e) => set('trail', val(e))}><option value="none">ไม่เลื่อน (SL เดิม)</option><option value="prev">ไปที่ราคาไม้ก่อนหน้า</option><option value="be">ไปที่ทุนเฉลี่ย (BE)</option></select></label>
  {:else}<span></span>{/if}
  <label>แบ่ง lot<select data-k="weight" value={v.p.weight} onchange={(e) => set('weight', val(e))}><option value="equal">เท่ากันทุกไม้</option><option value="mult">ไม้หลังใหญ่ขึ้น ×</option><option value="down">ไม้หลังเล็กลง ×</option></select></label>
  {@render inp('mult', 'ตัวคูณ', '1.5')}
</div>
<h4>สเปกสัญญา</h4>
<div class="grid">
  {@render inp('vpp', `มูลค่า 1.0 ราคา ต่อ 1 lot (${v.cur})`, v.av ? String(v.av) : 'ใส่เอง')}
  {@render inp('lotStep', 'lot step')}
</div>
<p class="muted">อัตโนมัติ: {v.sym} 1 lot = {v.contract.toLocaleString()} หน่วย{#if v.av} → ราคาขยับ 1.0 = {v.cent ? v.av.toLocaleString() + ' USC ต่อ cent lot' : '$' + v.av.toLocaleString() + ' ต่อ lot'}{/if}{v.cent ? ' (บัญชีเซ็นต์: 1 cent lot = 1/100 ของ lot มาตรฐาน)' : ''} · ตรวจกับสเปกโบรกเกอร์อีกครั้ง</p>
{#each v.r.warn as w}<div class="warn"><Icon name="triangle-alert" size={14} />{w}</div>{/each}
{#if v.r.rows.length}
  <div class="sum">
    <span>ความเสี่ยงที่ตั้ง</span><b>{api.money(v.r.risk)}{#if usdOf(v.r.risk)} <small class="pl-cent">{usdOf(v.r.risk)}</small>{/if}</b>
    <span>lot รวม (ทุกไม้)</span><b>{api.lotFmt(v.r.totalLot, v.step)}{#if v.cent} cent lot <small class="pl-cent">= {(v.r.totalLot / 100).toFixed(4)} lot มาตรฐาน</small>{/if}</b>
    <span>ต้นทุนเฉลี่ย / จุดคุ้มทุน</span><b>{fmt(v.r.avg)}</b>
    <span class="down">ขาดทุนถ้าโดน SL (ครบทุกไม้)</span><b class="down">{api.money(v.r.maxLoss)}{#if usdOf(v.r.maxLoss)} <small class="pl-cent">{usdOf(v.r.maxLoss)}</small>{/if} ({((v.r.maxLoss / v.p.balance) * 100).toFixed(2)}%)</b>
    {#if v.last.tp1 != null}<span class="up">กำไรที่ TP1 (ครบทุกไม้)</span><b class="up">{api.money(v.last.tp1)}</b>{/if}
    {#if v.last.tp2 != null}<span class="up">กำไรที่ TP2 (ครบทุกไม้)</span><b class="up">{api.money(v.last.tp2)}</b>{/if}
    {#if v.r.firstOnly.tp2 != null}<span>ถ้าได้แค่ไม้แรก → TP2</span><b>{api.money(v.r.firstOnly.tp2)} · RR {(v.r.firstOnly.tp2 / -v.r.firstOnly.slLoss).toFixed(2)}</b>{/if}
  </div>
  <div class="muted" style="margin-top:4px">ระยะ SL ไม้แรก: <b>{api.toPts(parseFloat(v.p.entry) - parseFloat(v.p.sl)).toLocaleString()} จุด</b> ({fmt(v.slDist)}) · ทุก 0.01 lot เสีย {api.money(v.slDist * v.r.v * 0.01)}</div>
  <table><thead><tr><th>#</th><th>ราคา</th><th>ระยะ (จุด)</th><th>lot</th><th>รวม</th><th>เฉลี่ย</th><th>โดน SL</th>{#if v.hasTrail}<th>SL เลื่อน</th>{/if}<th>TP2</th></tr></thead><tbody>
    {#each v.r.rows as x}
      <tr><td>{x.i + 1}</td><td>{fmt(x.price)}</td><td>{x.i ? (x.dist >= 0 ? '+' : '-') + api.toPts(x.dist) : '—'}</td><td>{api.lotFmt(x.lot, v.step)}</td><td>{api.lotFmt(x.cumLot, v.step)}</td>
        <td>{fmt(x.avg)}</td><td class="down">{api.money(x.slLoss)}</td>{#if v.hasTrail}<td class={x.trailPnl >= 0 ? 'up' : 'down'} title="SL ใหม่ {x.trailSL != null ? fmt(x.trailSL) : ''}">{x.trailSL != null ? api.money(x.trailPnl) : '—'}</td>{/if}<td class="up">{api.money(x.tp2)}</td></tr>
    {/each}
  </tbody></table>
  <p class="muted">แต่ละแถว = ผลถ้าได้ไม้ถึงแถวนั้น (ไม้ 1..n) · ระยะ = ห่างจากไม้แรก (จุด) · โดน SL = กรณีแย่สุดด้วย SL เดิม{v.hasTrail ? ' · SL เลื่อน = ผลถ้าเลื่อน SL ตามแล้วโดนหลังเข้าต่อไม้นั้น' : ''}</p>
{/if}
<label class="chk"><input type="checkbox" id="pl-show" checked={v.p.show} onchange={(e) => { S.plan.show = (e.currentTarget as HTMLInputElement).checked; api.savePlan(); api.changed(); }}> แสดงแผนบนกราฟ</label>
<p class="disclaimer" style="margin-top:8px">ตัวเลขเป็นการประมาณ ไม่รวมสเปรด/ค่าคอมมิชชัน/swap · ไม่ใช่คำแนะนำการลงทุน</p>
