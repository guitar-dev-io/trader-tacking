// "ข่าวและปฏิทิน" page (Svelte). Desktop: a page tab with a titlebar button + unread badge.
// Phone: a full-screen page from the More page. The ราคา tab keeps a small "ข่าวล่าสุด" teaser.
import { mount } from 'svelte';
import { PT, def } from '../../pt';
import { pages, type PageApi } from '../registry';
import { ICON } from '../../../icons.js';
import { $ } from '../../../app-core.js';
import { HEADLINES } from '../../../news.js';
import { PAGES } from '../../../pages.js';
import NewsPage from './NewsPage.svelte';
import NewsTeaser from './NewsTeaser.svelte';

export const NEWSPAGE: PageApi = (() => {
  const mobile = document.body.classList.contains('mobile');
  // the old side tab's feed element moves into the page
  const oldTab = $('tab-news'), feed: HTMLElement = $('newsfeed') || Object.assign(document.createElement('div'), { id: 'newsfeed' });
  const root = document.createElement('div'); root.id = 'news-page'; root.className = 'np' + (mobile ? ' m-full hidden' : '');
  const view = mount(NewsPage, { target: root, props: { mobile, feed, onclose: () => close() } }) as unknown as { refresh(): void };
  if (oldTab) oldTab.remove();

  // ---- teaser in the ราคา tab
  let teaserView: { refresh(): void } | null = null;
  function teaser() {
    if (!teaserView) {
      const host = $('tab-market'); if (!host) return;
      const el = document.createElement('div'); el.id = 'news-teaser'; el.className = 'panel';
      const after = $('positions-panel'); if (after) after.after(el); else host.appendChild(el);
      teaserView = mount(NewsTeaser, { target: el, props: { onall: () => open() } }) as unknown as { refresh(): void };
    } else teaserView.refresh();
  }

  function render() { HEADLINES.render(); view.refresh(); }
  const visible = () => (mobile ? !root.classList.contains('hidden') : PAGES.active() === 'news');
  function open() {
    if (mobile) { root.classList.remove('hidden'); document.body.classList.add('np-open'); }
    else PAGES.open('news');
    HEADLINES.show(); view.refresh();
  }
  function close() {
    if (mobile) { root.classList.add('hidden'); document.body.classList.remove('np-open'); return; }
    if (PAGES.active() === 'news') PAGES.activate('chart');
  }
  if (mobile) {
    document.body.appendChild(root);
    const prevBack = PT.__mobileBack;
    PT.__mobileBack = () => { if (!root.classList.contains('hidden')) { close(); return true; } return prevBack ? prevBack() : false; };
  } else {
    const inner = (n: string) => (ICON.svg(n, 14) || '').replace(/^<svg[^>]*>|<\/svg>$/g, '');
    const btn = document.createElement('button');
    btn.id = 'news-btn'; btn.className = 'ib tb-news'; btn.title = 'ข่าวและปฏิทินเศรษฐกิจ';
    btn.innerHTML = `${ICON.html('newspaper', 16)}<span id="news-badge"></span>`;
    btn.onclick = () => (visible() ? close() : open());
    const anchor = $('learn-btn') || $('dash-btn') || $('theme-btn'); if (anchor) anchor.before(btn);
    window.addEventListener('pagechange', (e) => { const k = (e as CustomEvent).detail; if (k === 'news') { HEADLINES.show(); view.refresh(); } btn.classList.toggle('on', k === 'news'); });
    PAGES.register('news', 'ข่าว', root, inner('newspaper'));
  }
  teaser(); setInterval(() => { teaser(); if (visible()) view.refresh(); }, 30000);
  setTimeout(teaser, 6000);
  return { open, close, render, isOpen: visible };
})();
pages.news = NEWSPAGE;
def({ NEWSPAGE: [() => NEWSPAGE] });
