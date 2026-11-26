<script lang="ts">
  // One panel of the วิเคราะห์ tab, chosen by `part`: market structure, the active/last signal card, or the
  // back-test table. Data: S.A (from runAnalysis in app-analysis.js); `analysisTick` re-renders.
  import Icon from '../Icon.svelte';
  import { analysisTick } from './analysis-view';
  import { S, fmt, tf } from '../../../app-core.js';
  import { AN } from '../../legacy/core';

  interface Api { activeSignal: () => any; SETUP_TH: Record<string, string>; pct: (v: number | null) => string; rr: (v: number | null) => string }
  let { part, api }: { part: 'trend' | 'signal' | 'stats'; api: Api } = $props();
  const PAT = AN.PAT as Record<string, { name: string }>;
  const resTH = (r: string) => ({ win: 'ชนะ', loss: 'แพ้', open: 'ยังไม่จบ', expired: 'หมดเวลา' } as Record<string, string>)[r];

  const v = $derived.by(() => {
    $analysisTick;
    const A = S.A; if (!A) return null;
    return { A, tr: A.lastTrend, ev: A.lastEvent, sym: S.symbol, tfl: tf().label, s: api.activeSignal(), last: A.signals[A.signals.length - 1], learnOnly: S.an.learnOnly };
  });
</script>

{#snippet card(x: any, active: boolean)}
  {@const buy = x.dir === 1}
  {@const lr = x.learned}
  <div class="sig-card {buy ? 'buy' : 'sell'} {active && v!.learnOnly && lr !== 'good' ? 'dim' : ''}">
    <div class="sig-head"><span class={buy ? 'up' : 'down'}>{buy ? '▲ BUY' : '▼ SELL'}</span>
      <small>{api.SETUP_TH[x.setup]} · {PAT[x.pattern].name}</small></div>
    <div class="lv">
      <span>Entry</span><b>{fmt(x.entry)}</b><span>ราคาปิดแท่งสัญญาณ</span>
      <span class="down">SL</span><b>{fmt(x.sl)}</b><span>-{fmt(x.risk)} (1R)</span>
      <span class="up">TP1</span><b>{fmt(x.tp1)}</b><span>1R</span>
      <span class="up">TP2</span><b>{fmt(x.tp2)}</b><span>2R</span>
      {#if x.tpS != null}<span class="up">เป้าโครงสร้าง</span><b>{fmt(x.tpS)}</b><span>{(Math.abs(x.tpS - x.entry) / x.risk).toFixed(1)}R</span>{/if}
    </div>
    <div>โหมดเรียนรู้: <span class="badge {lr}">{#if lr === 'good'}<Icon name="circle-check" size={13} />สถิติผ่าน{:else if lr === 'bad'}<Icon name="circle-x" size={13} />สถิติไม่ผ่าน{:else}… ตัวอย่างยังน้อย{/if}</span>
      <span class="muted"> (ก่อนหน้า {x.prior.n} ครั้ง · TP2 {api.pct(x.prior.wr2)} · {api.rr(x.prior.exp)})</span></div>
    <ol class="reasons">{#each x.reasons as r}<li>{r}</li>{/each}</ol>
    {#if !active}<div class="muted" style="margin-top:6px">ผล: TP1 {resTH(x.r1)} · TP2 {resTH(x.r2)} · {v!.A.n - 1 - x.idx} แท่งที่แล้ว</div>{/if}
  </div>
{/snippet}
{#snippet row(name: string, st: any, bold = false)}
  <tr><td>{#if bold}<b>{name}</b>{:else}{name}{/if}</td><td>{st.n}</td><td>{api.pct(st.wr1)}</td><td>{api.pct(st.wr2)}</td><td class={st.exp > 0 ? 'up' : st.exp < 0 ? 'down' : ''}>{api.rr(st.exp)}</td></tr>
{/snippet}

{#if part === 'trend'}
  {#if !v}<p class="muted">ต้องมีข้อมูลกราฟอย่างน้อย 50 แท่ง</p>
  {:else}
    <div class="panel-h">โครงสร้างตลาด · {v.sym} {v.tfl}</div>
    <div>เทรนด์: <b class={v.tr === 1 ? 'up' : v.tr === -1 ? 'down' : ''}>{v.tr === 1 ? 'ขาขึ้น' : v.tr === -1 ? 'ขาลง' : 'ยังไม่ชัด'}</b></div>
    {#if v.ev}<div>ล่าสุด: <b>{v.ev.type}</b> {v.ev.dir === 1 ? 'ขึ้น' : 'ลง'} ทะลุ {fmt(v.ev.price)} ({v.A.n - 1 - v.ev.idx} แท่งก่อน)</div>{/if}
    <div>สวิงล่าสุด: {#each v.A.swings.slice(-4) as s, i}{#if i} → {/if}<span>{s.label}</span>{:else}—{/each}</div>
  {/if}
{:else if part === 'signal'}
  {#if v}
    {#if v.s}<div class="panel-h">สัญญาณที่ยังเปิดอยู่</div>{@render card(v.s, true)}
    {:else}<div class="panel-h">สัญญาณ</div><p class="muted">ตอนนี้ยังไม่มีสัญญาณใหม่ (รอแท่งเทียนกลับตัวที่โซน/ตามเทรนด์)</p>
      {#if v.last}<div class="panel-h" style="margin-top:8px">สัญญาณล่าสุด</div>{@render card(v.last, false)}{/if}
    {/if}
  {/if}
{:else if v}
  {@const st = v.A.stats}
  <div class="panel-h">ทดสอบย้อนหลัง ({v.A.n} แท่ง · {v.sym} {v.tfl})</div>
  <table class="stat"><thead><tr><th>กลุ่ม</th><th>ไม้</th><th>TP1</th><th>TP2</th><th>เฉลี่ย</th></tr></thead><tbody>
    {@render row('ทั้งหมด', st.all, true)}{@render row('เฉพาะที่ผ่านโหมดเรียนรู้', st.learned, true)}
    {#each Object.entries(st.bySetup) as [k, s]}{@render row(api.SETUP_TH[k], s)}{/each}
    {#each Object.entries(st.byPattern) as [k, s]}{@render row('· ' + PAT[k].name, s)}{/each}
  </tbody></table>
  <p class="muted">TP1/TP2 = อัตราชนะ (ถึง TP ก่อน SL) · เฉลี่ย = กำไรเฉลี่ยต่อไม้ถ้าถือถึง TP2 (หน่วย R) · โดน SL และ TP ในแท่งเดียวกันนับเป็นแพ้</p>
{/if}
