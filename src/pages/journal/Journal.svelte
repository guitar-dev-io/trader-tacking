<script lang="ts">
  // "ผลการเทรด" — trading journal built from the user's own MT5 history (read-only, stored on this computer).
  import Icon from '../../ui/Icon.svelte';
  import { S, connStatus, theme, store } from '../../state';
  import type { Trade } from '../../core/journal';
  import { JOURNAL } from '../../legacy/core';
  import { POSITIONS } from '../../app/positions';
  import { jr, TH_MON, TH_WD, SESS, RANGES, money, pct, cls, dur, tz, compute, cur, setRange, type Computed } from './model.svelte';
  import { drawCharts } from './charts';

  let { mobile, onclose, onact, ontrade }: {
    mobile: boolean; onclose: () => void; onact: (a: string) => void; ontrade: (t: Trade) => void;
  } = $props();

  const d: Computed | null = $derived(jr.raw ? compute() : null);
  const has = $derived(!!d && d.all.some((t) => t.closed));
  const vcg = (window as any).vcg;

  // ------------------------------------------------------------ header
  const syncTxt = $derived.by(() => {
    const raw = jr.raw, status = (raw && raw.status) || {};
    return raw && raw.sample ? 'ข้อมูลตัวอย่าง' : status.state === 'backfill' || (raw && raw.syncing) ? status.msg || 'กำลังซิงค์…'
      : status.state === 'error' ? status.msg : status.state === 'offline' ? status.msg
        : raw && raw.syncedAt ? 'ซิงค์ล่าสุด ' + new Date(raw.syncedAt * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '';
  });
  const acct = $derived((jr.raw && jr.raw.account) || {});

  // ------------------------------------------------------------ empty state
  const empty = $derived.by(() => {
    const st = (jr.raw && jr.raw.status) || {}, m = (connStatus || {}).mt5 || {};
    if (!vcg.journalGet) return { h: 'ผลการเทรดใช้ได้ในแอปบนคอม (Mac / Windows)', p: 'แอปจะอ่านประวัติการเทรดจาก MT5 ในเครื่องของคุณ — บนมือถือ/เว็บดูตัวอย่างได้', act: '' };
    if (st.state === 'old-ea' || (m.connected && m.eaVersion && m.eaVersion < 2)) return { h: 'ต้องอัปเดต EA ใน MT5', p: 'EA รุ่นนี้ยังส่งประวัติการเทรดไม่ได้ — ติดตั้ง EA ใหม่ (1.03) แล้ว compile อีกครั้ง', act: 'ea' };
    if (S.source !== 'mt5') return { h: 'เชื่อมต่อ MT5 เพื่อดูผลการเทรดของคุณ', p: 'เลือก MT5 เป็นแหล่งราคาและติด EA PriceTrackerBridge — แอปจะดึงประวัติย้อนหลัง 1 ปีมาเก็บไว้ในเครื่องนี้', act: 'mt5' };
    if (!m.connected) return { h: 'รอ EA ใน MT5 เชื่อมต่อ', p: 'เปิด MT5 และกราฟที่ติด EA ไว้ แล้วกด "ซิงค์"', act: '' };
    if (st.state === 'backfill' || (jr.raw && jr.raw.syncing)) return { h: 'กำลังดึงประวัติย้อนหลัง…', p: st.msg || 'ครั้งแรกอาจใช้เวลาสักครู่', act: '' };
    return { h: 'ยังไม่มีการเทรดที่ปิดแล้วในช่วงนี้', p: 'ลองเลือกช่วงเวลา "ทั้งหมด" หรือกด "ซิงค์"', act: '' };
  });

  // ------------------------------------------------------------ KPIs
  const bal = $derived.by(() => {
    const snap = jr.raw && jr.raw.snapshots && jr.raw.snapshots[jr.raw.snapshots.length - 1];
    const live = !jr.sampleMode && typeof POSITIONS !== 'undefined' && POSITIONS.data && POSITIONS.data() && POSITIONS.data().acct;
    return { bal: live ? live.balance : snap && snap.balance, eq: live ? live.equity : snap && snap.equity };
  });

  // ------------------------------------------------------------ calendar
  const cal = $derived.by(() => {
    if (!d) return null;
    const k = jr.calMonth || JOURNAL.monthKey(d.ts.length ? d.ts[d.ts.length - 1].close! : (jr.raw && jr.raw.sample ? jr.raw.syncedAt! : Math.floor(Date.now() / 1000)), tz());
    const y = +k.slice(0, 4), m = +k.slice(5, 7) - 1, first = new Date(Date.UTC(y, m, 1)), days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const lead = (first.getUTCDay() + 6) % 7;
    const byDay = new Map(d.allSt.byDay.map((g) => [g.key, g]));
    const monthDays = [...byDay.values()].filter((g) => g.key.startsWith(k));
    const mx = Math.max(1, ...monthDays.map((g) => Math.abs(g.net)));
    const cells = Array.from({ length: days }, (_, i) => {
      const dd = i + 1, key = `${k}-${String(dd).padStart(2, '0')}`, g = byDay.get(key);
      return { dd, key, g, a: g ? 0.12 + 0.6 * Math.min(1, Math.abs(g.net) / mx) : 0 };
    });
    return { k, y, m, lead, cells, tot: monthDays.reduce((s, g) => s + g.net, 0), n: monthDays.reduce((s, g) => s + g.n, 0) };
  });
  function monthStep(step: number) { const [y, m] = cal!.k.split('-').map(Number), dt = new Date(Date.UTC(y, m - 1 + step, 1)); jr.calMonth = dt.toISOString().slice(0, 7); }
  function pickDay(key: string) {
    jr.dayFilter = jr.dayFilter === key ? null : key; jr.page = 0;
    if (jr.dayFilter) queueMicrotask(() => document.getElementById('jr-trades')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  // ------------------------------------------------------------ monthly table
  const monthly = $derived.by(() => {
    if (!d) return null;
    const by = new Map(d.allSt.byMonth.map((g) => [g.key, g]));
    const years = [...new Set(d.allSt.byMonth.map((g) => g.key.slice(0, 4)))].sort().reverse();
    if (!years.length) return null;
    const mx = Math.max(1, ...d.allSt.byMonth.map((g) => Math.abs(g.net)));
    return years.map((y) => {
      const cells = TH_MON.map((_, i) => by.get(`${y}-${String(i + 1).padStart(2, '0')}`));
      return { y, cells, tot: cells.reduce((s, g) => s + (g ? g.net : 0), 0), mx };
    });
  });

  // ------------------------------------------------------------ breakdowns
  const bd = $derived.by(() => {
    if (!d) return null;
    const s = d.st;
    const side = (k: string) => s.bySide.find((g) => g.key === k) || { n: 0, net: 0, winRate: 0, lots: 0 };
    const sess = ['asia', 'london', 'newyork'].map((k) => s.bySession.find((g) => g.key === k) || { key: k, net: 0, n: 0 });
    const wd = [0, 1, 2, 3, 4, 5, 6].map((i) => s.byWeekday.find((g) => g.key === i) || { key: i, net: 0, n: 0 }).filter((g) => (g.key as number) < 5 || g.n);
    const hmx = Math.max(1, ...s.byHour.map((g) => Math.abs(g.net)));
    const hours = Array.from({ length: 24 }, (_, h) => s.byHour.find((g) => g.key === h) || { key: h, net: 0, n: 0 });
    return { s, buy: side('buy'), sell: side('sell'), sess, wd, hmx, hours };
  });
  const barMax = (list: { net: number }[]) => Math.max(1, ...list.map((g) => Math.abs(g.net)));

  // ------------------------------------------------------------ trades table
  const tbl = $derived.by(() => {
    if (!d) return null;
    let ts = d.ts.slice();
    if (jr.dayFilter) ts = d.all.filter((t) => t.closed && JOURNAL.dayKey(t.close!, tz()) === jr.dayFilter);
    const f = jr.filt;
    if (f.s) ts = ts.filter((t) => t.s === f.s);
    if (f.side) ts = ts.filter((t) => t.side === f.side);
    if (f.res) ts = ts.filter((t) => (f.res === 'win' ? t.net > 0 : t.net < 0));
    const keys: Record<string, (t: Trade) => number | string> = { close: (t) => t.close!, s: (t) => t.s, side: (t) => t.side, vol: (t) => t.vol, dur: (t) => t.duration || 0, net: (t) => t.net };
    const key = keys[jr.sort.k] || keys.close;
    ts.sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * jr.sort.dir);
    const per = 15, pages = Math.max(1, Math.ceil(ts.length / per)), page = Math.min(jr.page, pages - 1);
    return { ts, page, pages, rows: ts.slice(page * per, page * per + per), syms: [...new Set(d.all.filter((t) => t.closed).map((t) => t.s))].sort(), sum: ts.reduce((s, t) => s + t.net, 0) };
  });
  const when = (t: number) => new Date((t + tz()) * 1000).toISOString().slice(5, 16).replace('T', ' ').replace('-', '/');
  function sortBy(k: string) { jr.sort = { k, dir: jr.sort.k === k ? -jr.sort.dir : -1 }; }
  function setFilt(k: string, v: string) { jr.filt[k] = v; jr.page = 0; }
  function symRow(sym: string) { jr.filt.s = sym; jr.page = 0; queueMicrotask(() => document.getElementById('jr-trades')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }
  function setCustom(k: 'from' | 'to', v: string) { jr.custom = { ...(jr.custom || {}), [k]: v }; store.set('jr.custom', jr.custom); }

  // ------------------------------------------------------------ charts (lightweight-charts), redrawn with the data / theme
  let eqEl: HTMLElement | undefined = $state(), dayEl: HTMLElement | undefined = $state();
  $effect(() => {
    if (!d || !has) return;
    void $theme;
    const data = d, a = eqEl, b = dayEl;
    let charts: { remove(): void }[] = [], dead = false;
    const raf = requestAnimationFrame(() => { if (!dead) charts = drawCharts(data, a, b); });
    return () => { dead = true; cancelAnimationFrame(raf); for (const c of charts) { try { c.remove(); } catch (_) { /* already gone */ } } };
  });
</script>

{#snippet shell()}
  <div class="jr-head">
        {#if mobile}<button class="jr-close ib" aria-label="ปิด" onclick={onclose}><Icon name="arrow-left" size={18} /></button>{/if}
        <div class="jr-title"><h1><Icon name="wallet" size={20} />ผลการเทรด</h1>
          <div class="jr-acct">{#if acct.broker}<b>{acct.broker}</b>{:else}<b>บัญชี MT5</b>{/if}{#if acct.demo != null}<span class="jr-badge {acct.demo ? 'demo' : 'real'}">{acct.demo ? 'DEMO' : 'REAL'}</span>{/if}
            <small>{[acct.server, cur()].filter(Boolean).join(' · ')}</small></div></div>
        <div class="jr-actions">
          <span class="jr-sync {jr.raw && jr.raw.status && jr.raw.status.state === 'error' ? 'bad' : ''}">{#if jr.raw && jr.raw.syncing}<Icon name="loader-circle" size={14} cls="spin" />{/if}{syncTxt}</span>
          {#if !jr.raw || !jr.raw.sample}<button data-a="sync" title="ดึงประวัติล่าสุดจาก MT5" onclick={() => onact('sync')}><Icon name="refresh-cw" size={15} /><span class="lbl">ซิงค์</span></button>{/if}
          <button data-a="csv" title="ส่งออกรายการเทรดเป็น CSV" onclick={() => onact('csv')}><Icon name="download" size={15} /><span class="lbl">CSV</span></button>
          <button data-a="sample" class={jr.sampleMode ? 'on' : ''} title="ดูหน้าตาด้วยข้อมูลตัวอย่าง" onclick={() => onact('sample')}><Icon name="sparkles" size={15} /><span class="lbl">{jr.sampleMode ? 'ออกจากตัวอย่าง' : 'ดูตัวอย่าง'}</span></button>
        </div>
      </div>
      <div class="jr-bar">
        <div class="jr-seg">{#each RANGES as [k, l]}<button data-r={k} class={jr.range === k ? 'on' : ''} onclick={() => setRange(k)}>{l}</button>{/each}</div>
        {#if jr.range === 'custom'}<div class="jr-custom"><input type="date" data-c="from" value={(jr.custom && jr.custom.from) || ''} onchange={(e) => setCustom('from', e.currentTarget.value)}><span>–</span><input type="date" data-c="to" value={(jr.custom && jr.custom.to) || ''} onchange={(e) => setCustom('to', e.currentTarget.value)}></div>{/if}
        <span class="jr-note"><Icon name="shield-check" size={14} />ข้อมูลอ่านจาก MT5 ของคุณ เก็บไว้ในเครื่องนี้เท่านั้น · อ่านอย่างเดียว</span>
      </div>
      {#if jr.sampleMode}<div class="jr-banner"><Icon name="info" size={15} />กำลังแสดง<b>ข้อมูลตัวอย่าง</b> — ไม่ใช่บัญชีของคุณ</div>{/if}
{/snippet}

{#snippet kpi(k: string, label: string, val: string, sub: string, icon: string, c: string)}<div class="jr-kpi {k}"><div class="jr-kl"><Icon name={icon} size={14} />{label}</div><div class="jr-kv {c}">{val}</div><div class="jr-ks">{sub}</div></div>{/snippet}

{#snippet barRows(list: { key: string | number; net: number; n: number }[], label: (g: any) => string)}{@const mx = barMax(list)}{#each list as g}<div class="jr-br"><span class="jr-bl">{label(g)} <small>{g.n}</small></span><span class="jr-bt"><i class={cls(g.net)} style="width:{(Math.abs(g.net) / mx * 100).toFixed(1)}%"></i></span><span class="jr-bv {cls(g.net)}">{money(g.net)}</span></div>{/each}{/snippet}

{#if !jr.raw}{@render shell()}<div class="jr-empty"><Icon name="loader-circle" size={28} cls="spin" /></div>{:else if d}<div class="jr-in">{@render shell()}{#if !has}<div class="jr-empty"><Icon name="chart-column" size={40} /><h3>{empty.h}</h3><p>{empty.p}</p><div class="jr-empty-a">{#if empty.act === 'ea'}<button class="primary" data-a="guide" onclick={() => onact('guide')}><Icon name="rocket" size={15} />วิธีอัปเดต EA</button>{:else if empty.act === 'mt5'}<button class="primary" data-a="guide" onclick={() => onact('guide')}><Icon name="plug" size={15} />ตัวช่วยเชื่อมต่อ MT5</button>{/if}<button data-a="sample" onclick={() => onact('sample')}><Icon name="sparkles" size={15} />ดูตัวอย่าง</button></div></div>{:else}{@const s = d.st}<div class="jr-kpis">
      {@render kpi('big', 'กำไรสุทธิ', money(s.net), `กำไร ${money(s.gross, false)} · ขาดทุน ${money(-s.grossLoss, false)}`, 'banknote', cls(s.net))}
      {@render kpi('', 'Win rate', pct(s.winRate), `ชนะ ${s.wins} · แพ้ ${s.losses}`, 'target', '')}
      {@render kpi('', 'Profit factor', s.profitFactor === Infinity ? '∞' : s.profitFactor ? s.profitFactor.toFixed(2) : '—', 'กำไรรวม ÷ ขาดทุนรวม', 'scale', s.profitFactor >= 1 ? 'pos' : s.trades ? 'neg' : '')}
      {@render kpi('', 'จำนวนเทรด', s.trades.toLocaleString(), `เฉลี่ยถือ ${dur(s.avgHoldSec)}`, 'list-checks', '')}
      {@render kpi('', 'Lot รวม', s.lots.toFixed(2), `ค่าคอม ${money(s.commission, false)} · swap ${money(s.swap, false)}`, 'layers', '')}
      {@render kpi('', 'Max drawdown', money(-s.maxDrawdown), s.maxDrawdownPct ? pct(s.maxDrawdownPct) + ' จากจุดสูงสุด' : 'จากเส้นกำไรที่ปิดแล้ว', 'trending-down', s.maxDrawdown ? 'neg' : '')}
      {@render kpi('', 'Expectancy', money(s.expectancy), `ชนะเฉลี่ย ${money(s.avgWin)} · แพ้เฉลี่ย ${money(s.avgLoss)}`, 'sigma', cls(s.expectancy))}
      {@render kpi('', 'Balance / Equity', bal.bal != null ? money(bal.bal, false) : '—', bal.eq != null ? `Equity ${money(bal.eq, false)}${d.open.length ? ` · เปิดอยู่ ${d.open.length}` : ''}` : 'อัปเดตเมื่อ MT5 เชื่อมต่อ', 'wallet', '')}
    </div>
      <div class="jr-row2"><div class="jr-card jr-eq"><div class="jr-ch"><b><Icon name="chart-area" size={15} />Balance (จากเทรดที่ปิดแล้ว)</b><span class="jr-legend"><i class="dep"></i>ฝาก/ถอน</span></div><div class="jr-chart" id="jr-eq" bind:this={eqEl}></div></div>
        {#if cal}<div class="jr-card jr-cal"><div class="jr-ch"><b><Icon name="calendar-days" size={15} />ปฏิทินกำไร/ขาดทุน</b>
        <div class="jr-mnav"><button data-cm="-1" aria-label="เดือนก่อน" onclick={() => monthStep(-1)}><Icon name="chevron-left" size={16} /></button><span>{TH_MON[cal.m]} {cal.y + 543}</span><button data-cm="1" aria-label="เดือนถัดไป" onclick={() => monthStep(1)}><Icon name="chevron-right" size={16} /></button></div>
        <span class="jr-csum {cls(cal.tot)}">{money(cal.tot)} · {cal.n} เทรด</span></div>
      <div class="jr-cgrid">{#each TH_WD as w}<div class="jr-wd">{w}</div>{/each}{#each { length: cal.lead } as _}<div class="jr-cd blank"></div>{/each}{#each cal.cells as c}{#if c.g}<button class="jr-cd {c.g.net >= 0 ? 'pos' : 'neg'} {jr.dayFilter === c.key ? 'sel' : ''}" data-day={c.key} style="--a:{c.a.toFixed(2)}" onclick={() => pickDay(c.key)}>
        <i>{c.dd}</i><b>{money(c.g.net)}</b><small>{c.g.n} เทรด</small></button>{:else}<button class="jr-cd  {jr.dayFilter === c.key ? 'sel' : ''}" data-day={c.key} disabled>
        <i>{c.dd}</i></button>{/if}{/each}</div></div>{/if}</div>
      <div class="jr-row2b"><div class="jr-card"><div class="jr-ch"><b><Icon name="chart-column" size={15} />กำไร/ขาดทุนรายวัน</b></div><div class="jr-chart sm" id="jr-daily" bind:this={dayEl}></div></div>{#if monthly}<div class="jr-card jr-monthly"><div class="jr-ch"><b><Icon name="table-2" size={15} />รายเดือน</b></div><div class="jr-mt-wrap"><table class="jr-mt"><thead><tr><th></th>{#each TH_MON as x}<th>{x}</th>{/each}<th>รวม</th></tr></thead><tbody>
      {#each monthly as row}<tr><th>{+row.y + 543}</th>{#each row.cells as g}{#if g}<td class={cls(g.net)} style="--a:{(0.1 + 0.55 * Math.min(1, Math.abs(g.net) / row.mx)).toFixed(2)}" title="{g.n} เทรด · win {pct(g.winRate, 0)}">{money(g.net)}</td>{:else}<td class="none">—</td>{/if}{/each}<td class="tot {cls(row.tot)}">{money(row.tot)}</td></tr>{/each}
      </tbody></table></div></div>{/if}</div>
      {#if bd}<div class="jr-row3"><div class="jr-card"><div class="jr-ch"><b><Icon name="coins" size={15} />ตาม Symbol</b></div><table class="jr-tbl sm"><thead><tr><th>Symbol</th><th>เทรด</th><th>Win</th><th>Lot</th><th>สุทธิ</th></tr></thead><tbody>
      {#each bd.s.bySymbol as g}<tr data-sym={g.key} onclick={() => symRow(g.key)}><td><b>{g.key}</b></td><td>{g.n}</td><td>{pct(g.winRate, 0)}</td><td>{g.lots.toFixed(2)}</td><td class={cls(g.net)}>{money(g.net)}</td></tr>{:else}<tr><td colspan="5" class="muted">—</td></tr>{/each}</tbody></table></div><div class="jr-card"><div class="jr-ch"><b><Icon name="arrow-up-down" size={15} />Buy vs Sell</b></div>
      <div class="jr-sides"><div class="buy"><small><Icon name="trending-up" size={14} />Buy</small><b class={cls(bd.buy.net)}>{money(bd.buy.net)}</b><span>{bd.buy.n} เทรด · win {pct(bd.buy.winRate, 0)} · {bd.buy.lots.toFixed(2)} lot</span></div>
      <div class="sell"><small><Icon name="trending-down" size={14} />Sell</small><b class={cls(bd.sell.net)}>{money(bd.sell.net)}</b><span>{bd.sell.n} เทรด · win {pct(bd.sell.winRate, 0)} · {bd.sell.lots.toFixed(2)} lot</span></div></div>
      <div class="jr-sub">ช่วงตลาด (เวลาเปิดออเดอร์)</div>{@render barRows(bd.sess, (g) => SESS[g.key])}</div><div class="jr-card"><div class="jr-ch"><b><Icon name="clock" size={15} />วันและเวลาที่เทรด</b></div>{@render barRows(bd.wd, (g) => TH_WD[g.key])}
      <div class="jr-sub">รายชั่วโมง (เวลากราฟ)</div><div class="jr-hours">{#each bd.hours as g}<i class={g.n ? cls(g.net) : 'none'} style="--a:{g.n ? (0.15 + 0.7 * Math.abs(g.net) / bd.hmx).toFixed(2) : 0}" title="{String(g.key).padStart(2, '0')}:00 · {g.n} เทรด · {money(g.net)}"></i>{/each}</div>
      <div class="jr-hlab"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
      <div class="jr-sub">สถิติอื่น</div><div class="jr-facts">
        <span>ชนะติดกันสูงสุด<b>{bd.s.maxConsecWins}</b></span><span>แพ้ติดกันสูงสุด<b>{bd.s.maxConsecLosses}</b></span>
        <span>ไม้ที่ดีที่สุด<b class="pos">{money(bd.s.largestWin)}</b></span><span>ไม้ที่แย่ที่สุด<b class="neg">{money(bd.s.largestLoss)}</b></span>
        <span>วันที่ดีที่สุด<b class="pos">{bd.s.bestDay ? money(bd.s.bestDay.net) : '—'}</b></span><span>วันที่แย่ที่สุด<b class="neg">{bd.s.worstDay ? money(bd.s.worstDay.net) : '—'}</b></span></div></div></div>{/if}{#if tbl}<div class="jr-card jr-trades" id="jr-trades"><div class="jr-ch"><b><Icon name="list" size={15} />รายการเทรด</b>
        {#if jr.dayFilter}<span class="jr-chip">{jr.dayFilter}<button data-a="clearday" aria-label="ล้างวัน" onclick={() => { jr.dayFilter = null; }}><Icon name="x" size={12} /></button></span>{/if}
        <div class="jr-filters"><Icon name="filter" size={14} /><select data-f="s" value={jr.filt.s} onchange={(e) => setFilt('s', e.currentTarget.value)}><option value="">ทุก Symbol</option>{#each tbl.syms as x}<option value={x}>{x}</option>{/each}</select>
          <select data-f="side" value={jr.filt.side} onchange={(e) => setFilt('side', e.currentTarget.value)}><option value="">Buy + Sell</option><option value="buy">Buy</option><option value="sell">Sell</option></select>
          <select data-f="res" value={jr.filt.res} onchange={(e) => setFilt('res', e.currentTarget.value)}><option value="">ชนะ + แพ้</option><option value="win">ชนะ</option><option value="loss">แพ้</option></select></div></div>
      <div class="jr-tw"><table class="jr-tbl"><thead><tr>{#each [['close', 'ปิดเมื่อ'], ['s', 'Symbol'], ['side', 'ฝั่ง'], ['vol', 'Lot']] as [k, l]}<th data-sort={k} class={jr.sort.k === k ? 'on' : ''} onclick={() => sortBy(k)}>{l}{jr.sort.k === k ? (jr.sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>{/each}<th>เข้า → ออก</th>{#each [['dur', 'ถือ'], ['net', 'สุทธิ']] as [k, l]}<th data-sort={k} class={jr.sort.k === k ? 'on' : ''} onclick={() => sortBy(k)}>{l}{jr.sort.k === k ? (jr.sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>{/each}</tr></thead><tbody>
      {#each tbl.rows as t}<tr data-pos={t.pos} title="ดูบนกราฟ" onclick={() => ontrade(t)}><td>{when(t.close!)}</td><td><b>{t.s}</b>{#if t.partial} <small class="muted">แบ่งปิด</small>{/if}</td><td><span class="jr-side {t.side}">{t.side === 'buy' ? 'Buy' : 'Sell'}</span></td><td>{t.vol.toFixed(2)}</td>
        <td class="px">{t.openPrice != null ? +t.openPrice.toFixed(5) : '—'} → {t.closePrice != null ? +t.closePrice.toFixed(5) : '—'}</td><td>{dur(t.duration)}</td><td class={cls(t.net)}><b>{money(t.net)}</b></td></tr>{:else}<tr><td colspan="7" class="muted jr-none">ไม่มีรายการ</td></tr>{/each}
      </tbody></table></div>
      <div class="jr-pager"><span>{tbl.ts.length} รายการ · รวม <b class={cls(tbl.sum)}>{money(tbl.sum)}</b></span><span class="jr-pg"><button data-pg="-1" disabled={!tbl.page} aria-label="ก่อนหน้า" onclick={() => { jr.page = tbl.page - 1; }}><Icon name="chevron-left" size={15} /></button>{tbl.page + 1} / {tbl.pages}<button data-pg="1" disabled={!(tbl.page < tbl.pages - 1)} aria-label="ถัดไป" onclick={() => { jr.page = tbl.page + 1; }}><Icon name="chevron-right" size={15} /></button></span></div></div>{/if}{/if}</div>{/if}
