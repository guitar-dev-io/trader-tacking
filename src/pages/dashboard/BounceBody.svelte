<script lang="ts">
  // Strongest buy/sell zones of a symbol (analysis + bounce finder on its own candles, at most every 10 s).
  import { onMount } from 'svelte';
  import { AN, BOUNCE } from '../../legacy/core';
  import { acquire, release, type Feed } from './feeds';
  import { MAX, fx, guessDigits, quote, type WidgetCfg } from './model.svelte';

  let { w }: { w: WidgetCfg } = $props();
  type Zone = { lo: number; hi: number; label?: string; typeName?: string; type?: string; status?: string; stars?: number };
  let note = $state('กำลังโหลดแท่งเทียน…');
  let res: { buy?: Zone[]; sell?: Zone[]; price?: number; err?: string } | null = $state(null);
  const d = $derived(guessDigits(w.opts.symbol));

  onMount(() => {
    const o = w.opts; let lastRun = 0, alive = true;
    function compute(feed: Feed) {
      const c = feed.candles.slice(0, -1); if (c.length < 80) return null;
      const dg = guessDigits(o.symbol), q = quote(o.symbol);
      try {
        const A = AN.analyze(c, { swingLen: 5, digits: dg, rr1: 1, rr2: 2, slBuf: 0.2, minSamples: 5, maxBars: 30 });
        return BOUNCE.find(c, A, { F: (v: number) => fx(v, dg), price: q ? (q.bid + q.ask) / 2 : c[c.length - 1].close, slBuf: 0.2, rr1: 1, rr2: 2, maxBars: 30 }) as any;
      } catch (e) { return { err: (e as Error).message }; }
    }
    function update(feed: Feed) {
      if (!alive) return;
      if (feed.err && !feed.candles.length) { res = null; note = feed.err; return; }
      if (Date.now() - lastRun < 10000 && res) return;
      lastRun = Date.now(); const r = compute(feed);
      if (!r) { res = null; note = 'ข้อมูลยังไม่พอ'; return; }
      if (r.err) { res = null; note = `คำนวณไม่สำเร็จ: ${r.err}`; return; }
      res = r; note = (r.buy || []).length || (r.sell || []).length ? '' : 'ยังไม่พบโซนเด่น';
    }
    const f = acquire(o.symbol, o.tf, w.id, { update });
    if (!f) note = `ใช้ข้อมูลสดได้สูงสุด ${MAX} ชุด — ลบกราฟอื่นก่อน`;
    if (f && f.candles.length) update(f);
    return () => { alive = false; release(w.id); };
  });
</script>

{#snippet row(z: Zone, side: string)}<li class={side}><span class="tag">{side === 'buy' ? 'ซื้อ' : 'ขาย'}</span><b>{fx(z.lo, d)}–{fx(z.hi, d)}</b>
        <small>{z.label || z.typeName || z.type || ''}{z.status ? ' · ' + z.status : ''}</small><span class="stars">{'★'.repeat(Math.max(0, Math.min(5, z.stars || 0)))}</span></li>{/snippet}

{#if res && !note}<ul class="wd-bz">{#each (res.sell || []).slice(0, 3) as z}{@render row(z, 'sell')}{/each}<li class="px"><span>ราคา</span><b>{fx(res.price, d)}</b></li>{#each (res.buy || []).slice(0, 3) as z}{@render row(z, 'buy')}{/each}</ul>{:else}<p class="wd-empty">{note}</p>{/if}
