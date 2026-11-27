// see the comment below
import { def } from '../pt';
import { view } from '../state';
import { ICON } from '../app/icons';
import { $, S, TC, digits, drawings, esc, fmt, saveDrawings, store, tgt, mk } from '../app/app-core';
import { addAlert } from '../app/app-data';
import { el, yOf } from '../ui/overlay';
import { chartHooks as hook } from './hooks';
import type { DPoint, Drawing, TextAlign } from './types';

/** resolved text style (see st()) */
interface Style { size: number; color: string; bold: boolean; bg: boolean; bgOp: number; border: boolean; align: TextAlign }
interface Measure { lines: string[]; ws: number[]; w: number; lh: number }
/** a pixel position (null when off-screen / no data) */
type Px = { x: number | null; y: number | null };
type XY = { x: number; y: number };
interface Box { x: number; y: number; w: number; h: number; s: Style & { weight: number }; m: Measure }
interface EditOpts { kind?: 'text' | 'callout' | 'label'; x: number; y: number; pt?: DPoint; existing?: Drawing; target?: Drawing }

// Text on the chart (TradingView-style): multi-line styled text, callouts ("โน้ตชี้จุด"), labels on any drawing,
// a right-click / long-press menu ("บันทึกราคา"), and a free-text note per symbol ("โน้ตของฉัน").
// Loaded BEFORE draw.js: the functions here are only called at render / event time.
export const TXT = (() => {
  // ---- icons (Lucide, ISC License, https://lucide.dev/license) used only here
  const LI: Record<string, string> = {
    callout: '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M7 11h10"/><path d="M7 15h6"/><path d="M7 7h8"/>',
    'sticky-note': '<path d="M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z"/><path d="M15 3v5a1 1 0 0 0 1 1h5"/>',
    bold: '<path d="M6 12h9a4 4 0 010 8H7a1 1 0 01-1-1V5a1 1 0 011-1h7a4 4 0 010 8"/>',
    'al-left': '<path d="M21 5H3"/><path d="M15 12H3"/><path d="M17 19H3"/>',
    'al-center': '<path d="M21 5H3"/><path d="M17 12H7"/><path d="M19 19H5"/>',
    'al-right': '<path d="M21 5H3"/><path d="M21 12H9"/><path d="M21 19H7"/>',
    square: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
    bucket: '<path d="M11 7 6 2"/><path d="M18.992 12H2.041"/><path d="M21.145 18.38A3.34 3.34 0 0 1 20 16.5a3.3 3.3 0 0 1-1.145 1.88c-.575.46-.855 1.02-.855 1.595A2 2 0 0 0 20 22a2 2 0 0 0 2-2.025c0-.58-.285-1.13-.855-1.595"/><path d="m8.5 4.5 2.148-2.148a1.205 1.205 0 0 1 1.704 0l7.296 7.296a1.205 1.205 0 0 1 0 1.704l-7.592 7.592a3.615 3.615 0 0 1-5.112 0l-3.888-3.888a3.615 3.615 0 0 1 0-5.112L5.67 7.33"/>',
    type: '<path d="M12 4v16"/><path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"/><path d="M9 20h6"/>',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    trash: '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
    hline: '<path d="M3 12h18"/><path d="M7 8h6"/>',
  };
  const ic = (n: string, s = 16) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LI[n] || ''}</svg>`;
  // the drawing toolbar asks ICON.svg('callout') → serve it from here
  if (ICON && ICON.svg) { const base = ICON.svg; (ICON as { svg: (n: string, s?: number) => string }).svg = (n: string, s = 20) => (n === 'callout' ? ic('callout', s) : base(n, s)); }

  const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans Thai", "Sukhumvit Set", Tahoma, sans-serif';
  const SIZES: [string, number][] = [['S', 12], ['M', 14], ['L', 18], ['XL', 24]];
  const SWATCH = ['#ffffff', '#f5a623', '#ffeb3b', '#26a69a', '#2962ff', '#ab47bc', '#ef5350', '#000000'];
  const DEF: Style = { size: 14, color: '#ffffff', bold: false, bg: true, bgOp: 0.85, border: false, align: 'left' };
  let last: Style = { ...DEF, ...store.get('txtStyle', {}) };
  const mobile = () => document.body.classList.contains('mobile');
  const LABEL_TYPES = ['trend', 'ray', 'hline', 'vline', 'rect', 'channel', 'fib', 'fibext', 'long', 'short', 'brush', 'arrowUp', 'arrowDown'];

  // style of a drawing (old {type:'text', text, color} keeps its old look: 13px, box background)
  function st(d: Drawing): Style & { weight: number } {
    if (d.type === 'text' && d.size == null) return { size: 13, color: d.color || '#ffffff', bold: false, weight: 500, bg: true, bgOp: 1, border: false, align: 'left' };
    const callout = d.type === 'callout';
    return { size: d.size || 14, color: d.color || '#ffffff', bold: !!d.bold, weight: d.bold ? 700 : 500, bg: d.bg !== false, bgOp: d.bgOp ?? 0.85,
      border: d.border ?? callout, align: d.align || 'left' };
  }
  // text width with the real font (Thai vowels/tones included), not a per-letter guess
  const ctx = mk('canvas').getContext('2d') as CanvasRenderingContext2D, mcache = new Map<string, Measure>();
  function measure(text: string | undefined, size: number, weight: number): Measure {
    const key = size + '|' + weight + '|' + text; let m = mcache.get(key); if (m) return m;
    ctx.font = `${weight} ${size}px ${FONT}`;
    const lines = String(text || '').split('\n'), ws = lines.map((l) => ctx.measureText(l || ' ').width);
    m = { lines, ws, w: Math.max(4, ...ws), lh: Math.round(size * 1.38) };
    if (mcache.size > 400) mcache.clear(); mcache.set(key, m); return m;
  }
  const PX = 7, PY = 5;
  // box of a text drawing: for type 'text' the point is the first line's baseline-left (compatible with the old tool)
  function boxOf(d: Drawing, P: XY): Box {
    const s = st(d), m = measure(d.text, s.size, s.weight), w = m.w + PX * 2, h = m.lines.length * m.lh + PY * 2 - (m.lh - s.size * 1.2);
    if (d.type === 'callout') { const o = d.off || { dx: 24, dy: -56 }; return { x: P.x + o.dx, y: P.y + o.dy, w, h, s, m }; }
    return { x: P.x - 3, y: P.y - s.size - PY + 1, w, h, s, m };
  }
  function drawBox(d: Drawing, b: Box, sel: boolean): void {
    const { s, m } = b, col = hook.inkColor(s.color), bg = (TC().box || '#0f1115cc').slice(0, 7);
    if (s.bg || sel) el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 4, fill: s.bg ? bg : 'none', 'fill-opacity': s.bgOp,
      stroke: sel ? TC().sel : s.border ? col : 'none', 'stroke-width': sel ? 1.5 : 1, 'stroke-dasharray': sel && !s.border ? '3 2' : '' });
    else if (s.border) el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 4, fill: 'none', stroke: col });
    const ax = s.align === 'center' ? b.x + b.w / 2 : s.align === 'right' ? b.x + b.w - PX : b.x + PX, anchor = s.align === 'center' ? 'middle' : s.align === 'right' ? 'end' : 'start';
    m.lines.forEach((ln, i) => {
      const t = el('text', { x: ax, y: b.y + PY + s.size * 0.95 + i * m.lh, fill: col, 'font-size': s.size, 'font-weight': s.weight, 'text-anchor': anchor, 'font-family': FONT });
      t.textContent = ln;
    });
  }
  function renderText(d: Drawing, P: Px[], sel: boolean): void { if (P[0].x == null || P[0].y == null) return; drawBox(d, boxOf(d, P[0] as XY), sel); }
  function renderCallout(d: Drawing, P: Px[], sel: boolean): void {
    const A0 = P[0]; if (A0.x == null || A0.y == null) return; const A = A0 as XY;
    const b = boxOf(d, A), col = sel ? TC().sel : hook.inkColor(st(d).color);
    const cx = Math.max(b.x, Math.min(A.x, b.x + b.w)), cy = Math.max(b.y, Math.min(A.y, b.y + b.h));   // nearest point of the box
    if (Math.hypot(cx - A.x, cy - A.y) > 2) el('line', { x1: A.x, y1: A.y, x2: cx, y2: cy, stroke: col, 'stroke-width': 1.3 });
    el('circle', { cx: A.x, cy: A.y, r: 3.5, fill: col });
    drawBox(d, b, sel);
  }
  const inBox = (b: Box, x: number, y: number, pad = 3) => x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;
  function hit(d: Drawing, P: Px[], x: number, y: number): boolean {
    const p = P[0]; if (p.x == null || p.y == null) return false; const q = p as XY;
    if (d.type === 'callout') return inBox(boxOf(d, q), x, y) || Math.hypot(q.x - x, q.y - y) < 8;
    return inBox(boxOf(d, q), x, y);
  }
  const hitCalloutBox = (d: Drawing, P: Px[], x: number, y: number): boolean => d.type === 'callout' && P[0].x != null && P[0].y != null && inBox(boxOf(d, P[0] as XY), x, y);

  // ---- labels on other drawings
  function labelPos(d: Drawing, P: Px[], W: number, _H: number): { x: number; y: number; a: 'start' | 'middle' | 'end'; inside?: boolean } | null {
    const ok = (p?: Px): p is XY => !!p && p.x != null && p.y != null;
    const p0 = P[0] as XY, p1 = P[1] as XY;
    switch (d.type) {
      case 'trend': case 'ray': case 'channel': if (ok(P[0]) && ok(P[1])) return { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 - 8, a: 'middle' }; break;
      case 'hline': if (P[0].y != null) return { x: W - 84, y: p0.y - 7, a: 'end' }; break;
      case 'vline': if (P[0].x != null) return { x: p0.x + 6, y: 18, a: 'start' }; break;
      case 'rect': if (ok(P[0]) && ok(P[1])) return { x: Math.min(p0.x, p1.x) + 6, y: Math.min(p0.y, p1.y) + 16, a: 'start', inside: true }; break;
      case 'fib': case 'fibext': if (ok(P[0]) && ok(P[1])) return { x: Math.min(p0.x, p1.x), y: Math.min(...P.filter(ok).map((p) => p.y)) - 10, a: 'start' }; break;
      case 'long': case 'short': if (ok(P[0])) { const L = hook.posLevels ? hook.posLevels(d) : null; const ys = L ? [L.sl, L.tp].map(yOf).filter((v): v is number => v != null) : [p0.y]; return { x: p0.x + 4, y: Math.min(...ys) - 22, a: 'start' }; } break;
      case 'arrowUp': if (ok(P[0])) return { x: p0.x, y: p0.y + 40, a: 'middle' }; break;
      case 'arrowDown': if (ok(P[0])) return { x: p0.x, y: p0.y - 30, a: 'middle' }; break;
      default: if (ok(P[0])) return { x: p0.x + 6, y: p0.y - 8, a: 'start' };
    }
    return null;
  }
  function renderLabel(d: Drawing, P: Px[], W: number, H: number, sel: boolean): void {
    if (!d.label) return; const p = labelPos(d, P, W, H); if (!p) return;
    const size = 12, m = measure(d.label, size, 600), w = m.w + 10, h = m.lines.length * m.lh + 4;
    const x0 = p.a === 'middle' ? p.x - w / 2 : p.a === 'end' ? p.x - w : p.x;
    const y0 = p.y - size - 1;
    if (!p.inside) el('rect', { x: x0, y: y0, width: w, height: h, rx: 3, fill: (TC().box || '#0f1115cc').slice(0, 7), 'fill-opacity': 0.85, stroke: sel ? TC().sel : 'none' });
    m.lines.forEach((ln, i) => { const t = el('text', { x: x0 + 5, y: p.y + i * m.lh, fill: hook.inkColor(d.color || '#ffffff'), 'font-size': size, 'font-weight': 600, 'font-family': FONT }); t.textContent = ln; });
  }

  // ---- editor (text / callout / label)
  let ed: { box: HTMLElement; ta: HTMLTextAreaElement; commit: () => void; cancel: () => void; outside: (e: PointerEvent) => void } | null = null;
  function close(): void { if (ed) { ed.box.remove(); document.removeEventListener('pointerdown', ed.outside, true); ed = null; } }
  function styleBar(s: Partial<Style>, opts: { noSize?: boolean } = {}): string {
    return `<div class="txs">
      ${opts.noSize ? '' : `<div class="txs-seg" role="group" aria-label="ขนาด">${SIZES.map(([n, v]) => `<button data-sz="${v}" class="${s.size === v ? 'on' : ''}" title="ขนาด ${v}px">${n}</button>`).join('')}</div>`}
      <div class="txs-sw">${SWATCH.map((c) => `<button data-col="${c}" class="${(s.color || '').toLowerCase() === c ? 'on' : ''}" style="--c:${c}" title="${c}"></button>`).join('')}<input type="color" data-colin value="${(s.color || '#ffffff').slice(0, 7)}" title="สีอื่น"></div>
      ${opts.noSize ? '' : `<div class="txs-seg">
        <button data-tg="bold" class="${s.bold ? 'on' : ''}" title="ตัวหนา">${ic('bold')}</button>
        <button data-tg="bg" class="${s.bg ? 'on' : ''}" title="พื้นหลัง">${ic('bucket')}</button>
        <button data-tg="border" class="${s.border ? 'on' : ''}" title="กรอบ">${ic('square')}</button></div>
      <div class="txs-seg">${['left', 'center', 'right'].map((a) => `<button data-al="${a}" class="${s.align === a ? 'on' : ''}" title="${{ left: 'ชิดซ้าย', center: 'กึ่งกลาง', right: 'ชิดขวา' }[a]}">${ic('al-' + a)}</button>`).join('')}</div>
      ${s.bg ? `<label class="txs-op" title="ความทึบพื้นหลัง"><input type="range" min="0.2" max="1" step="0.05" data-op value="${s.bgOp}"></label>` : ''}`}
    </div>`;
  }
  // wire a style bar: onChange(patch)
  function wireStyle(root: Element, onChange: (patch: Partial<Style>, live?: boolean) => void): void {
    root.querySelectorAll('button').forEach((b) => b.addEventListener('mousedown', (e) => e.preventDefault()));   // keep the textarea focused
    root.querySelectorAll<HTMLElement>('[data-sz]').forEach((b) => (b.onclick = () => onChange({ size: +(b.dataset.sz as string) })));
    root.querySelectorAll<HTMLElement>('[data-col]').forEach((b) => (b.onclick = () => onChange({ color: b.dataset.col })));
    const ci = root.querySelector<HTMLInputElement>('[data-colin]'); if (ci) ci.oninput = () => onChange({ color: ci.value }, true);
    root.querySelectorAll<HTMLElement>('[data-tg]').forEach((b) => (b.onclick = () => onChange({ [b.dataset.tg as string]: !b.classList.contains('on') })));
    root.querySelectorAll<HTMLElement>('[data-al]').forEach((b) => (b.onclick = () => onChange({ align: b.dataset.al as TextAlign })));
    const op = root.querySelector<HTMLInputElement>('[data-op]'); if (op) op.oninput = () => onChange({ bgOp: +op.value }, true);
  }
  /**
   * edit({ kind: 'text'|'callout'|'label', x, y, pt, existing, target })
   *  text/callout: pt = anchor for a new one, or existing = the drawing · label: target = drawing that gets d.label
   */
  function edit(o: EditOpts): HTMLElement {
    close();
    const kind = o.kind || 'text', d = o.existing || o.target || null;
    const s: Partial<Style> = kind === 'label' ? { color: (d && d.color) || '#ffffff' } : d ? { ...st(d), ...(d.size == null ? { size: 13 } : {}) } : { ...last, ...(kind === 'callout' ? { border: true } : {}) };
    const box = mk('div'); box.className = 'txe' + (mobile() ? ' txe-sheet' : '');
    const title = ({ text: d ? 'แก้ข้อความ' : 'ข้อความ', callout: d ? 'แก้โน้ตชี้จุด' : 'โน้ตชี้จุด', label: 'ข้อความบนรูปวาด' } as Record<string, string>)[kind];
    box.innerHTML = `<div class="txe-h"><b>${ic(kind === 'callout' ? 'callout' : 'type', 15)}${title}</b><span class="muted">Ctrl/⌘+Enter บันทึก · Esc ยกเลิก</span></div>
      ${kind === 'label' ? styleBar(s, { noSize: true }) : styleBar(s)}
      <textarea rows="1" spellcheck="false" placeholder="${kind === 'callout' ? 'เช่น Entry ตรงนี้ / SL ใต้ Low' : kind === 'label' ? 'เช่น แนวต้าน H4' : 'พิมพ์ข้อความ… (Enter = ขึ้นบรรทัดใหม่)'}"></textarea>
      <div class="txe-f"><button class="txe-cancel">ยกเลิก</button><button class="txe-ok primary">บันทึก</button></div>`;
    const ta = box.querySelector('textarea') as unknown as HTMLTextAreaElement;
    ta.value = kind === 'label' ? (d && d.label) || '' : d ? d.text || '' : '';
    const host = mobile() ? document.body : $('chart-wrap');
    host.appendChild(box);
    if (!mobile()) {   // place near the click, inside the chart
      const W = host.clientWidth, H = host.clientHeight;
      box.style.left = Math.max(4, Math.min(o.x - 4, W - 340)) + 'px';
      box.style.top = Math.max(4, Math.min(o.y + 10, H - 220)) + 'px';
    }
    const preview = () => {
      ta.style.fontSize = (kind === 'label' ? 13 : s.size) + 'px'; ta.style.fontWeight = s.bold ? '700' : '500';
      ta.style.color = hook.inkColor(s.color); ta.style.textAlign = s.align || 'left';
      ta.style.height = 'auto'; ta.style.height = Math.min(260, ta.scrollHeight + 2) + 'px';
    };
    const restyle = (patch: Partial<Style>, live?: boolean): void => {
      Object.assign(s, patch);
      if (!live) { const bar = box.querySelector('.txs') as Element; bar.outerHTML = kind === 'label' ? styleBar(s, { noSize: true }) : styleBar(s); wireStyle(box.querySelector('.txs') as Element, restyle); }
      preview(); ta.focus();
    };
    wireStyle(box.querySelector('.txs') as Element, restyle);
    ta.addEventListener('input', preview);
    const commit = () => {
      if (!ed) return; const v = ta.value.replace(/\s+$/, ''); close();
      const keep: Partial<Style> = { size: s.size, color: s.color, bold: !!s.bold, bg: !!s.bg, bgOp: s.bgOp, border: !!s.border, align: s.align };
      if (kind === 'label') {
        if (!d) return; hook.pushHistory(); if (v.trim()) d.label = v.slice(0, 300); else delete d.label;
        if (s.color && s.color !== d.color) d.color = s.color;
      } else if (d) {
        hook.pushHistory();
        if (v.trim()) { d.text = v.slice(0, 2000); Object.assign(d, keep); } else drawings.splice(drawings.indexOf(d), 1);
      } else if (v.trim()) {
        hook.pushHistory();
        const nd: Drawing = { id: hook.uid(), type: kind as 'text' | 'callout', pts: [o.pt as DPoint], text: v.slice(0, 2000), ...(keep as Partial<Drawing>) };
        if (kind === 'callout') nd.off = { dx: 24, dy: -Math.round(56 + ((s.size as number) - 14) * 1.5) };
        drawings.push(nd);
      }
      if (kind !== 'label') { last = { ...last, ...keep }; if (kind === 'callout') last.border = DEF.border; store.set('txtStyle', last); }
      S.selected = null; saveDrawings(); hook.renderLayers(); view.dirty = true; hook.setTool('cursor');
    };
    const cancel = () => { close(); hook.setTool('cursor'); view.dirty = true; };
    ta.addEventListener('keydown', (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    (box.querySelector('.txe-ok') as HTMLElement).onclick = commit; (box.querySelector('.txe-cancel') as HTMLElement).onclick = cancel;
    box.addEventListener('pointerdown', (e) => e.stopPropagation());
    const outside = (e: PointerEvent) => { if (ed && !box.contains(tgt(e) as Node)) commit(); };
    ed = { box, ta, commit, cancel, outside };
    setTimeout(() => { if (ed && ed.box === box) document.addEventListener('pointerdown', outside, true); }, 0);
    preview(); setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 0);
    return box;
  }

  // ---- floating toolbar for the selected drawing
  const bar = mk('div'); bar.className = 'txt-bar hidden';
  let barFor: Drawing | null = null, barKey = '';
  function applyTo(d: Drawing, patch: Partial<Style>): void {
    hook.pushHistory(); Object.assign(d, patch);
    if (d.type === 'text' && d.size == null) d.size = 13;   // first restyle of an old text: keep its size
    if (d.type === 'text' || d.type === 'callout') { last = { ...last, ...patch }; store.set('txtStyle', last); }
    saveDrawings(); view.dirty = true; barKey = '';
  }
  function buildBar(d: Drawing, i: number): void {
    const isText = d.type === 'text' || d.type === 'callout';
    const s: Partial<Style> = isText ? st(d) : { color: d.color || '#2962ff' };
    bar.innerHTML = `${isText ? `<button data-b="edit" title="แก้ข้อความ (ดับเบิลคลิก)">${ic('pencil')}<span>แก้ไข</span></button>${styleBar(s)}`
      : `<button data-b="label" title="ข้อความบนรูปวาด">${ic('type')}<span>${d.label ? 'แก้ข้อความ' : 'เพิ่มข้อความ'}</span></button>${styleBar(s, { noSize: true })}`}
      <button data-b="del" class="txb-del" title="ลบ (Delete)">${ic('trash')}</button>`;
    wireStyle(bar, (patch) => { if (!S.locked) applyTo(d, patch); });
    (bar.querySelector('[data-b=del]') as HTMLElement).onclick = () => { if (S.locked) return; hook.pushHistory(); drawings.splice(i, 1); S.selected = null; saveDrawings(); hook.renderLayers(); view.dirty = true; };
    const e = bar.querySelector<HTMLElement>('[data-b=edit]'); if (e) e.onclick = () => openEditor(i);
    const l = bar.querySelector<HTMLElement>('[data-b=label]'); if (l) l.onclick = () => openEditor(i, true);
  }
  function openEditor(i: number, asLabel?: boolean): void {
    const d = drawings[i]; if (!d) return;
    const P: Px = { x: hook.xOfT(d.pts[0].time), y: yOf(d.pts[0].price) };
    if (d.type === 'hline') P.x = $('chart').clientWidth - 360;
    if (d.type === 'text' || d.type === 'callout') { const b = boxOf(d, P as XY); edit({ kind: d.type, existing: d, x: b.x, y: b.y + b.h }); }
    else if (asLabel || LABEL_TYPES.includes(d.type)) edit({ kind: 'label', target: d, x: P.x ?? 40, y: P.y ?? 40 });
  }
  function sync(): void {
    const i: number | null = S.selected, d = i != null ? drawings[i] : null;
    const show = d && S.tool === 'cursor' && !ed && !S.hidden && (d.type === 'text' || d.type === 'callout' || LABEL_TYPES.includes(d.type));
    if (!show || i == null) { if (!bar.classList.contains('hidden')) bar.classList.add('hidden'); barFor = null; return; }
    const key = i + '|' + JSON.stringify([d.size, d.color, d.bold, d.bg, d.border, d.align, d.bgOp, !!d.label]);
    if (bar.parentElement !== (mobile() ? document.body : $('chart-wrap'))) (mobile() ? document.body : $('chart-wrap')).appendChild(bar);
    if (barFor !== d || key !== barKey) { buildBar(d, i); barFor = d; barKey = key; }
    bar.classList.remove('hidden');
    if (!mobile()) {
      let x: number, y: number;
      if (d.type === 'text' || d.type === 'callout') { const P = { x: hook.xOfT(d.pts[0].time), y: yOf(d.pts[0].price) }; if (P.x == null || P.y == null) return; const b = boxOf(d, P as XY); x = b.x; y = b.y; }
      else { const hs = hook.handles(d); if (!hs.length) return; x = Math.min(...hs.map((h) => h.x)); y = Math.min(...hs.map((h) => h.y)); }
      // like TradingView: the toolbar floats at the top of the chart (never on top of the drawing itself);
      // it drops below the selection only when the drawing reaches the top edge
      const W = $('chart-wrap').clientWidth, bw = bar.offsetWidth || 420, bh = bar.offsetHeight || 36;
      let yb = y;
      if (d.type === 'text' || d.type === 'callout') { const P = { x: hook.xOfT(d.pts[0].time), y: yOf(d.pts[0].price) }; const b = boxOf(d, P as XY); yb = b.y + b.h; }
      else { const hs = hook.handles(d); yb = Math.max(...hs.map((h) => h.y)); }
      bar.style.left = Math.max(4, Math.min(x, W - bw - 70)) + 'px';
      bar.style.top = (y > bh + 44 ? 34 : Math.min(yb + 12, $('chart-wrap').clientHeight - bh - 40)) + 'px';
    }
  }

  // ---- right-click / long-press menu: "บันทึกราคา"
  const menu = mk('div'); menu.className = 'ctx-menu hidden';
  function closeMenu(): void { menu.classList.add('hidden'); }
  function openMenu(cx: number, cy: number, x: number, y: number): void {
    const p = hook.pointAt(x, y, false); if (!p) return;
    const pt = { time: p.time, price: p.price };
    menu.innerHTML = `<div class="ctx-h">${fmt(p.price)}</div>
      <button data-c="text">${ic('type')}เพิ่มข้อความตรงนี้</button>
      <button data-c="callout">${ic('callout')}เพิ่มโน้ตชี้จุดตรงนี้</button>
      <button data-c="hline">${ic('hline')}เพิ่มเส้นราคา + ข้อความ</button>
      <button data-c="alert">${ic('bell')}ตั้งแจ้งเตือนที่ราคานี้</button>
      <div class="ctx-sep"></div>
      <button data-c="notes">${ic('sticky-note')}โน้ตของฉัน (${esc(S.symbol)})</button>`;
    document.body.appendChild(menu); menu.classList.remove('hidden');
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.min(cx, innerWidth - mw - 6) + 'px'; menu.style.top = Math.min(cy, innerHeight - mh - 6) + 'px';
    menu.querySelectorAll<HTMLElement>('[data-c]').forEach((b) => (b.onclick = (e) => {
      e.stopPropagation(); closeMenu();
      const c = b.dataset.c;
      if (c === 'text') edit({ kind: 'text', pt, x, y });
      else if (c === 'callout') edit({ kind: 'callout', pt, x, y });
      else if (c === 'hline') {
        hook.pushHistory(); const d: Drawing = { id: hook.uid(), type: 'hline', pts: [{ time: 0, price: p.price }], color: '#f5a623' };
        drawings.push(d); saveDrawings(); hook.renderLayers(); view.dirty = true;
        edit({ kind: 'label', target: d, x: Math.max(20, $('chart').clientWidth - 380), y });
      } else if (c === 'alert') addAlert(+p.price.toFixed(digits()));
      else if (c === 'notes') NOTES.open();
    }));
  }
  document.addEventListener('pointerdown', (e) => { if (!menu.classList.contains('hidden') && !menu.contains(tgt(e) as Node)) closeMenu(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  function wireChart(): void {
    const wrap = $('chart-wrap');
    const skip = (t: EventTarget | null) => (t as Element).closest('#legend, #zoombar, #layers-pop, .txe, .txt-bar, #connect, #m-draw, #m-pill');
    wrap.addEventListener('contextmenu', (e: MouseEvent) => {
      if (skip(tgt(e)) || !S.candles || !S.candles.length) return;
      e.preventDefault(); const { x, y } = hook.mousePos(e); openMenu(e.clientX, e.clientY, x, y);
    });
    // phone: long-press on empty chart area
    let lp: { x: number; y: number; t: ReturnType<typeof setTimeout> } | null = null;
    wrap.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || S.tool !== 'cursor' || skip(tgt(e))) return;
      const { x, y } = hook.mousePos(e); if (hook.hitTest(x, y) != null) return;
      lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { lp = null; openMenu(e.clientX, e.clientY, x, y); if (navigator.vibrate) navigator.vibrate(12); }, 550) };
    }, true);
    const cancelLp = (e?: PointerEvent) => { if (lp && (!e || e.type !== 'pointermove' || Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 8)) { clearTimeout(lp.t); lp = null; } };
    window.addEventListener('pointermove', cancelLp); window.addEventListener('pointerup', () => cancelLp()); window.addEventListener('pointercancel', () => cancelLp());
  }

  // ---- notes per symbol ("โน้ตของฉัน")
  const NOTES = (() => {
    const key = (s: string) => 'note.' + String(s || '').toUpperCase();
    const get = (s: string = S.symbol): { text: string; at: number } | null => store.get(key(s), null);
    let pop: HTMLElement | null = null, sym = '', tmr: ReturnType<typeof setTimeout> | undefined;
    const popEl = () => pop as HTMLElement;
    const when = (t: number) => new Date(t).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    function render(): void {
      const pop = popEl(); sym = S.symbol; const n = get(sym);
      pop.innerHTML = `<div class="nt-h"><b>${ic('sticky-note')}โน้ตของฉัน · ${esc(sym)}</b><button class="ib nt-x" aria-label="ปิด">×</button></div>
        <textarea spellcheck="false" placeholder="จดแผน แนวรับแนวต้าน เหตุผลที่เข้า/ไม่เข้า… (บันทึกอัตโนมัติ แยกตาม symbol)"></textarea>
        <div class="nt-f"><span class="nt-at">${n && n.at ? 'บันทึกล่าสุด ' + when(n.at) : 'ยังไม่มีโน้ตของ ' + esc(sym)}</span><button class="nt-stamp" title="แทรกวันเวลา">+ เวลา</button></div>`;
      const ta = pop.querySelector('textarea') as HTMLTextAreaElement; ta.value = n ? n.text : '';
      ta.addEventListener('keydown', (e) => e.stopPropagation());
      ta.oninput = () => { clearTimeout(tmr); tmr = setTimeout(() => save(ta.value), 400); };
      (pop.querySelector('.nt-x') as HTMLElement).onclick = close;
      (pop.querySelector('.nt-stamp') as HTMLElement).onclick = () => { const s = `[${when(Date.now())}] `; const p = ta.selectionStart; ta.value = ta.value.slice(0, p) + (p && ta.value[p - 1] !== '\n' ? '\n' : '') + s + ta.value.slice(p); ta.focus(); save(ta.value); };
    }
    function save(text: string): void {
      const k = key(sym);
      if (text.trim()) store.set(k, { text, at: Date.now() }); else { try { localStorage.removeItem(k); } catch (_: any) {} }
      const at = pop && pop.querySelector('.nt-at'); if (at) at.textContent = text.trim() ? 'บันทึกล่าสุด ' + when(Date.now()) : 'ยังไม่มีโน้ตของ ' + sym;
      badge();
    }
    function open(): void {
      if (!pop) { pop = mk('div'); pop.id = 'notes-pop'; pop.className = 'notes-pop'; pop.addEventListener('pointerdown', (e) => e.stopPropagation()); }
      const p = pop; (mobile() ? document.body : $('chart-wrap')).appendChild(p);
      p.classList.toggle('np-sheet', mobile());
      render(); p.classList.remove('hidden'); setTimeout(() => (p.querySelector('textarea') as HTMLTextAreaElement).focus(), 0);
    }
    function close(): void { if (pop) { const ta = pop.querySelector('textarea'); if (ta) { clearTimeout(tmr); save(ta.value); } pop.classList.add('hidden'); } }
    const isOpen = () => !!pop && !pop.classList.contains('hidden');
    function badge(): void { const b = $('notes-btn'); if (b) b.classList.toggle('has', !!get()); }
    function toggle(): void { if (isOpen()) close(); else open(); }
    // follow symbol switches
    setInterval(() => { if (isOpen() && S.symbol !== sym) { close(); open(); } badge(); }, 700);
    document.addEventListener('pointerdown', (e) => { if (isOpen() && !(tgt(e) as Element).closest('#notes-pop, #notes-btn, .ctx-menu')) close(); });
    return { open, close, toggle, get, isOpen };
  })();
  function addNotesButton(): void {
    const end = $('tb-end'); if (!end || $('notes-btn')) return;
    const b = mk('button'); b.id = 'notes-btn'; b.className = 'ib'; b.title = 'โน้ตของฉัน (แยกตาม symbol)';
    b.innerHTML = ic('sticky-note', 18); b.onclick = (e: MouseEvent) => { e.stopPropagation(); NOTES.toggle(); };
    end.insertBefore(b, end.firstChild);
  }

  function init(): void { wireChart(); addNotesButton(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else setTimeout(init, 0);

  return { st, measure, boxOf, renderText, renderCallout, renderLabel, hit, hitCalloutBox, edit, close, isEditing: () => !!ed, sync, openEditor,
    openMenu, LABEL_TYPES, NOTES, last: () => ({ ...last }) };
})();

def({ TXT: [() => TXT] });
