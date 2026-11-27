<script lang="ts">
  import * as LightweightCharts from 'lightweight-charts';
  import type { CandlestickData, UTCTimestamp } from 'lightweight-charts';
  // Live candlestick chart of one symbol/timeframe (lightweight-charts), fed by the shared slot feed (feeds.ts).
  import { onMount } from 'svelte';
  import { TC, theme } from '../../state';
  import { UP, DOWN, TZ } from '../../app/app-core';
  import { chartThemeOptions } from '../../chart/chart';
  import { acquire, release, type Feed } from './feeds';
  import { MAX, guessDigits, quote, type WidgetCfg } from './model.svelte';

  let { w, onhead }: { w: WidgetCfg; onhead: (px: number | null, ch: number | null) => void } = $props();

  let host: HTMLElement;
  let msg = $state('กำลังโหลด…'), msgHidden = $state(false);

  onMount(() => {
    const o = w.opts, dg = () => guessDigits(o.symbol);
    const ch = LightweightCharts.createChart(host, { autoSize: true, ...chartThemeOptions(10),
      timeScale: { borderColor: TC().border, timeVisible: +o.tf < 5, secondsVisible: false, rightOffset: 4, barSpacing: 6 },
      rightPriceScale: { borderColor: TC().border, scaleMargins: { top: 0.12, bottom: 0.08 } }, handleScale: { axisPressedMouseMove: false } });
    const ser = ch.addSeries(LightweightCharts.CandlestickSeries, { upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN,
      priceFormat: { type: 'price', precision: dg(), minMove: 1 / 10 ** dg() } });
    let shown = 0, alive = true;
    function head(feed: Feed) {
      const a = feed.candles, last = a[a.length - 1], q = quote(o.symbol);
      const px = q ? q.bid : last && last.close;
      let c2: number | null = q && q.changePct != null ? q.changePct : null;
      if (c2 == null && a.length > 1) { const dayStart = a.find((c) => c.time >= Math.floor((last.time - TZ) / 86400) * 86400 + TZ) || a[0]; c2 = ((last.close - dayStart.open) / dayStart.open) * 100; }
      onhead(px, c2);
    }
    function update(feed: Feed, full?: boolean) {
      if (!alive) return;
      if (feed.err && !feed.candles.length) { msg = feed.err; msgHidden = false; return; }
      if (!feed.candles.length) return;
      msgHidden = true;
      if (full || !shown) { ser.setData(feed.candles.slice(-400) as CandlestickData<UTCTimestamp>[]); shown = feed.candles.length; ch.timeScale().scrollToRealTime(); }
      else ser.update(feed.candles[feed.candles.length - 1] as CandlestickData<UTCTimestamp>);
      head(feed);
    }
    const f = acquire(o.symbol, o.tf, w.id, { update });
    if (!f) msg = `กราฟสดได้สูงสุด ${MAX} กราฟพร้อมกัน — ลบกราฟอื่นก่อน`;
    if (f && f.candles.length) update(f, true);
    let first = true;
    const unsub = theme.subscribe(() => { if (first) { first = false; return; } ch.applyOptions(chartThemeOptions(10)); ser.applyOptions({ upColor: UP, downColor: DOWN, wickUpColor: UP, wickDownColor: DOWN }); });
    return () => { alive = false; unsub(); release(w.id); try { ch.remove(); } catch (_) { /* already removed */ } };
  });
</script>

<div class="wd-cv" bind:this={host}></div><div class="wd-msg" class:hidden={msgHidden}>{msg}</div>
