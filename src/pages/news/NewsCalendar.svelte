<script lang="ts">
  // Economic calendar of the week (data: extras.js NEWS.week, from Forex Factory's public weekly file).
  // Clicking an event opens that day on Forex Factory (its own page; nothing is copied).
  import Icon from '../../ui/Icon.svelte';
  import { store } from '../../state';
  import { NEWS } from '../../../extras.js';

  let { version = 0, openFF }: { version?: number; openFF: (url: string) => void } = $props();
  type Ev = { t: number; impact: string; ccy: string; title: string; when: string; forecast?: string; previous?: string };

  const FF = 'https://www.forexfactory.com/';
  const ny = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleString('en-US', { ...o, timeZone: 'America/New_York' });
  const ffDay = (t: number) => { const d = new Date(t * 1000); return FF + 'calendar?day=' + ny(d, { month: 'short' }).toLowerCase() + ny(d, { day: 'numeric' }) + '.' + ny(d, { year: 'numeric' }); };
  const dayName = (t: number) => new Date(t * 1000).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short' });

  let calAll = $state(store.get('np.calAll', false));
  function setAll(v: boolean) { calAll = v; store.set('np.calAll', v); }

  const data = $derived.by(() => {
    void version;                                   // re-read when the page asks (open / 30 s timer)
    if (typeof NEWS === 'undefined' || !NEWS.week) return null;
    const now = Date.now() / 1000;
    const list: Ev[] = NEWS.week(!calAll).filter((e: Ev) => e.impact !== 'Holiday' && (calAll || e.impact !== 'Low'));
    const days = new Map<string, Ev[]>();
    for (const e of list) { const k = new Date(e.t * 1000).toDateString(); if (!days.has(k)) days.set(k, []); days.get(k)!.push(e); }
    return { now, list, days: [...days.values()], next: list.find((e) => e.t > now), ccys: (NEWS.ccys ? NEWS.ccys() : []).join('/') };
  });
  const imp = (i: string) => (i === 'High' ? 'hi' : i === 'Medium' ? 'md' : 'lo');
</script>

{#if data}
<div class="np-cal-h"><b><Icon name="calendar-days" size={16} />ปฏิทินเศรษฐกิจสัปดาห์นี้</b>
  <div class="np-seg"><button data-ca="0" class={calAll ? '' : 'on'} onclick={() => setAll(false)}>{data.ccys} สำคัญ</button><button data-ca="1" class={calAll ? 'on' : ''} onclick={() => setAll(true)}>ทั้งหมด</button></div></div>
{#if data.next}<div class="np-next {data.next.impact === 'High' ? 'hi' : ''}"><small>ถัดไป</small><b>{data.next.ccy} {data.next.title}</b><span>{data.next.when}{data.next.forecast ? ' · คาด ' + data.next.forecast : ''}</span></div>{/if}
{#if data.list.length}{#each data.days as es}<div class="np-day"><div class="np-dh">{dayName(es[0].t)}</div>
  {#each es as e}<div class="np-ev {e.t < data.now ? 'past' : ''} {e.t > data.now && e.t - data.now < 3600 ? 'soon' : ''}" data-fft={e.t} title="ดูรายละเอียดบน Forex Factory" role="link" tabindex="0" onclick={() => openFF(ffDay(e.t))} onkeydown={(ev) => { if (ev.key === 'Enter') openFF(ffDay(e.t)); }}><i class="imp {imp(e.impact)}"></i>
    <span class="np-time">{e.when.split(' ').pop()}</span><span class="np-ccy">{e.ccy}</span><span class="np-title">{e.title}</span>
    <span class="np-fc">{e.forecast ? 'คาด ' + e.forecast : ''}{#if e.previous}<small>ก่อนหน้า {e.previous}</small>{/if}</span></div>{/each}</div>{/each}{:else}<p class="muted">ยังไม่มีข้อมูลปฏิทิน หรือโหลดไม่ได้</p>{/if}
<p class="muted np-src">ข้อมูลจาก Forex Factory (กดที่รายการเพื่อดูบนเว็บ) · <i class="imp hi"></i> สูง <i class="imp md"></i> กลาง · เวลาตาม timezone กราฟ</p>
{/if}
