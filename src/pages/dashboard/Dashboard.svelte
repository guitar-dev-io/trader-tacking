<script lang="ts">
  // Dashboard page: top bar (layouts, add, edit), the widget grid (drag to reorder, corner to resize), the widget
  // catalog and the settings popover.
  import { flushSync } from 'svelte';
  import Widget from './Widget.svelte';
  import Pop from './Pop.svelte';
  import { IC, svg } from './icons';
  import { dash, mobile, TYPES, PRESETS, W12, layout, save, uid } from './model.svelte';

  let { rootEl, onclose, onsym, onadd, onrm, ondup, onmove }: {
    rootEl: HTMLElement; onclose: () => void; onsym: (sym: string, tf?: number) => void;
    onadd: (type: string) => void; onrm: (id: string) => void; ondup: (id: string) => void; onmove: (id: string, dir: number) => void;
  } = $props();

  let grid: HTMLElement;
  let nameIn: HTMLInputElement | undefined = $state();
  const names = $derived(Object.keys(dash.cfg.layouts));

  // ------------------------------------------------------------ layouts
  function pick(e: Event) {
    const sel = e.currentTarget as HTMLSelectElement, v = sel.value;
    if (v === '__new') { sel.value = dash.cfg.cur; askName(); return; }   // window.prompt() does not exist in the desktop app: ask inline
    else if (v === '__del') { if (confirm(`ลบชุด "${dash.cfg.cur}"?`)) { delete dash.cfg.layouts[dash.cfg.cur]; dash.cfg.cur = Object.keys(dash.cfg.layouts)[0]; } }
    else if (v.startsWith('__p:')) { const n = v.slice(4); dash.cfg.layouts[n] = PRESETS[n](); dash.cfg.cur = n; }
    else dash.cfg.cur = v;
    save(); flushSync(); sel.value = dash.cfg.cur;
  }
  // a native listener: change events created by code (new Event('change')) do not bubble, so Svelte's delegated
  // onchange would miss them
  function onChange(node: HTMLSelectElement) { node.addEventListener('change', pick); return { destroy() { node.removeEventListener('change', pick); } }; }
  function askName() { dash.naming = true; flushSync(); nameIn?.focus(); nameIn?.select(); }
  function saveName(e: SubmitEvent) {
    e.preventDefault(); const n = nameIn!.value.trim(); if (!n) { nameIn!.focus(); return; }
    dash.cfg.layouts[n] = layout().map((x) => ({ ...x, id: uid(), opts: { ...x.opts } })); dash.cfg.cur = n; dash.naming = false; save();
  }

  // the page root carries the edit-mode class (CSS: .dash.editing …)
  $effect(() => { rootEl.classList.toggle('editing', dash.editing); });

  // ------------------------------------------------------------ settings popover
  function openPop(id: string, b: HTMLElement) { dash.pop = { id, anchor: b.getBoundingClientRect() }; }
  function closePop() { dash.pop = null; }
  $effect(() => {
    const down = (e: PointerEvent) => { const t = e.target as HTMLElement; if (dash.pop && !t.closest('.wd-pop') && !t.closest('.wd-set')) closePop(); };
    document.addEventListener('pointerdown', down);
    return () => document.removeEventListener('pointerdown', down);
  });
  function gridClick(e: MouseEvent) {
    const b = (e.target as HTMLElement).closest('button'); if (!b) return;
    const wd = b.closest<HTMLElement>('.wd'); if (!wd) return;
    if (b.classList.contains('wd-rm')) onrm(wd.dataset.id!);
    else if (b.classList.contains('wd-set')) openPop(wd.dataset.id!, b);
    else if (b.dataset.mv) onmove(wd.dataset.id!, +b.dataset.mv);
  }

  // ------------------------------------------------------------ drag to reorder, drag corner to resize (pointer events)
  type Drag = { mode: 'move'; el: HTMLElement; id: string; dx: number; dy: number } | { mode: 'resize'; el: HTMLElement; w: any; x: number; y: number; w0: number; h0: number; colPx: number; rowPx: number };
  let drag: Drag | null = null;
  function down(e: PointerEvent) {
    const t = e.target as HTMLElement, h = t.closest('.wd-drag'), rs = t.closest('.wd-rs');
    if (!h && !rs) return;
    const el = t.closest<HTMLElement>('.wd'); if (!el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    if (rs) {
      const w = layout().find((x) => x.id === el.dataset.id), gs = getComputedStyle(grid);
      const colPx = (grid.clientWidth - parseFloat(gs.columnGap || '0') * 11) / 12, rowPx = parseFloat(gs.gridAutoRows) || 150;
      drag = { mode: 'resize', el, w, x: e.clientX, y: e.clientY, w0: r.width, h0: r.height, colPx, rowPx };
    } else {
      dash.dragId = el.dataset.id!; rootEl.classList.add('is-dragging');
      drag = { mode: 'move', el, id: el.dataset.id!, dx: e.clientX - r.left, dy: e.clientY - r.top };
      el.style.width = r.width + 'px';
    }
    try { t.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events */ }
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    if (drag.mode === 'resize') {
      const d = drag, want = (d.w0 + e.clientX - d.x) / d.colPx, cols = W12.reduce((b, v) => (Math.abs(v - want) < Math.abs(b - want) ? v : b), 12);
      const rows = Math.max(1, Math.min(3, Math.round((d.h0 + e.clientY - d.y) / d.rowPx)));
      if (cols !== d.w.w || rows !== d.w.h) { d.w.w = cols; d.w.h = rows; }
      return;
    }
    const d = drag, el = d.el;
    // where would it go? the widget under the pointer (ignoring the dragged one) — the layout order changes live
    el.style.pointerEvents = 'none';
    const under = document.elementFromPoint(e.clientX, e.clientY), tgt = under && under.closest<HTMLElement>('.dash-grid .wd');
    el.style.pointerEvents = '';
    if (tgt && tgt !== el) {
      const tr = tgt.getBoundingClientRect(), after = e.clientY > tr.bottom - tr.height / 3 || (e.clientX > tr.left + tr.width / 2 && e.clientY > tr.top + tr.height / 3);
      const L = layout(), from = L.findIndex((x) => x.id === d.id), ti = L.findIndex((x) => x.id === tgt.dataset.id);
      let to = after ? ti + 1 : ti; if (from < to) to--;
      if (from >= 0 && ti >= 0 && to !== from) { const [it] = L.splice(from, 1); L.splice(to, 0, it); flushSync(); }
    }
    const nr = el.getBoundingClientRect(), tx = el.style.transform.match(/-?[\d.]+/g) || [0, 0];
    const bx = nr.left - +tx[0], by = nr.top - +tx[1];
    el.style.transform = `translate(${e.clientX - d.dx - bx}px, ${e.clientY - d.dy - by}px)`;
  }
  function end() {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.mode === 'move') { dash.dragId = null; rootEl.classList.remove('is-dragging'); d.el.style.transform = ''; d.el.style.width = ''; }
    save();
  }
</script>

<svelte:window onpointermove={move} onpointerup={end} onpointercancel={end} />

<div class="dash-top">
      {#if mobile}<button class="wd-ib dash-back" title="กลับ" onclick={onclose}>{@html svg(IC.back, 20)}</button>{/if}
      <b class="dash-title">{@html svg(IC.grid, 18)}แดชบอร์ด</b>
      <select class="dash-layout" class:hidden={dash.naming} title="ชุดเลย์เอาต์" value={dash.cfg.cur} use:onChange>{#each names as n}<option value={n}>{n}</option>{/each}<option disabled>──────</option><option value="__new">+ บันทึกเป็นชุดใหม่…</option>{#each Object.keys(PRESETS) as n}<option value="__p:{n}">ชุดสำเร็จรูป: {n}</option>{/each}{#if names.length > 1}<option value="__del">ลบชุดนี้</option>{/if}</select>{#if dash.naming}<form class="dash-newname" onsubmit={saveName}><input maxlength="40" placeholder="ชื่อชุดเลย์เอาต์ใหม่" value="ชุดของฉัน" bind:this={nameIn} onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Escape') dash.naming = false; }}><button class="primary">บันทึก</button><button type="button" data-x onclick={() => { dash.naming = false; }}>ยกเลิก</button></form>{/if}
      <span class="grow"></span>
      <button class="dash-btn dash-add" onclick={() => { dash.catOpen = !dash.catOpen; }}>{@html svg(IC.plus)}<span>เพิ่ม widget</span></button>
      <button class="dash-btn dash-edit" class:on={dash.editing} onclick={() => { dash.editing = !dash.editing; if (!dash.editing) dash.catOpen = false; }}>{#if dash.editing}{@html svg(IC.check)}<span>เสร็จ</span>{:else}{@html svg(IC.pencil)}<span>แก้ไขเลย์เอาต์</span>{/if}</button>
    </div>
    <div class="dash-main"><!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions --><div class="dash-grid" bind:this={grid} onpointerdown={down} onclick={gridClick}>{#each layout() as w (w.id)}<Widget {w} {onsym} />{:else}<div class="dash-empty">{@html svg(IC.grid, 40)}<b>ยังไม่มี widget</b><p>กด "เพิ่ม widget" เพื่อเลือกกราฟ ราคา ข่าว และอื่น ๆ</p><button class="dash-btn primary dash-add2" onclick={() => { dash.catOpen = !dash.catOpen; }}>{@html svg(IC.plus)}<span>เพิ่ม widget</span></button></div>{/each}</div>
      <aside class="dash-cat" class:hidden={!dash.catOpen}><div class="cat-h"><b>เพิ่ม widget</b><button class="wd-ib cat-x" title="ปิด" onclick={() => { dash.catOpen = false; }}>{@html svg(IC.x)}</button></div><div class="cat-list">{#each Object.entries(TYPES) as [k, t]}<button class="cat-item" data-add={k} onclick={() => { onadd(k); if (mobile) dash.catOpen = false; }}>
      <span class="cat-prev cat-prev-{k}">{@html svg(t.icon, 22)}</span><span class="cat-t"><b>{t.name}</b><small>{t.desc}</small></span><span class="cat-plus">{@html svg(IC.plus, 16)}</span></button>{/each}</div></aside></div>
    {#if dash.pop}<Pop id={dash.pop.id} anchor={dash.pop.anchor} {rootEl} onclose={closePop} {ondup} {onrm} />{:else}<div class="wd-pop hidden"></div>{/if}
