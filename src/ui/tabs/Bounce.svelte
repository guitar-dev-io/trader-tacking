<script lang="ts">
  // จุดเด้ง (bounce finder) panel of the วิเคราะห์ tab: buy/sell zone cards, the per-type stats table and the
  // liquidity map. Data: S.B (BOUNCE.find in app-bounce.js); `bounceTick` re-renders.
  import Icon from '../Icon.svelte';
  import { bounceTick } from './bounce-view';
  import { S, fmt, store, tf } from '../../app/app-core';
  import { AN, BOUNCE } from '../../legacy/core';
  import { view } from '../../state';
  import { toast } from '../toast';
  import { ui } from '../registry';

  let { pct }: { pct: (v: number | null) => string } = $props();
  const PAT = AN.PAT as Record<string, { name: string }>;
  const TYPE = BOUNCE.TYPE as Record<string, { short: string; name: string; sname: string }>;
  const BSTAT: Record<string, [string, string]> = { wait: ['รอราคา', ''], in: ['ราคาอยู่ในโซน · รอแท่งยืนยัน', 'warn'], confirmed: ['ยืนยันแล้ว · เข้าได้', 'ok'] };
  const TYPES = ['ob', 'fvg', 'sr', 'fib', 'sweep'];

  const v = $derived.by(() => {
    $bounceTick;
    const mode = ['buy', 'sell'].includes(S.an.bounceSide) ? S.an.bounceSide : 'both', both = mode === 'both';
    const B = S.B, sides = mode === 'both' ? ['buy', 'sell'] : [mode];
    const order = both ? ['sell', 'buy'] : sides;       // both: sell zones (above price) on top — same as on the chart
    const stRows = B ? order.flatMap((sd: string) => TYPES.map((t) => [sd, t, B.stats[sd][t]] as const).filter((r) => r[2] && r[2].n >= 3)) : [];
    return { B, mode, both, order, stRows, sym: S.symbol, tfl: tf().label, show: !!S.an.bounce, liq: !!S.an.liquidity, tr: S.A ? S.A.lastTrend : 0, n: S.A ? S.A.n : 0 };
  });
  const saveAn = () => { store.set('an', S.an); view.dirty = true; };
  const side = (m: string) => { S.an.bounceSide = m; saveAn(); bounceTick.update((n) => n + 1); };
  function act(kind: string, sd: string, k: number) {
    const z = S.B && S.B[sd] && S.B[sd][k]; if (!z) return;
    const toCalc = () => { ui.planner?.save(); ui.planner?.render(); view.dirty = true; (document.querySelector('#tabs [data-tab="calc"]') as HTMLElement).click(); };
    if (kind === 'layer' || kind === 'pyr') {
      const lay = kind === 'layer', h = Math.abs(z.hi - z.lo), risk = Math.abs(z.entry - z.sl);
      Object.assign(S.plan, { side: sd, entry: fmt(z.entry), sl: fmt(z.sl), tp1: fmt(z.tp1), tp2: fmt(z.tp2), adds: '2', mode: lay ? 'avg' : 'pyramid',
        spacing: fmt(lay ? Math.max(h / 2, risk * 0.25) : risk), weight: 'equal', trail: lay ? (S.plan.trail || 'none') : 'prev' });
      toCalc();
      toast(lay ? 'แบ่ง 3 ไม้ในโซน: ความเสี่ยงรวมทุกไม้ = ที่ตั้งไว้ (ไม่ใช่ไม้ละเท่านั้น)' : 'Pyramid: เข้าต่อทุก 1R ที่ราคาไปทางเรา และเลื่อน SL ไปที่ไม้ก่อนหน้า', 'ok');
    } else if (kind === 'calc') { Object.assign(S.plan, { side: sd, entry: fmt(z.entry), sl: fmt(z.sl), tp1: fmt(z.tp1), tp2: fmt(z.tp2) }); toCalc(); }
    else ui.sim?.prefill({ side: sd === 'buy' ? 1 : -1, type: 'limit', price: fmt(z.entry), sl: fmt(z.sl), tp: fmt(z.tp1), tag: 'range' });
  }
  const cellCls = (x: number) => (x >= 0.55 ? 'up' : x < 0.4 ? 'down' : '');
</script>

{#snippet card(sd: string, z: any, k: number)}
  {@const buy = sd === 'buy'}
  <div class="bn-card {sd} {k === 0 ? 'top' : ''}">
    <div class="bn-top"><span class={buy ? 'up' : 'down'}><b>{buy ? '▲ BUY' : '▼ SELL'}</b></span><span class="bn-stars">{'★'.repeat(z.stars)}<span class="muted">{'★'.repeat(5 - z.stars)}</span></span><b>{fmt(Math.min(z.lo, z.hi))} – {fmt(Math.max(z.lo, z.hi))}</b>
      <span class="muted" data-bd="{sd}{k}">{z.status === 'wait' ? `ห่าง ${fmt(Math.abs(z.dist))} (${Math.abs(z.distAtr).toFixed(1)} ATR)` : ''}</span></div>
    <div class="bn-status {BSTAT[z.status][1]}">{#if z.status === 'wait'}<Icon name="hourglass" size={14} />{buy ? 'รอราคาย่อลงมาที่โซน' : 'รอราคาเด้งขึ้นมาที่โซน'}{:else}<Icon name={z.status === 'in' ? 'eye' : 'circle-check'} size={14} />{BSTAT[z.status][0]}{/if}{#if z.pattern && z.status !== 'wait'} · {PAT[z.pattern].name}{/if}</div>
    <div class="lv">
      <span>Entry</span><b>{fmt(z.entry)}</b><span>{buy ? 'Buy' : 'Sell'} Limit ขอบโซน</span>
      <span class="down">SL</span><b>{fmt(z.sl)}</b><span>{buy ? 'ใต้' : 'เหนือ'}โซน · 1R = {fmt(Math.abs(z.entry - z.sl))}</span>
      <span class="up">TP1</span><b>{fmt(z.tp1)}</b><span>{z.rr1.toFixed(1)}R {#if z.rr1 < 1}<Icon name="triangle-alert" size={13} />ต่ำกว่า 1R{:else}Swing ถัดไป{/if}</span>
      {#if z.tp2 !== z.tp1}<span class="up">TP2</span><b>{fmt(z.tp2)}</b><span>{z.rr2.toFixed(1)}R</span>{/if}
    </div>
    <ul class="bn-why">{#each z.why as w}<li class={w.neg ? 'neg' : ''}>{w.txt}</li>{/each}</ul>
    <div class="muted bn-stat">{#if z.stat}แตะโซนแบบนี้ ({TYPE[z.main].short}) ย้อนหลังในกราฟนี้ {z.stat.n} ครั้ง → เด้งถึง 1R <b>{pct(z.stat.wr1)}</b> · ถึง 2R <b>{pct(z.stat.wr2)}</b>{:else}ยังไม่มีสถิติย้อนหลังของโซนแบบนี้ในข้อมูลที่โหลด{/if}</div>
    <div class="btns"><button data-bz="calc" data-sd={sd} data-k={k} onclick={() => act('calc', sd, k)}>คำนวณ lot</button><button data-bz="sim" data-sd={sd} data-k={k} onclick={() => act('sim', sd, k)}>ตั้งคำสั่งฝึก</button></div>
    <div class="btns"><button data-bz="layer" data-sd={sd} data-k={k} title="ไม้ 1 ขอบโซน · ไม้ 2 กลางโซน · ไม้ 3 ปลายโซน · SL เดียวกัน" onclick={() => act('layer', sd, k)}>แบ่ง 3 ไม้ในโซน</button><button data-bz="pyr" data-sd={sd} data-k={k} title="ไม้แรกที่โซน แล้วเข้าต่อเมื่อราคาไปทางเรา" onclick={() => act('pyr', sd, k)}>เข้าแล้วเข้าต่อ (Pyramid)</button></div>
  </div>
{/snippet}

<div class="panel-h bn-h"><span><Icon name="target" />หาจุดเด้ง · {v.sym} {v.tfl}</span>
  <label class="chk" title="แสดงโซนบนกราฟ"><input type="checkbox" id="bn-show" checked={v.show} onchange={(e) => { S.an.bounce = (e.currentTarget as HTMLInputElement).checked; saveAn(); }}> บนกราฟ</label></div>
<div class="seg bn-seg"><button data-bs="both" class={v.both ? 'on' : ''} onclick={() => side('both')}>▲▼ ทั้งสองฝั่ง</button><button data-bs="buy" class={v.mode === 'buy' ? 'on buy' : ''} onclick={() => side('buy')}>▲ Buy</button><button data-bs="sell" class={v.mode === 'sell' ? 'on sell' : ''} onclick={() => side('sell')}>▼ Sell</button></div>
{#if !v.B}<p class="muted">ต้องมีข้อมูลกราฟอย่างน้อย 60 แท่ง</p>
{:else}
  {#if v.both}
    {@const bb = v.B.buy[0]}{@const ss = v.B.sell[0]}{@const bs = bb ? bb.stars : 0}{@const sss = ss ? ss.stars : 0}
    <div class="bn-sum">เทรนด์ {#if v.tr === 1}<b class="up">ขาขึ้น</b>{:else if v.tr === -1}<b class="down">ขาลง</b>{:else}<b>ไซด์เวย์</b>{/if} · Buy ดีสุด {bb ? '★' + bs + ' ที่ ' + fmt(bb.entry) : '—'} · Sell ดีสุด {ss ? '★' + sss + ' ที่ ' + fmt(ss.entry) : '—'}<br>→ {#if bs > sss}<b class="up">ฝั่ง Buy น่าสนใจกว่า</b>{:else if sss > bs}<b class="down">ฝั่ง Sell น่าสนใจกว่า</b>{:else}สองฝั่งคะแนนพอๆ กัน — รอดูว่าราคาไปแตะฝั่งไหนก่อนแล้วรอยืนยัน{/if}</div>
  {/if}
  {#each v.order as sd}
    {@const zs = v.both ? v.B[sd].slice(0, 2) : v.B[sd]}
    {#if v.both}<div class="bn-sec {sd === 'buy' ? 'up' : 'down'}">{sd === 'buy' ? '▲ จุดเข้าซื้อ (ใต้ราคา)' : '▼ จุดเข้าขาย (เหนือราคา)'}</div>{/if}
    {#each zs as z, k}{@render card(sd, z, k)}{:else}<p class="muted">ยังไม่พบโซน{sd === 'buy' ? 'รับ' : 'ต้าน'}ที่ยังใช้ได้ในระยะ 10 ATR</p>{/each}
  {/each}
  {#if v.stRows.length}
    <div class="panel-h bn-h" style="margin-top:12px"><span><Icon name="chart-column" />โซนแบบไหนเด้งดีในกราฟนี้</span></div>
    <table class="stat bn-st"><thead><tr><th>ฝั่ง</th><th>แบบ</th><th>ครั้ง</th><th>ถึง 1R</th><th>ถึง 2R</th></tr></thead><tbody>
      {#each v.stRows as [sd, t, x]}<tr><td class={sd === 'buy' ? 'up' : 'down'}>{sd === 'buy' ? '▲' : '▼'}</td><td>{TYPE[t][sd === 'buy' ? 'name' : 'sname']}</td><td>{x.n}</td><td class={cellCls(x.wr1)}>{pct(x.wr1)}</td><td class={cellCls(x.wr2)}>{pct(x.wr2)}</td></tr>{/each}
    </tbody></table>
    <p class="muted bn-note">วัดแบบเดินหน้า (ใช้ข้อมูล ณ ตอนนั้นเท่านั้น): ตั้ง Limit ที่ขอบโซนตอนราคาแตะครั้งแรก SL ใต้โซน · ใช้เทียบว่าแบบไหนเข้ากับ symbol/TF นี้ ไม่ได้รับประกันอนาคต</p>
  {/if}
  {#if v.B.liq}
    {@const L = v.B.liq}
    <div class="panel-h bn-h" style="margin-top:12px"><span><Icon name="coins" />จุดที่มีเงิน (SL เม่ากองอยู่)</span>
      <label class="chk"><input type="checkbox" id="lq-show" checked={v.liq} onchange={(e) => { S.an.liquidity = (e.currentTarget as HTMLInputElement).checked; saveAn(); }}> บนกราฟ</label></div>
    <table class="stat lq"><tbody>
      {#each L.highs.slice(0, 3).reverse() as p}<tr><td><span class="down">▲</span> <b>{fmt(p.price)}</b></td><td>{BOUNCE.poolName(p, false)}</td><td>{'$'.repeat(Math.min(3, p.strength))}</td></tr>{/each}
      <tr class="lq-now"><td colspan="3">— ราคาปัจจุบัน —</td></tr>
      {#each L.lows.slice(0, 3) as p}<tr><td><span class="up">▼</span> <b>{fmt(p.price)}</b></td><td>{BOUNCE.poolName(p, false)}</td><td>{'$'.repeat(Math.min(3, p.strength))}</td></tr>{/each}
    </tbody></table>
    {#if L.sweeps.length}<ul class="bn-why">{#each L.sweeps.slice(0, 3) as x}<li><Icon name="brush-cleaning" size={14} />กวาด SL {x.side === 'low' ? 'ใต้' : 'เหนือ'} {fmt(x.price)} แล้วปิดกลับ · {v.n ? v.n - 1 - x.j : '?'} แท่งก่อน → {#if x.side === 'low'}<span class="up">มักเด้งขึ้น</span>{:else}<span class="down">มักร่วงลง</span>{/if}</li>{/each}</ul>{/if}
    <p class="muted bn-note">▲ เหนือ Swing High / Equal Highs = SL ของคนที่ Sell กองอยู่ · ▼ ใต้ Swing Low / Equal Lows = SL ของคนที่ Buy · ยิ่ง $ มาก (ยอดเท่ากันหลายจุด, PDH/PDL) ยิ่งมีเงินเยอะ ราคามักวิ่งไปกวาดก่อนกลับตัว — อย่าวาง SL ตรงนั้นพอดี และใช้เป็นเป้า TP ได้</p>
  {/if}
  <p class="muted bn-note">วิธีใช้: ตั้ง Limit ที่ Entry หรือรอให้สถานะเป็น <Icon name="circle-check" size={13} /> (แท่งเทียนกลับตัวในโซน) แล้วค่อยเข้า · ★ มาก = เหตุผลซ้อนกันมาก + ตามเทรนด์ · ไม่ใช่คำแนะนำการลงทุน</p>
{/if}
