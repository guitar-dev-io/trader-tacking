import { onBack } from '../../ui/back';
// Learning center page (Svelte). Desktop: a page tab (pages.ts) with a titlebar button and Ctrl/⌘+L.
// Phone: a full-screen page with list → reader → back.
import { mount, flushSync } from 'svelte';
import { def } from '../../pt';
import { ui } from '../../ui/registry';
import { toast } from '../../ui/toast';
import { S, store } from '../../state';
import { pages, lazyMount, type PageApi } from '../registry';
import { ICON } from '../../app/icons';
import { $ } from '../../app/app-core';
import { MM_LEARN } from '../../app/mm-learn';
import { QUIZ, REPLAY } from '../../app/learn';
import { PAGES } from '../../app/pages';
import LearnCenter from './LearnCenter.svelte';
import { lc, all, byId, cats, read, openCats, progress, mark, setView, saveCats } from './model.svelte';

export const LEARN: PageApi = (() => {
  const mobile = document.body.classList.contains('mobile');
  const root = document.createElement('div'); root.id = 'learn-center'; root.className = 'lc' + (mobile ? ' m-full hidden' : '');
  const refs: { main?: HTMLElement; doc?: HTMLElement; q?: HTMLInputElement; nav?: HTMLElement } = {};
  const scrolls: Record<string, number> = store.get('lc.scroll', {});
  let shownView: string | null = null;            // the view whose scroll position main.scrollTop belongs to

  const back = () => { lc.mListMode = true; flushSync(); root.classList.remove('m-reading'); };
  // the component mounts on first idle / first use (see lazyMount); everything that needs its DOM goes in here
  const ensure = lazyMount(() => {
    mount(LearnCenter, { target: root, props: { mobile, refs, onclose: () => close(), onback: back } });
    flushSync();                                 // refs (bind:this) are set now
    const q = refs.q!;
    q.addEventListener('input', () => { lc.term = q.value.trim().toLowerCase(); flushSync(); });
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const f = refs.nav!.querySelector<HTMLElement>('.lc-les'); if (f) { lc.mListMode = false; go(f.dataset.v!, { reader: true }); } }
      if (e.key === 'Escape') { q.value = ''; lc.term = ''; flushSync(); q.blur(); }
    });
    render();
  });

  // after a render: mount the MM widgets, restore the scroll position, keep the current nav item in view
  function render() {
    ensure();
    if (shownView && refs.main) scrolls[shownView] = refs.main.scrollTop;
    flushSync();
    if (refs.nav && !mobile) { const on = refs.nav.querySelector('.lc-item.on'); if (on) on.scrollIntoView({ block: 'nearest' }); }
    if (refs.doc && MM_LEARN) MM_LEARN.mount(refs.doc);
    shownView = lc.view;
    if (refs.main) refs.main.scrollTop = (byId.has(lc.view) && scrolls[lc.view]) || 0;
    store.set('lc.scroll', Object.fromEntries(Object.entries(scrolls).slice(-60)));
    root.classList.toggle('m-reading', mobile && !lc.mListMode);
  }
  function go(v: string, opts: { reader?: boolean; keepFocus?: boolean } = {}) {
    if (!v) return;
    setView(v);
    if (mobile && opts.reader) lc.mListMode = false;
    render();
    if (!opts.keepFocus && document.activeElement === refs.q && !mobile) refs.q!.blur();
  }

  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button'); if (!b || !root.contains(b)) return;
    const d = b.dataset;
    if (d.catT) { const c = d.catT; if (openCats.has(c)) openCats.delete(c); else openCats.add(c); saveCats(); flushSync(); return; }
    if (d.mark) { const id = d.mark; mark(id, !read.has(id)); render(); toast(read.has(id) ? 'บันทึกว่าอ่านแล้ว' : 'ยกเลิกเครื่องหมายอ่านแล้ว', 'ok', 1800); return; }
    if (d.replay) { startReplay(d.replay); return; }
    if (d.readnext) mark(d.readnext, true);
    if (d.v) go(d.v, { reader: true });
  });
  const visible = () => (mobile ? !root.classList.contains('hidden') : PAGES.active() === 'learn');
  document.addEventListener('keydown', (e) => {
    if (!visible() || e.metaKey || e.ctrlKey || e.altKey) return;
    const typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement).tagName);
    if (e.key === '/' && !typing && refs.q) { e.preventDefault(); refs.q.focus(); refs.q.select(); return; }
    if (typing) return;
    const l = byId.get(lc.view); if (!l) return;
    const i = all.indexOf(l);
    if (e.key === 'ArrowRight' && all[i + 1]) { e.preventDefault(); mark(l.id, true); go(all[i + 1].id); }
    if (e.key === 'ArrowLeft' && all[i - 1]) { e.preventDefault(); go(all[i - 1].id); }
  }, true);

  function startReplay(kind: string) {
    close(true);
    const t = document.querySelector<HTMLElement>('#tabs [data-tab="practice"]'); if (t) t.click();
    setTimeout(() => { if (typeof QUIZ !== 'undefined') { if (kind === 'quiz') QUIZ.start(); else if (typeof REPLAY !== 'undefined') REPLAY.pick(); } }, 150);
  }

  // ------------------------------------------------------------ open / close
  function open(v?: string) {
    if (v) { lc.view = v; store.set('lc.view', v); if (byId.has(v)) store.set('lc.last', v); }
    if (mobile) { lc.mListMode = !v || v === 'home'; root.classList.remove('hidden'); document.body.classList.add('lc-open'); render(); return; }
    PAGES.open('learn'); render();
  }
  function close(toChart?: boolean) {
    if (mobile) { root.classList.add('hidden'); document.body.classList.remove('lc-open'); return; }
    if (toChart || PAGES.active() === 'learn') PAGES.activate('chart');
  }
  if (mobile) {
    // the Android back button: reader → list → close
    document.body.appendChild(root);
    onBack(() => { if (!root.classList.contains('hidden')) { if (!lc.mListMode) back(); else close(); return true; } return false; });
  } else {
    const inner = (n: string) => (ICON.svg(n, 14) || '').replace(/^<svg[^>]*>|<\/svg>$/g, '');
    const btn = document.createElement('button');
    btn.id = 'learn-btn'; btn.className = 'ib tb-learn'; btn.title = 'ศูนย์การเรียนรู้ — บทเรียนและแบบฝึก (Ctrl/⌘ + L)';
    btn.innerHTML = `${ICON.html('graduation-cap', 16)}<span>เรียนรู้</span>`;
    btn.onclick = () => (PAGES.active() === 'learn' ? close() : open());
    const anchor = $('dash-btn') || $('theme-btn'); if (anchor) anchor.before(btn);
    window.addEventListener('pagechange', (e) => { const k = (e as CustomEvent).detail; btn.classList.toggle('on', k === 'learn'); if (k === 'learn') render(); });
    PAGES.register('learn', 'เรียนรู้', root, inner('graduation-cap'));
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'l' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement).tagName)) { e.preventDefault(); btn.click(); }
    });
  }
  // reading pages (learn, news) get the full width: fold the side panel while one is shown, restore it afterwards
  if (!mobile) {
    let sideWas: boolean | null = null;
    window.addEventListener('pagechange', (e) => {
      const k = (e as CustomEvent).detail, reading = k === 'learn' || k === 'news';
      if (!ui.setUI || !S.ui) return;
      if (reading && sideWas === null) { sideWas = !!S.ui.side; if (sideWas) ui.setUI('side', false); }
      else if (k === 'chart' && sideWas !== null) { if (sideWas) ui.setUI('side', true); sideWas = null; }
    });
  }
  return {
    open, close, go: (v: string) => open(v), render,
    lessons: () => all.map((l) => ({ id: l.id, cat: l.c, title: l.title, read: read.has(l.id) })),
    progress, view: () => lc.view, isOpen: visible, cats: () => cats.map((c) => c.id),
    find: (text: string) => all.find((l) => l.q.includes(String(text).toLowerCase())),
  };
})();
pages.learn = LEARN;
def({ LEARN: [() => LEARN] });
