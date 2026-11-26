<script lang="ts">
  // Headline list (news page): filter chips, short calendar, the list, sources. news.js fetches/merges the RSS
  // feeds and pushes a snapshot into `newsView`.
  import Icon from '../Icon.svelte';
  import { newsView } from './news-view';
  let { onFilter, onRefresh }: { onFilter: (k: string) => void; onRefresh: () => void } = $props();
  const v = $derived($newsView);
</script>

<div class="panel nw-head"><div class="panel-h"><span><Icon name="newspaper" />ข่าวตลาด</span><button id="nw-refresh" class="ib" title="โหลดใหม่" aria-label="โหลดใหม่" onclick={onRefresh}><Icon name={v.loading ? 'loader-circle' : 'refresh-cw'} bare /></button></div>
  <div class="nw-chips">{#each v.chips as [k, n]}<button data-nf={k} class={v.filter === k ? 'on' : ''} onclick={() => onFilter(k)}>{n}</button>{/each}</div>
  {#if v.cal.length}<div class="nw-cal">{#each v.cal as e}<div><i class="imp {e.impact === 'High' ? 'hi' : 'md'}"></i><b>{e.when}</b> {e.ccy} {e.title}</div>{/each}<small class="muted">ปฏิทินเศรษฐกิจ (Forex Factory)</small></div>{/if}
</div>
<div class="nw-list">
  {#each v.list as x}
    <a class="nw-item {x.t > v.seenAt ? 'new' : ''} {x.kind}" href={x.link} target="_blank" rel="noopener noreferrer"><span class="nw-t">{x.title}</span><span class="nw-m">{x.src} · {x.ago}{#if x.kind === 'official'} · <b>ทางการ</b>{/if}</span></a>
  {:else}
    <p class="muted">{v.loading ? 'กำลังโหลดข่าว…' : v.total ? 'ไม่มีข่าวในหมวดนี้' : 'ยังโหลดข่าวไม่ได้ — ตรวจอินเทอร์เน็ตแล้วกดปุ่มโหลดใหม่'}</p>
  {/each}
</div>
<p class="muted nw-foot">แหล่ง: {#each v.feeds as f, i}{#if i}{' · '}{/if}{f.name}{#if f.err}{' '}<Icon name="triangle-alert" size={12} cls="warn" />{/if}{/each} · แตะหัวข้อเพื่ออ่านที่เว็บต้นทาง · อัปเดตทุก 5 นาที{v.updated ? ' · ล่าสุด ' + v.updated : ''}</p>
