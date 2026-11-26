<script lang="ts">
  // "ข่าวและปฏิทิน" page: market headlines (news.js renders them into the legacy #newsfeed element, moved in here)
  // next to the full economic calendar of the week.
  import Icon from '../../ui/Icon.svelte';
  import NewsCalendar from './NewsCalendar.svelte';

  let { mobile, feed, onclose }: { mobile: boolean; feed: HTMLElement; onclose: () => void } = $props();
  let version = $state(0);
  /** re-read the calendar (called by the page on open and every 30 s) */
  export function refresh() { version++; }

  const FF = 'https://www.forexfactory.com/';
  // Forex Factory: its own pages (in-app window on desktop, browser on phone/web)
  function openFF(u: string) { const v = (window as any).vcg; if (v && v.openSite) v.openSite(u); else window.open(u, '_blank', 'noopener'); }
  function adopt(node: HTMLElement) { node.appendChild(feed); }
</script>

<div class="np-top">{#if mobile}<button class="np-close ib" aria-label="ปิด" onclick={onclose}><Icon name="arrow-left" size={18} /></button>{/if}<h1><Icon name="newspaper" size={20} />ข่าวและปฏิทินเศรษฐกิจ</h1>
      <div class="np-ff"><button data-ff="news" onclick={() => openFF(FF + 'news')}><Icon name="external-link" size={14} />ข่าว Forex Factory</button><button data-ff="calendar" onclick={() => openFF(FF + 'calendar')}><Icon name="calendar-days" size={14} />ปฏิทิน Forex Factory</button></div></div>
    <div class="np-cols"><section class="np-news" use:adopt></section><aside class="np-cal"><NewsCalendar {version} {openFF} /></aside></div>
