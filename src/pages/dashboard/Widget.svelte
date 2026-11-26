<script lang="ts">
  // One dashboard widget: header (drag handle, icon, symbol/name, settings, remove) + its body. The body mounts
  // lazily — only once the widget has been on screen while the dashboard is shown (charts and feeds are costly).
  import { S, store } from '../../state';
  import { renderAlerts } from '../../../app-data.js';
  import { NEWS } from '../../../extras.js';
  import { HEADLINES } from '../../../news.js';
  import { POSITIONS } from '../../../positions.js';
  import ChartBody from './ChartBody.svelte';
  import BounceBody from './BounceBody.svelte';
  import { IC, svg } from './icons';
  import { dash, mobile, TYPES, tfOf, fx, guessDigits, quote, quoteSyms, sparks, sparkPoints, ago, SESS, localHour, type WidgetCfg } from './model.svelte';

  let { w, onsym }: { w: WidgetCfg; onsym: (sym: string, tf?: number) => void } = $props();
  const T = $derived(TYPES[w.type]);
  let head = $state<{ px: number | null; ch: number | null } | null>(null);
  let seen = $state(false);
  const mounted = $derived(seen);
  // the body is rebuilt when the widget's data source changes (symbol / timeframe / symbol list)
  const bodyKey = $derived(`${w.opts.symbol}|${w.opts.tf}|${w.opts.symbols}|${w.opts.relevant}`);

  function lazy(node: HTMLElement) {
    const on = () => { if (dash.active && !seen) seen = true; };
    if (!('IntersectionObserver' in window)) { const t = setInterval(() => { if (dash.active) { seen = true; clearInterval(t); } }, 250); return { destroy() { clearInterval(t); } }; }
    const io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) on(); }), { root: null, rootMargin: '200px' });
    io.observe(node);
    // when the dashboard becomes active, mount what is already on screen
    const stop = $effect.root(() => { $effect(() => { if (dash.active && !seen) requestAnimationFrame(() => { const r = node.getBoundingClientRect(); if (r.bottom > -200 && r.top < innerHeight + 200) on(); }); }); });
    return { destroy() { io.disconnect(); stop(); } };
  }
  // list widgets: view models recomputed every second (dash.tick) — the data (quotes, news, …) is not reactive
  const vm = $derived.by(() => {
    void dash.tick;
    switch (w.type) {
      case 'quotes': return { rows: quoteSyms(w.opts).map((s) => { const q = quote(s); return { s, q, d: q ? q.digits : guessDigits(s), p: q && q.changePct, sp: sparkPoints(sparks.get(s)) }; }) };
      case 'positions': return { pos: S.source === 'mt5' && typeof POSITIONS !== 'undefined' && POSITIONS.data ? POSITIONS.data() : null, src: S.source };
      case 'news': return { list: typeof HEADLINES !== 'undefined' && HEADLINES.list ? HEADLINES.list({ relevant: !!w.opts.relevant, limit: 12 }).map((n: any) => ({ ...n, ago: ago(n.time) })) : [] };
      case 'calendar': return { ev: typeof NEWS !== 'undefined' && NEWS.upcoming ? NEWS.upcoming(8) : [] };
      case 'sessions': { const now = new Date(); return { clock: now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }), sess: SESS.map(([n, z, o, c]) => {
        const lh = localHour(z, now), weekend = lh.wd === 'Sat' || lh.wd === 'Sun', open = !weekend && lh.h >= o && lh.h < c;
        const left = open ? c - lh.h : (lh.h < o ? o - lh.h : 24 - lh.h + o), hm = `${Math.floor(left)}:${String(Math.round((left % 1) * 60)).padStart(2, '0')}`;
        return { n, open, pct: open ? ((lh.h - o) / (c - o)) * 100 : 0, txt: weekend ? 'ปิดเสาร์–อาทิตย์' : open ? 'เปิด · ปิดใน ' + hm : 'ปิด · เปิดใน ' + hm };
      }) }; }
      case 'alerts': return { al: [...(S.alerts || [])] };
      default: return {};
    }
  }) as any;
  function rmAlert(id: string) { S.alerts = S.alerts.filter((a: { id: unknown }) => String(a.id) !== id); store.set('alerts', S.alerts); if (typeof renderAlerts === 'function') renderAlerts(); dash.tick++; }
  const pctCls = (p: number | null | undefined) => (p == null ? '' : p > 0 ? 'up' : p < 0 ? 'down' : '');
  const pnl = (v: number) => (v >= 0 ? '+' : '') + Number(v).toFixed(2);
</script>

{#snippet quotesBody()}{#if !vm.rows.length}<p class="wd-empty">ยังไม่มี symbol — ตั้งค่า widget เพื่อเพิ่ม</p>{:else}<table class="wd-q"><thead><tr><th>Symbol</th><th>Bid</th><th>Ask</th><th>%</th><th></th></tr></thead><tbody>{#each vm.rows as r}<tr data-sym={r.s} onclick={() => onsym(r.s)}><td><b>{r.s}</b></td><td>{fx(r.q && r.q.bid, r.d)}</td><td>{fx(r.q && r.q.ask, r.d)}</td><td class={r.p > 0 ? 'up' : r.p < 0 ? 'down' : ''}>{r.p == null ? '—' : (r.p >= 0 ? '+' : '') + r.p.toFixed(2)}</td><td>{#if r.sp}<svg width="56" height="20" class="spark {r.sp.up ? 'up' : 'down'}"><polyline points={r.sp.pts} fill="none" stroke="currentColor" stroke-width="1.5"/></svg>{:else}<svg width="56" height="20"></svg>{/if}</td></tr>{/each}</tbody></table>{/if}{/snippet}

{#snippet positionsBody()}{#if vm.src !== 'mt5'}<p class="wd-empty">ใช้ได้เมื่อเลือก MT5 เป็นแหล่งราคา<br><small>อ่านออเดอร์ของคุณอย่างเดียว ส่งออเดอร์ไม่ได้</small></p>{:else if !vm.pos}<p class="wd-empty">รอข้อมูลบัญชีจาก EA…</p>{:else}{@const a = vm.pos.acct || {}}{@const fl = (a.equity || 0) - (a.balance || 0)}<div class="wd-acct"><span>Balance<b>{fx(a.balance, 2)}</b></span><span>Equity<b>{fx(a.equity, 2)}</b></span><span>ลอยตัว<b class={fl > 0 ? 'up' : fl < 0 ? 'down' : ''}>{pnl(fl)}</b></span></div>
        {#if vm.pos.positions.length}<table class="wd-q"><tbody>{#each vm.pos.positions as p}<tr data-sym={p.s} onclick={() => onsym(p.s)}><td><b>{p.s}</b></td><td class={p.side === 'buy' ? 'up' : 'down'}>{p.side === 'buy' ? 'Buy' : 'Sell'} {p.vol}</td><td>{p.open}</td><td class={p.profit > 0 ? 'up' : p.profit < 0 ? 'down' : ''}>{pnl(p.profit + p.swap)}</td></tr>{/each}</tbody></table>{:else}<p class="wd-empty">ไม่มีโพซิชันเปิดอยู่</p>{/if}{/if}{/snippet}

{#snippet newsBody()}{#if !vm.list.length}<p class="wd-empty">ยังไม่มีข่าว (กำลังโหลด)</p>{:else}<ul class="wd-news">{#each vm.list as n}<li><a href={n.link} target="_blank" rel="noopener">{n.title}</a><small>{n.source} · {n.ago}</small></li>{/each}</ul>{/if}{/snippet}

{#snippet calendarBody()}{#if !vm.ev.length}<p class="wd-empty">ไม่มีข่าวสำคัญที่กำลังจะมา</p>{:else}<ul class="wd-cal">{#each vm.ev as e}<li><span class="imp {String(e.impact || '').toLowerCase()}"></span><b>{e.when || ''}</b><span class="ccy">{e.ccy || ''}</span><span class="t">{e.title}</span></li>{/each}</ul>{/if}{/snippet}

{#snippet sessionsBody()}<div class="wd-clock">{vm.clock}<small>เวลาเครื่อง</small></div><ul class="wd-sess">{#each vm.sess as x}<li class={x.open ? 'open' : ''}><b>{x.n}</b><span class="bar"><i style="width:{x.pct.toFixed(0)}%"></i></span><small>{x.txt}</small></li>{/each}</ul>{/snippet}

{#snippet alertsBody()}{#if !vm.al.length}<p class="wd-empty">ยังไม่มีแจ้งเตือน — ตั้งได้ที่แท็บราคา</p>{:else}<ul class="wd-al">{#each vm.al as a}<li class={a.fired ? 'fired' : ''}><b>{a.symbol}</b><span>{a.dir === 'down' ? '≤' : '≥'} {a.price}</span><small>{a.fired ? 'แจ้งแล้ว' : 'รอ'}</small><button class="wd-ib" data-rm={a.id} title="ลบ" onclick={() => rmAlert(String(a.id))}>{@html svg(IC.x, 13)}</button></li>{/each}</ul>{/if}{/snippet}

<section class="wd wd-{w.type}" class:dragging={dash.dragId === w.id} data-id={w.id} style:grid-column="span {mobile ? 12 : w.w}" style:grid-row="span {w.h}" use:lazy><header class="wd-h">
        <span class="wd-drag" title="ลากเพื่อย้าย">{@html svg(IC.grip, 14)}</span>
        <span class="wd-ic">{@html svg(T.icon, 14)}</span>{#if w.opts.symbol}<button class="wd-sym" title="เปิดในกราฟหลัก" onclick={() => onsym(w.opts.symbol, w.opts.tf)}>{w.opts.symbol}</button><span class="wd-tf">{tfOf(w.opts.tf).label}</span><span class="wd-px">{#if head}<b>{fx(head.px, guessDigits(w.opts.symbol))}</b><span class={pctCls(head.ch)}>{head.ch == null ? '' : (head.ch >= 0 ? '+' : '') + head.ch.toFixed(2) + '%'}</span>{/if}</span>{:else}<b class="wd-name">{w.opts.title || T.name}</b>{/if}
        <span class="grow"></span>
        {#if mobile}<button class="wd-ib wd-mv" data-mv="-1" title="เลื่อนขึ้น">{@html svg(IC.up, 14)}</button><button class="wd-ib wd-mv" data-mv="1" title="เลื่อนลง">{@html svg(IC.down, 14)}</button>{/if}
        <button class="wd-ib wd-set" title="ตั้งค่า widget">{@html svg(IC.gear, 14)}</button>
        <button class="wd-ib wd-rm" title="ลบ widget">{@html svg(IC.x, 14)}</button>
      </header><div class="wd-b">{#if mounted}{#key bodyKey}{#if w.type === 'chart'}<ChartBody {w} onhead={(px, ch) => { head = { px, ch }; }} />{:else if w.type === 'bounce'}<BounceBody {w} />{:else if w.type === 'quotes'}{@render quotesBody()}{:else if w.type === 'positions'}{@render positionsBody()}{:else if w.type === 'news'}{@render newsBody()}{:else if w.type === 'calendar'}{@render calendarBody()}{:else if w.type === 'sessions'}{@render sessionsBody()}{:else if w.type === 'alerts'}{@render alertsBody()}{:else if w.type === 'notes'}<textarea class="wd-note" placeholder="แผนวันนี้: รอราคาย่อมาโซน… / ข่าว CPI 19:30 / ไม่เทรดก่อนข่าว" value={store.get('dash.note.' + w.id, '')} oninput={(e) => store.set('dash.note.' + w.id, e.currentTarget.value)}></textarea>{/if}{/key}{/if}</div>{#if !mobile}<span class="wd-rs" title="ลากเพื่อปรับขนาด">{@html svg(IC.resize, 12)}</span>{/if}</section>
