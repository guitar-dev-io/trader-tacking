<script lang="ts">
  // Widget settings popover: symbol, timeframe, symbol list, news filter, size, height, duplicate, remove.
  import { S, connStatus } from '../../state';
  import { TFS } from '../../../app-core.js';
  import { IC, svg } from './icons';
  import { mobile, TYPES, layout, save } from './model.svelte';

  // changing symbol / timeframe rebuilds the widget body by itself (Widget.svelte keys it on those options)
  let { id, anchor, rootEl, onclose, ondup, onrm }: {
    id: string; anchor: DOMRect; rootEl: HTMLElement; onclose: () => void; ondup: (id: string) => void; onrm: (id: string) => void;
  } = $props();

  const w = $derived(layout().find((x) => x.id === id));
  let el: HTMLElement | undefined = $state();
  let symIn: HTMLInputElement | undefined = $state(), symsIn: HTMLInputElement | undefined = $state(), relIn: HTMLInputElement | undefined = $state();
  const symList = [...new Set([...(S.symbols || []), ...(((connStatus || {}).mt5 || {}).symbols || []), 'XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSD', 'ETHUSD'])];
  let top = $state(0), left = $state(0);
  $effect(() => {
    void id;
    if (!el) return;
    const rr = rootEl.getBoundingClientRect();
    top = Math.min(anchor.bottom - rr.top + 4, rr.height - el.offsetHeight - 8);
    left = Math.max(8, Math.min(anchor.right - rr.left - el.offsetWidth, rr.width - el.offsetWidth - 8));
  });
  function apply() {
    if (!w) return;
    const o = w.opts, before = JSON.stringify(w);
    if (symIn && symIn.value.trim()) o.symbol = symIn.value.trim().toUpperCase().replace(/\s+/g, '');
    if (symsIn) o.symbols = symsIn.value.trim().toUpperCase();
    if (relIn) o.relevant = relIn.checked;
    if (JSON.stringify(w) !== before) save();
  }
  const ok = () => { apply(); onclose(); };
  const enter = (e: KeyboardEvent) => { if (e.key === 'Enter') ok(); };
  // widths: S M L XL full (12-column grid); heights: 1–3 rows
  const SIZES: [string, number][] = [['S', 3], ['M', 4], ['L', 6], ['XL', 8], ['เต็ม', 12]];
</script>

{#if w}{@const T = TYPES[w.type]}{@const o = w.opts}<div class="wd-pop" data-id={id} bind:this={el} style:top="{top}px" style:left="{left}px"><div class="pop-h">{@html svg(T.icon, 15)}<b>{T.name}</b><button class="wd-ib pop-close" onclick={ok}>{@html svg(IC.x, 14)}</button></div>
      {#if 'symbol' in o}<label>Symbol<input class="p-sym" list="dash-syms" value={o.symbol} bind:this={symIn} onkeydown={enter}></label><datalist id="dash-syms">{#each symList as s}<option value={s}></option>{/each}</datalist>{/if}
      {#if 'tf' in o}<label>Timeframe<span class="seg">{#each TFS as t}<button data-tf={t.type} class={+o.tf === t.type ? 'on' : ''} onclick={() => { o.tf = t.type; save(); }}>{t.label}</button>{/each}</span></label>{/if}
      {#if 'symbols' in o}<label>Symbols (คั่นด้วย ,)<input class="p-syms" value={o.symbols} placeholder="ว่าง = ใช้ watchlist" bind:this={symsIn} onkeydown={enter}></label>{/if}
      {#if 'relevant' in o}<label class="chk"><input type="checkbox" class="p-rel" checked={o.relevant} bind:this={relIn} onkeydown={enter}> เฉพาะข่าวที่เกี่ยวกับ symbol ปัจจุบัน</label>{/if}
      {#if !mobile}<label>ขนาด<span class="seg">{#each SIZES as [n, v]}<button data-w={v} class={w.w === v ? 'on' : ''} onclick={() => { w.w = v; save(); }}>{n}</button>{/each}</span></label>{/if}
      <label>ความสูง<span class="seg">{#each [1, 2, 3] as v}<button data-h={v} class={w.h === v ? 'on' : ''} onclick={() => { w.h = v; save(); }}>{v === 1 ? 'เตี้ย' : v === 2 ? 'กลาง' : 'สูง'}</button>{/each}</span></label>
      <div class="pop-act"><button class="p-dup" onclick={() => { onclose(); ondup(id); }}>{@html svg(IC.copy, 14)}ทำซ้ำ</button><button class="p-rm danger" onclick={() => { onclose(); onrm(id); }}>{@html svg(IC.trash, 14)}ลบ</button><span class="grow"></span><button class="p-ok primary" onclick={ok}>{@html svg(IC.check, 14)}ตกลง</button></div></div>{/if}
