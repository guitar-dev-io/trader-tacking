<script lang="ts">
  // "ข่าวล่าสุด" — 3 headlines in the ราคา tab, with a link to the full news page.
  import Icon from '../../ui/Icon.svelte';
  import { HEADLINES } from '../../../news.js';

  let { onall }: { onall: () => void } = $props();
  let version = $state(0);
  export function refresh() { version++; }
  type H = { link: string; title: string; src: string; ago: string };
  const list = $derived.by((): H[] => { void version; return HEADLINES.latest ? HEADLINES.latest(3) : []; });
</script>

<div class="panel-h nt-h"><span><Icon name="newspaper" size={15} />ข่าวล่าสุด</span><button class="nt-all" onclick={onall}>ดูทั้งหมด <Icon name="chevron-right" size={13} /></button></div>
      {#if list.length}{#each list as x}<a class="nt-item" href={x.link} target="_blank" rel="noopener noreferrer"><span>{x.title}</span><small>{x.src} · {x.ago}</small></a>{/each}{:else}<p class="muted">ยังไม่มีข่าว</p>{/if}
