<script lang="ts">
  // Setup guide: install the app, pick a price source, log in (VCG or MT5) — with live checks (Phase 4).
  import { flushSync } from 'svelte';
  import Icon from '../Icon.svelte';
  import { S } from '../../state';
  import { connStatus } from '../../../app-data.js';
  import { makePaths, type PathKey, type SetupCtx } from './content';
  import { isWin } from '../os';

  let { onact, onclose }: { onact: (a: string) => void; onclose: (done: boolean) => void } = $props();

  const isMobile = () => document.body.classList.contains('mobile') || !((window as any).vcg?.capabilities?.mt5);
  let path = $state<'start' | PathKey>('start');
  let step = $state(0);
  let tick = $state(0);
  const ctx: SetupCtx = $state({ mobile: isMobile(), win: isWin(), busy: false, lastRun: null });
  const P = $derived.by(() => { void ctx.busy; void ctx.lastRun; return makePaths(ctx); });

  export function go(p: string, s = 0) { path = (p in P ? p : 'start') as typeof path; step = s; ctx.mobile = isMobile(); ctx.win = isWin(); tick++; flushSync(); }
  export function setRun(busy: boolean, lastRun?: SetupCtx['lastRun']) { ctx.busy = busy; if (lastRun !== undefined) ctx.lastRun = lastRun; flushSync(); }
  export function refresh() { tick++; }

  const st = () => { void tick; return connStatus || {}; };
  const live = {
    vcg: () => { const s = st(); return s.connected && S.source === 'vcg' ? { ok: true, t: 'ราคาจาก VCG เข้าแล้ว' } : s.loggedIn ? { ok: false, t: 'login แล้ว กำลังรอราคา…' } : { ok: false, t: 'ยังไม่ได้ login' }; },
    mt5: () => {
      const m = st().mt5 || {};
      if (!m.connected) return { ok: false, t: S.source === 'mt5' ? 'รอ EA ใน MT5 เชื่อมต่อ (พอร์ต ' + (m.port || 7788) + ')' : 'ยังไม่ได้เลือก MT5 เป็นแหล่งราคา' };
      return { ok: true, t: 'เชื่อมต่อแล้ว: ' + (m.broker || 'MT5') + (m.server ? ' (' + m.server + ')' : '') + ' · ' + (m.symbols || []).length + ' symbol' };
    },
  };
  const cur = $derived.by(() => { void tick; return S.source === 'mt5' ? live.mt5() : S.source === 'vcg' ? live.vcg() : { ok: false, t: 'ใช้ข้อมูล Demo' }; });
  const version = $derived.by(() => { void tick; return st().version as string | undefined; });
  const sp = $derived(path === 'start' ? null : P[path]);
  const cs = $derived(sp ? sp.steps[step] : null);
  const chk = $derived.by(() => { void tick; return cs && cs.check ? live[cs.check]() : null; });

  function pick(p: PathKey) { path = p; step = p === 'install' ? (document.body.classList.contains('mobile') ? 2 : isWin() ? 1 : 0) : 0; ctx.lastRun = null; flushSync(); }
  function back() { if (step) step--; else path = 'start'; flushSync(); }
  function next() { step++; flushSync(); }
  function to(i: number) { step = i; flushSync(); }
  function bodyClick(e: MouseEvent) { const b = (e.target as HTMLElement).closest('[data-act]') as HTMLButtonElement | null; if (b && !b.disabled) onact(b.dataset.act!); }
  const CARDS: [PathKey, string, string, string][] = [
    ['demo', 'graduation-cap', 'ฝึก / เรียน (Demo)', 'ไม่ต้องสมัคร ไม่ต้อง login · เริ่มได้ทันที'],
    ['vcg', 'globe', 'VCG Markets', 'login ด้วยอีเมล + รหัสผ่านของ VCG · ใช้ได้ทั้ง Mac และ Android'],
  ];
</script>

<div class="su-card-wrap">
  <button class="su-x" data-nav="close" aria-label="ปิด" onclick={() => onclose(true)}><Icon name="x" size={18} bare /></button>
  {#if path === 'start'}
    <h2>เริ่มต้นใช้งาน Price Tracker</h2>
    <p class="muted">เลือกว่าจะเอาราคามาจากไหน · เปลี่ยนทีหลังได้เสมอ</p>
    <div class="su-now" class:ok={cur.ok}>สถานะตอนนี้: {cur.t}{version ? ' · v' + version : ''}</div>
    {#each CARDS as [p, icon, t, sub] (p)}
      <button class="su-card" data-path={p} onclick={() => pick(p)}><i><Icon name={icon} size={24} bare /></i><span><b>{t}</b><small>{sub}</small></span></button>
    {/each}
    <button class="su-card" data-path="mt5" disabled={ctx.mobile} onclick={() => pick('mt5')}><i><Icon name="monitor" size={24} bare /></i><span><b>MT5 โบรกเกอร์ของฉัน</b><small>{ctx.mobile ? 'ใช้ได้เฉพาะแอปบนคอม (Mac/Windows)' : 'Exness, XM, Brex ฯลฯ · EA อ่านอย่างเดียว ส่งออเดอร์ไม่ได้ — ดูออเดอร์/โพซิชันของตัวเองได้'}</small></span></button>
    <div class="su-sec">ยังไม่ได้ติดตั้ง หรืออยากอัปเดต?</div>
    <button class="su-card" data-path="install" onclick={() => pick('install')}><i><Icon name="download" size={24} bare /></i><span><b>วิธีติดตั้งแอป</b><small>Mac (zip) และ Android (apk) · แก้ปัญหาเปิดครั้งแรกไม่ได้</small></span></button>
    <p class="su-ro"><Icon name="shield-check" size={15} />แอปนี้<b>อ่านและแสดงราคาเท่านั้น</b> ไม่ส่งคำสั่งซื้อขาย · ผลวิเคราะห์มีไว้เพื่อการเรียนรู้ ไม่ใช่คำแนะนำการลงทุน</p>
  {:else if sp && cs}
    {@const n = sp.steps.length}
    <h2>{sp.title}</h2>
    {#if n > 1}
      <div class="su-dots">
        {#each sp.steps as x, i (i)}{#if i}<i></i>{/if}<button class={i < step ? 'done' : i === step ? 'now' : ''} data-step={i} title={x.h} onclick={() => to(i)}>{#if i < step}<Icon name="check" size={14} bare />{:else}{i + 1}{/if}</button>{/each}
      </div>
    {/if}
    <h3>{n > 1 ? `ขั้นที่ ${step + 1}: ` : ''}{cs.h}</h3>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="su-body" onclick={bodyClick}>{@html cs.body()}</div>
    {#if chk}<div class="su-now" class:ok={chk.ok}><Icon name={chk.ok ? 'circle-check' : 'hourglass'} size={16} />{chk.t}</div>{/if}
    <div class="su-nav"><button data-nav="back" onclick={back}>‹ {step ? 'ย้อนกลับ' : 'เลือกใหม่'}</button>
      {#if step < n - 1}<button class="su-next" data-nav="next" onclick={next}>ถัดไป ›</button>
      {:else if path !== 'demo'}<button class="su-next" data-nav="done" onclick={() => onclose(true)}>เสร็จแล้ว <Icon name="check" size={15} bare /></button>{/if}</div>
  {/if}
</div>
