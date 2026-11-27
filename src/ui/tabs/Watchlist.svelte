<script lang="ts">
  // Watchlist rows (mounted into #wl tbody). Bid cells flash green/red on each price change (Web Animations,
  // no re-layout per tick). Clicks: row = open chart, star = menu-bar/tray symbol, x = remove.
  import Icon from '../Icon.svelte';
  import { wlView } from './market-view';
  let { api }: { api: { pick: (s: string) => void; rm: (s: string) => void; star: (s: string) => void; fmt: (v: number, d?: number) => string } } = $props();
  const v = $derived($wlView);
  function flash(node: HTMLElement, bid: number | undefined) {
    let prev = bid;
    return { update(b: number | undefined) {
      if (prev != null && b != null && b !== prev && node.animate) node.animate([{ backgroundColor: b > prev ? 'rgba(38,166,154,.45)' : 'rgba(239,83,80,.45)' }, { backgroundColor: 'transparent' }], { duration: 600 });
      prev = b;
    } };
  }
</script>

{#each v.symbols as s (s)}
  {@const q = v.quotes[s]}
  <tr data-s={s} class={s === v.sel ? 'sel' : ''} onclick={() => api.pick(s)}>
    <td><button class="star {s === v.tray ? 'on' : ''}" data-act="star" title="แสดงบนแถบเมนู" aria-label="แสดงบนแถบเมนู" onclick={(e) => { e.stopPropagation(); api.star(s); }}><Icon name="star" size={14} bare /></button>{s}</td>
    <td class="b" use:flash={q?.bid}>{q ? api.fmt(q.bid, q.digits) : '—'}</td><td class="a">{q ? api.fmt(q.ask, q.digits) : '—'}</td>
    <td class="p {q && q.changePct != null ? (q.changePct >= 0 ? 'up' : 'down') : ''}">{q && q.changePct != null ? (q.changePct >= 0 ? '+' : '') + q.changePct.toFixed(2) : '—'}</td>
    <td><button class="x" data-act="rm" title="ลบ" aria-label="ลบ" onclick={(e) => { e.stopPropagation(); api.rm(s); }}><Icon name="x" size={14} bare /></button></td>
  </tr>
{/each}
