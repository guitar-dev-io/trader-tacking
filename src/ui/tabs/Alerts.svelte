<script lang="ts">
  // Price alerts for the open symbol (mounted into #alerts).
  import Icon from '../Icon.svelte';
  import { alertView } from './market-view';
  let { api }: { api: { rm: (id: number) => void; fmt: (v: number) => string } } = $props();
  const v = $derived($alertView);
</script>

{#each v.list as a}
  <li class={a.fired ? 'fired' : ''}><span>{a.symbol} {a.dir === 'up' ? '≥' : '≤'} {api.fmt(a.price)}</span><button data-id={a.id} aria-label="ลบ" onclick={() => api.rm(a.id)}><Icon name="x" size={14} bare /></button></li>
{:else}
  <li class="muted" style="border:none">ยังไม่มีการแจ้งเตือนของ {v.symbol}</li>
{/each}
