/* global $, S, store, esc, toast, ICON, PAGES, LESSONS, MM_LEARN, QUIZ */
// Learning center ("ศูนย์การเรียนรู้"): the lesson book as its own page — category list on the left, one lesson at a
// time in a readable column, progress, a beginner path and the practice tools (MM quiz, MM plan, Replay practice).
// Desktop: a page tab (pages.js). Phone: a full-screen page with list → reader → back.
const LEARN = (() => {
  const mobile = document.body.classList.contains('mobile');
  const ic = (n, s = 16, c) => (ICON.html ? ICON.html(n, s, c) : '');
  const cats = window.LESSON_CATS || [{ id: 'all', name: 'บทเรียน', icon: 'book-open' }];
  // stable id from the title (lessons have no ids; titles are unique)
  const hash = (t) => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return 'L' + (h >>> 0).toString(36); };
  const strip = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const raw = [...LESSONS.map((l, i) => ({ ...l, c: (window.LESSON_CAT_OF || {})[i] || cats[0].id })), ...(window.LESSONS_EXTRA || [])];
  // reading order = category order, then the order inside each category
  const all = cats.flatMap((c) => raw.filter((l) => l.c === c.id)).map((l) => {
    const text = strip(l.b), title = l.t.replace(/^\d+\.\s*/, '');
    return { ...l, id: hash(l.t), title, text, q: (l.t + ' ' + text).toLowerCase(), min: Math.max(1, Math.round(text.length / 700)) };
  });
  const byId = new Map(all.map((l) => [l.id, l]));
  const catOf = (id) => cats.find((c) => c.id === id) || cats[0];
  const PRACTICE = [
    { id: 'p:mmquiz', icon: 'calculator', title: 'โจทย์ฝึกคำนวณ MM', sub: 'สุ่มโจทย์ lot, SL เป็นเงิน, R:R, Drawdown, Margin, บัญชีเซ็นต์ — มีเฉลยทีละขั้น' },
    { id: 'p:mmplan', icon: 'table-2', title: 'แผน MM ตามขนาดพอร์ต', sub: '$100 ถึง $10,000 · lot ที่ SL ต่าง ๆ · จุดหยุดรายวัน · เป้ารายเดือน' },
    { id: 'p:replay', icon: 'rewind', title: 'ฝึกด้วย Replay บนกราฟ', sub: 'ย้อนกราฟแล้วเล่นทีละแท่ง ตีโซน วางจุดเข้า SL TP แล้วดูผล' },
  ];
  const PATH = [
    { c: 'basics', t: 'อ่านกราฟเบื้องต้น' }, { c: 'candles', t: 'แท่งเทียนแต่ละแบบ' }, { c: 'structure', t: 'โครงสร้างราคา' },
    { c: 'ds', t: 'แนวรับ-ต้าน / Demand & Supply' }, { c: 'liquidity', t: 'Liquidity / Fibo' }, { c: 'mm', t: 'บริหารเงิน (MM)' },
  ].filter((p) => cats.some((c) => c.id === p.c));

  let read = new Set(store.get('lc.read', []).filter((id) => byId.has(id)));
  let view = store.get('lc.view', 'home'); if (view !== 'home' && !byId.has(view) && !PRACTICE.some((p) => p.id === view)) view = 'home';
  let term = '', openCats = new Set(store.get('lc.cats', cats.map((c) => c.id))), mListMode = true;
  const scrolls = store.get('lc.scroll', {});
  const saveRead = () => store.set('lc.read', [...read]);
  const progress = (cid) => { const ls = all.filter((l) => !cid || l.c === cid); return { n: ls.filter((l) => read.has(l.id)).length, of: ls.length }; };
  const firstUnread = (cid) => all.find((l) => l.c === cid && !read.has(l.id)) || all.find((l) => l.c === cid);

  // ------------------------------------------------------------ DOM
  const root = document.createElement('div'); root.id = 'learn-center'; root.className = 'lc' + (mobile ? ' m-full hidden' : '');
  root.innerHTML = `<aside class="lc-side">
      <div class="lc-brand">${ic('graduation-cap', 20)}<b>ศูนย์การเรียนรู้</b>${mobile ? `<button class="lc-close ib" aria-label="ปิด">${ic('x', 18)}</button>` : ''}</div>
      <label class="lc-search">${ic('search', 15)}<input type="search" placeholder="ค้นหา เช่น hammer, demand, fibo, lot" aria-label="ค้นหาบทเรียน"><kbd>/</kbd></label>
      <nav class="lc-nav"></nav>
    </aside>
    <main class="lc-main"><div class="lc-doc"></div></main>`;
  const nav = root.querySelector('.lc-nav'), main = root.querySelector('.lc-main'), doc = root.querySelector('.lc-doc'), q = root.querySelector('.lc-search input');

  function navHtml() {
    const match = (l) => !term || l.q.includes(term);
    const total = progress();
    let h = `<button class="lc-item lc-home ${view === 'home' ? 'on' : ''}" data-v="home">${ic('house', 15)}<span>หน้าแรก</span><small>${total.n}/${total.of}</small></button>`;
    let hits = 0;
    for (const c of cats) {
      const ls = all.filter((l) => l.c === c.id && match(l)); if (!ls.length) continue;
      hits += ls.length;
      const p = progress(c.id), open = term || openCats.has(c.id) || ls.some((l) => l.id === view);
      h += `<div class="lc-cat ${open ? 'open' : ''}" data-cat="${c.id}">
        <button class="lc-cat-h" data-cat-t="${c.id}">${ic(c.icon || 'book-open', 15)}<span>${esc(c.name)}</span><small>${term ? ls.length : p.n + '/' + p.of}</small>${ic('chevron-right', 14, 'lc-chev')}</button>
        <div class="lc-cat-b">${ls.map((l) => `<button class="lc-item lc-les ${view === l.id ? 'on' : ''} ${read.has(l.id) ? 'read' : ''}" data-v="${l.id}">${ic(read.has(l.id) ? 'circle-check' : 'circle-dashed', 14, 'lc-st')}<span>${esc(l.title)}</span></button>`).join('')}</div></div>`;
    }
    if (term && !hits) h += `<p class="lc-empty">ไม่พบบทเรียนที่มีคำว่า “${esc(term)}”</p>`;
    if (!term) h += `<div class="lc-cat open lc-prac"><div class="lc-cat-h static">${ic('target', 15)}<span>ฝึก</span></div>
      <div class="lc-cat-b">${PRACTICE.map((p) => `<button class="lc-item ${view === p.id ? 'on' : ''}" data-v="${p.id}">${ic(p.icon, 14, 'lc-st')}<span>${p.title}</span></button>`).join('')}</div></div>`;
    return h;
  }
  const bar = (n, of) => `<div class="lc-bar"><i style="width:${of ? Math.round((n / of) * 100) : 0}%"></i></div>`;
  function homeHtml() {
    const t = progress(), last = byId.get(store.get('lc.last', '')), next = last && !read.has(last.id) ? last : all.find((l) => !read.has(l.id));
    return `<div class="lc-hero"><h1>ศูนย์การเรียนรู้ Price Action</h1>
        <p>อ่านกราฟเป็นทีละขั้น ตั้งแต่แท่งเทียนจนถึงการบริหารเงิน — ${all.length} บท พร้อมภาพประกอบและแบบฝึก</p>
        <div class="lc-total"><div><b>${t.n}</b><span>/ ${t.of} บทที่อ่านแล้ว</span></div>${bar(t.n, t.of)}</div></div>
      ${next ? `<button class="lc-continue" data-v="${next.id}"><span class="lc-k">${last && next === last ? 'อ่านต่อจากที่ค้างไว้' : t.n ? 'บทถัดไป' : 'เริ่มบทแรก'}</span>
        <b>${esc(next.title)}</b><small>${esc(catOf(next.c).name)} · อ่าน ~${next.min} นาที</small>${ic('chevron-right', 20, 'lc-go')}</button>` : '<div class="lc-done">' + ic('trophy', 20) + '<b>อ่านครบทุกบทแล้ว — เยี่ยมมาก!</b></div>'}
      <h2>${ic('route', 18)}เส้นทางสำหรับมือใหม่</h2>
      <ol class="lc-path">${PATH.map((p, i) => { const pr = progress(p.c), f = firstUnread(p.c), done = pr.n === pr.of; return `<li class="${done ? 'done' : ''}"><button data-v="${f ? f.id : 'home'}">
          <span class="lc-step">${done ? ic('check', 14) : i + 1}</span><span><b>${p.t}</b><small>${pr.n}/${pr.of} บท</small></span></button></li>`; }).join('')}</ol>
      <h2>${ic('book-open', 18)}หมวดบทเรียน</h2>
      <div class="lc-cards">${cats.map((c) => { const pr = progress(c.id), f = firstUnread(c.id); return `<button class="lc-card" data-v="${f ? f.id : 'home'}">
          <span class="lc-ci">${ic(c.icon || 'book-open', 20)}</span><b>${esc(c.name)}</b><small>${pr.n}/${pr.of} บท</small>${bar(pr.n, pr.of)}</button>`; }).join('')}</div>
      <h2>${ic('target', 18)}ฝึกทำ</h2>
      <div class="lc-cards lc-pcards">${PRACTICE.map((p) => `<button class="lc-card" data-v="${p.id}"><span class="lc-ci">${ic(p.icon, 20)}</span><b>${p.title}</b><small>${p.sub}</small></button>`).join('')}</div>
      <p class="lc-disc">เนื้อหาเพื่อการเรียนรู้ ไม่ใช่คำแนะนำการลงทุน — การเทรดมีความเสี่ยง</p>`;
  }
  function lessonHtml(l) {
    const i = all.indexOf(l), prev = all[i - 1], next = all[i + 1], c = catOf(l.c), isRead = read.has(l.id);
    const pr = progress(l.c);
    return `<div class="lc-crumb"><button data-v="home">ศูนย์การเรียนรู้</button>${ic('chevron-right', 12)}<button data-v="${firstUnread(l.c).id}" data-cat-open="${l.c}">${esc(c.name)}</button></div>
      <h1>${esc(l.title)}</h1>
      <div class="lc-meta">${ic(c.icon || 'book-open', 14)}${esc(c.name)} · บทที่ ${all.filter((x) => x.c === l.c).indexOf(l) + 1}/${pr.of} · ${ic('clock', 14)}อ่าน ~${l.min} นาที${isRead ? ` · <span class="lc-readtag">${ic('circle-check', 14)}อ่านแล้ว</span>` : ''}</div>
      <article class="lc-body" id="lessons">${l.b}</article>
      <div class="lc-mark"><button class="lc-markbtn ${isRead ? 'on' : ''}" data-mark="${l.id}">${ic(isRead ? 'circle-check' : 'circle-dashed', 16)}${isRead ? 'อ่านแล้ว' : 'ทำเครื่องหมายว่าอ่านแล้ว'}</button></div>
      <div class="lc-pn">${prev ? `<button class="lc-prev" data-v="${prev.id}">${ic('chevron-left', 18)}<span><small>ก่อนหน้า</small><b>${esc(prev.title)}</b></span></button>` : '<span></span>'}
        ${next ? `<button class="lc-next" data-v="${next.id}" data-readnext="${l.id}"><span><small>ถัดไป${next.c !== l.c ? ' · ' + esc(catOf(next.c).name) : ''}</small><b>${esc(next.title)}</b></span>${ic('chevron-right', 18)}</button>` : '<span></span>'}</div>`;
  }
  function practiceHtml(p) {
    const body = p.id === 'p:mmquiz' ? '<div class="mm-widget" data-w="quiz"></div>'
      : p.id === 'p:mmplan' ? '<div class="mm-widget" data-w="plan"></div>'
      : `<div class="lc-replay"><p>Replay ย้อนกราฟไปจุดหนึ่งในอดีตแล้วเล่นทีละแท่งโดยไม่เห็นอนาคต ฝึกอ่านโครงสร้าง ตีโซน วางคำสั่งจำลองพร้อม SL/TP แล้วดูผลจริงของกราฟ</p>
          <ol><li>กด <b>สุ่มโจทย์บนกราฟ</b> — แอปจะเปิดกราฟและย้อนไปจุดสุ่ม</li><li>วิเคราะห์แล้ววางคำสั่งจำลองในแท็บ <b>ฝึก</b> ด้านขวา (หรือกดข้าม)</li><li>แอปเล่นกราฟต่อจนรู้ผล แล้วเก็บสถิติให้</li></ol>
          <div class="lc-btns"><button class="primary" data-replay="quiz">${ic('target', 16)}สุ่มโจทย์บนกราฟ</button><button data-replay="pick">${ic('rewind', 16)}เลือกจุดเริ่มเอง</button></div>
          <p class="lc-disc">คีย์ลัดบนกราฟ: Space = เล่น/หยุด · → = 1 แท่ง · Shift+→ = 10 แท่ง · ← = ถอย</p></div>`;
    return `<div class="lc-crumb"><button data-v="home">ศูนย์การเรียนรู้</button>${ic('chevron-right', 12)}<span>ฝึก</span></div>
      <h1>${p.title}</h1><div class="lc-meta">${ic(p.icon, 14)}${p.sub}</div><div class="lc-body lc-prac-body" id="lessons">${body}</div>`;
  }

  // ------------------------------------------------------------ render
  function renderNav() { nav.innerHTML = navHtml(); const on = nav.querySelector('.lc-item.on'); if (on && !mobile) on.scrollIntoView({ block: 'nearest' }); }
  function renderDoc() {
    if (scrolls._v) scrolls[scrolls._v] = main.scrollTop;
    const l = byId.get(view), p = PRACTICE.find((x) => x.id === view);
    doc.className = 'lc-doc' + (l ? ' lesson' : p ? ' practice' : ' home');
    doc.innerHTML = l ? lessonHtml(l) : p ? practiceHtml(p) : homeHtml();
    if (window.MM_LEARN) MM_LEARN.mount(doc);
    scrolls._v = view;
    main.scrollTop = (l && scrolls[view]) || 0;
    store.set('lc.scroll', Object.fromEntries(Object.entries(scrolls).filter(([k]) => k !== '_v').slice(-60)));
    root.classList.toggle('m-reading', mobile && !mListMode);
  }
  function render() { renderNav(); renderDoc(); }
  function go(v, opts = {}) {
    if (!v) return;
    view = v; store.set('lc.view', v);
    if (byId.has(v)) { store.set('lc.last', v); const c = byId.get(v).c; if (!openCats.has(c)) { openCats.add(c); store.set('lc.cats', [...openCats]); } }
    if (mobile && opts.reader) mListMode = false;
    render();
    if (!opts.keepFocus && document.activeElement === q && !mobile) q.blur();
  }
  function mark(id, on) { if (on) read.add(id); else read.delete(id); saveRead(); }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
    if (b.classList.contains('lc-close')) return close();
    if (b.dataset.catT) { const c = b.dataset.catT; openCats.has(c) ? openCats.delete(c) : openCats.add(c); store.set('lc.cats', [...openCats]); renderNav(); return; }
    if (b.dataset.mark) { const id = b.dataset.mark; mark(id, !read.has(id)); render(); toast(read.has(id) ? 'บันทึกว่าอ่านแล้ว' : 'ยกเลิกเครื่องหมายอ่านแล้ว', 'ok', 1800); return; }
    if (b.dataset.replay) { startReplay(b.dataset.replay); return; }
    if (b.dataset.readnext) mark(b.dataset.readnext, true);
    if (b.dataset.v) go(b.dataset.v, { reader: true });
  });
  q.addEventListener('input', () => { term = q.value.trim().toLowerCase(); renderNav(); });
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const f = nav.querySelector('.lc-les'); if (f) { mListMode = false; go(f.dataset.v, { reader: true }); } } if (e.key === 'Escape') { q.value = ''; term = ''; renderNav(); q.blur(); } });
  const visible = () => (mobile ? !root.classList.contains('hidden') : window.PAGES && PAGES.active() === 'learn');
  document.addEventListener('keydown', (e) => {
    if (!visible() || e.metaKey || e.ctrlKey || e.altKey) return;
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (e.key === '/' && !typing) { e.preventDefault(); q.focus(); q.select(); return; }
    if (typing) return;
    const l = byId.get(view); if (!l) return;
    const i = all.indexOf(l);
    if (e.key === 'ArrowRight' && all[i + 1]) { e.preventDefault(); mark(l.id, true); go(all[i + 1].id); }
    if (e.key === 'ArrowLeft' && all[i - 1]) { e.preventDefault(); go(all[i - 1].id); }
  }, true);

  function startReplay(kind) {
    close(true);
    const t = document.querySelector('#tabs [data-tab="practice"]'); if (t) t.click();
    setTimeout(() => { if (typeof QUIZ !== 'undefined') { if (kind === 'quiz') QUIZ.start(); else if (typeof REPLAY !== 'undefined') REPLAY.pick(); } }, 150);
  }

  // ------------------------------------------------------------ open / close
  function open(v) {
    if (v) { view = v; store.set('lc.view', v); if (byId.has(v)) store.set('lc.last', v); }
    if (mobile) { mListMode = !v || v === 'home'; root.classList.remove('hidden'); document.body.classList.add('lc-open'); render(); return; }
    PAGES.open('learn'); render();
  }
  function close(toChart) {
    if (mobile) { root.classList.add('hidden'); document.body.classList.remove('lc-open'); return; }
    if (toChart || PAGES.active() === 'learn') PAGES.activate('chart');
  }
  if (mobile) {
    // back button in the reader returns to the list (and the Android back button too)
    root.querySelector('.lc-main').insertAdjacentHTML('afterbegin', `<div class="lc-mbar"><button class="lc-back" aria-label="กลับ">${ic('arrow-left', 18)}<span>บทเรียนทั้งหมด</span></button></div>`);
    root.querySelector('.lc-back').onclick = () => { mListMode = true; renderNav(); root.classList.remove('m-reading'); };
    document.body.appendChild(root);
    const prevBack = window.__mobileBack;
    window.__mobileBack = () => { if (!root.classList.contains('hidden')) { if (!mListMode) { mListMode = true; root.classList.remove('m-reading'); } else close(); return true; } return prevBack ? prevBack() : false; };
  } else {
    const inner = (n) => (ICON.svg(n, 14) || '').replace(/^<svg[^>]*>|<\/svg>$/g, '');
    const btn = document.createElement('button');
    btn.id = 'learn-btn'; btn.className = 'ib tb-learn'; btn.title = 'ศูนย์การเรียนรู้ — บทเรียนและแบบฝึก (Ctrl/⌘ + L)';
    btn.innerHTML = `${ic('graduation-cap', 16)}<span>เรียนรู้</span>`;
    btn.onclick = () => (PAGES.active() === 'learn' ? close() : open());
    const anchor = $('dash-btn') || $('theme-btn'); if (anchor) anchor.before(btn);
    window.addEventListener('pagechange', (e) => { btn.classList.toggle('on', e.detail === 'learn'); if (e.detail === 'learn') render(); });
    PAGES.register('learn', 'เรียนรู้', root, inner('graduation-cap'));
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'l' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); btn.click(); }
    });
  }
  // reading pages (learn, news) get the full width: fold the side panel while one is shown, restore it afterwards
  if (!mobile) {
    let sideWas = null;
    window.addEventListener('pagechange', (e) => {
      const reading = e.detail === 'learn' || e.detail === 'news';
      if (!window.setUI || !S.ui) return;
      if (reading && sideWas === null) { sideWas = !!S.ui.side; if (sideWas) window.setUI('side', false); }
      else if (e.detail === 'chart' && sideWas !== null) { if (sideWas) window.setUI('side', true); sideWas = null; }
    });
  }
  render();
  return {
    open, close, go: (v) => open(v), render,
    lessons: () => all.map((l) => ({ id: l.id, cat: l.c, title: l.title, read: read.has(l.id) })),
    progress, view: () => view, isOpen: visible, cats: () => cats.map((c) => c.id),
    find: (text) => all.find((l) => l.q.includes(String(text).toLowerCase())),
  };
})();
window.LEARN = LEARN;
