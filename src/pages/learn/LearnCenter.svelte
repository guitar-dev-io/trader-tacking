<script lang="ts">
  // Learning center ("ศูนย์การเรียนรู้"): category list on the left, one lesson at a time in a readable column,
  // progress, a beginner path and the practice tools. Clicks on [data-v] buttons (also inside the lesson HTML)
  // are handled by one delegated listener on the page root (index.ts), as before.
  import Icon from '../../ui/Icon.svelte';
  import { store } from '../../state';
  import { lc, all, byId, cats, catOf, PRACTICE, PATH, read, openCats, progress, firstUnread, type Lesson, type Practice } from './model.svelte';

  let { mobile, onclose, onback, refs }: {
    mobile: boolean; onclose: () => void; onback: () => void;
    refs: { main?: HTMLElement; doc?: HTMLElement; q?: HTMLInputElement; nav?: HTMLElement };
  } = $props();

  const match = (l: Lesson) => !lc.term || l.q.includes(lc.term);
  const navCats = $derived(cats.map((c) => ({ c, ls: all.filter((l) => l.c === c.id && match(l)) })).filter((x) => x.ls.length));
  const hits = $derived(navCats.reduce((s, x) => s + x.ls.length, 0));
  const total = $derived(progress());
  const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

  const lesson = $derived(byId.get(lc.view));
  const practice = $derived(PRACTICE.find((x) => x.id === lc.view));
  // home: where to continue
  const homeNext = $derived.by(() => {
    void read.size;
    const last = byId.get(store.get('lc.last', '')), next = last && !read.has(last.id) ? last : all.find((l) => !read.has(l.id));
    return { last, next };
  });
  const nb = (l: Lesson) => { const i = all.indexOf(l); return { prev: all[i - 1], next: all[i + 1] }; };
</script>

{#snippet bar(n: number, of: number)}<div class="lc-bar"><i style="width:{pct(n, of)}%"></i></div>{/snippet}

{#snippet lessonView(l: Lesson)}
  {@const p = nb(l)}
  {@const c = catOf(l.c)}
  {@const isRead = read.has(l.id)}
  {@const pr = progress(l.c)}
  <div class="lc-crumb"><button data-v="home">ศูนย์การเรียนรู้</button><Icon name="chevron-right" size={12} /><button data-v={firstUnread(l.c)!.id} data-cat-open={l.c}>{c.name}</button></div>
      <h1>{l.title}</h1>
      <div class="lc-meta"><Icon name={c.icon || 'book-open'} size={14} />{c.name} · บทที่ {all.filter((x) => x.c === l.c).indexOf(l) + 1}/{pr.of} · <Icon name="clock" size={14} />อ่าน ~{l.min} นาที{#if isRead} · <span class="lc-readtag"><Icon name="circle-check" size={14} />อ่านแล้ว</span>{/if}</div>
      <article class="lc-body" id="lessons">{@html l.b}</article>
      <div class="lc-mark"><button class="lc-markbtn {isRead ? 'on' : ''}" data-mark={l.id}><Icon name={isRead ? 'circle-check' : 'circle-dashed'} size={16} />{isRead ? 'อ่านแล้ว' : 'ทำเครื่องหมายว่าอ่านแล้ว'}</button></div>
      <div class="lc-pn">{#if p.prev}<button class="lc-prev" data-v={p.prev.id}><Icon name="chevron-left" size={18} /><span><small>ก่อนหน้า</small><b>{p.prev.title}</b></span></button>{:else}<span></span>{/if}
        {#if p.next}<button class="lc-next" data-v={p.next.id} data-readnext={l.id}><span><small>ถัดไป{p.next.c !== l.c ? ' · ' + catOf(p.next.c).name : ''}</small><b>{p.next.title}</b></span><Icon name="chevron-right" size={18} /></button>{:else}<span></span>{/if}</div>
{/snippet}

{#snippet practiceView(p: Practice)}
  <div class="lc-crumb"><button data-v="home">ศูนย์การเรียนรู้</button><Icon name="chevron-right" size={12} /><span>ฝึก</span></div>
      <h1>{p.title}</h1><div class="lc-meta"><Icon name={p.icon} size={14} />{p.sub}</div><div class="lc-body lc-prac-body" id="lessons">{#if p.id === 'p:mmquiz'}<div class="mm-widget" data-w="quiz"></div>{:else if p.id === 'p:mmplan'}<div class="mm-widget" data-w="plan"></div>{:else}<div class="lc-replay"><p>Replay ย้อนกราฟไปจุดหนึ่งในอดีตแล้วเล่นทีละแท่งโดยไม่เห็นอนาคต ฝึกอ่านโครงสร้าง ตีโซน วางคำสั่งจำลองพร้อม SL/TP แล้วดูผลจริงของกราฟ</p>
          <ol><li>กด <b>สุ่มโจทย์บนกราฟ</b> — แอปจะเปิดกราฟและย้อนไปจุดสุ่ม</li><li>วิเคราะห์แล้ววางคำสั่งจำลองในแท็บ <b>ฝึก</b> ด้านขวา (หรือกดข้าม)</li><li>แอปเล่นกราฟต่อจนรู้ผล แล้วเก็บสถิติให้</li></ol>
          <div class="lc-btns"><button class="primary" data-replay="quiz"><Icon name="target" size={16} />สุ่มโจทย์บนกราฟ</button><button data-replay="pick"><Icon name="rewind" size={16} />เลือกจุดเริ่มเอง</button></div>
          <p class="lc-disc">คีย์ลัดบนกราฟ: Space = เล่น/หยุด · → = 1 แท่ง · Shift+→ = 10 แท่ง · ← = ถอย</p></div>{/if}</div>
{/snippet}

{#snippet homeView()}
  {@const t = total}
  {@const next = homeNext.next}
  {@const last = homeNext.last}
  <div class="lc-hero"><h1>ศูนย์การเรียนรู้ Price Action</h1>
        <p>อ่านกราฟเป็นทีละขั้น ตั้งแต่แท่งเทียนจนถึงการบริหารเงิน — {all.length} บท พร้อมภาพประกอบและแบบฝึก</p>
        <div class="lc-total"><div><b>{t.n}</b><span>/ {t.of} บทที่อ่านแล้ว</span></div>{@render bar(t.n, t.of)}</div></div>
      {#if next}<button class="lc-continue" data-v={next.id}><span class="lc-k">{last && next === last ? 'อ่านต่อจากที่ค้างไว้' : t.n ? 'บทถัดไป' : 'เริ่มบทแรก'}</span>
        <b>{next.title}</b><small>{catOf(next.c).name} · อ่าน ~{next.min} นาที</small><Icon name="chevron-right" size={20} cls="lc-go" /></button>{:else}<div class="lc-done"><Icon name="trophy" size={20} /><b>อ่านครบทุกบทแล้ว — เยี่ยมมาก!</b></div>{/if}
      <h2><Icon name="route" size={18} />เส้นทางสำหรับมือใหม่</h2>
      <ol class="lc-path">{#each PATH as p, i}{@const pr = progress(p.c)}{@const f = firstUnread(p.c)}{@const done = pr.n === pr.of}<li class={done ? 'done' : ''}><button data-v={f ? f.id : 'home'}>
          <span class="lc-step">{#if done}<Icon name="check" size={14} />{:else}{i + 1}{/if}</span><span><b>{p.t}</b><small>{pr.n}/{pr.of} บท</small></span></button></li>{/each}</ol>
      <h2><Icon name="book-open" size={18} />หมวดบทเรียน</h2>
      <div class="lc-cards">{#each cats as c}{@const pr = progress(c.id)}{@const f = firstUnread(c.id)}<button class="lc-card" data-v={f ? f.id : 'home'}>
          <span class="lc-ci"><Icon name={c.icon || 'book-open'} size={20} /></span><b>{c.name}</b><small>{pr.n}/{pr.of} บท</small>{@render bar(pr.n, pr.of)}</button>{/each}</div>
      <h2><Icon name="target" size={18} />ฝึกทำ</h2>
      <div class="lc-cards lc-pcards">{#each PRACTICE as p}<button class="lc-card" data-v={p.id}><span class="lc-ci"><Icon name={p.icon} size={20} /></span><b>{p.title}</b><small>{p.sub}</small></button>{/each}</div>
      <p class="lc-disc">เนื้อหาเพื่อการเรียนรู้ ไม่ใช่คำแนะนำการลงทุน — การเทรดมีความเสี่ยง</p>
{/snippet}

<aside class="lc-side">
      <div class="lc-brand"><Icon name="graduation-cap" size={20} /><b>ศูนย์การเรียนรู้</b>{#if mobile}<button class="lc-close ib" aria-label="ปิด" onclick={onclose}><Icon name="x" size={18} /></button>{/if}</div>
      <label class="lc-search"><Icon name="search" size={15} /><input type="search" placeholder="ค้นหา เช่น hammer, demand, fibo, lot" aria-label="ค้นหาบทเรียน" bind:this={refs.q}><kbd>/</kbd></label>
      <nav class="lc-nav" bind:this={refs.nav}><button class="lc-item lc-home {lc.view === 'home' ? 'on' : ''}" data-v="home"><Icon name="house" size={15} /><span>หน้าแรก</span><small>{total.n}/{total.of}</small></button>{#each navCats as { c, ls }}{@const p = progress(c.id)}{@const open = !!lc.term || openCats.has(c.id) || ls.some((l) => l.id === lc.view)}<div class="lc-cat {open ? 'open' : ''}" data-cat={c.id}>
        <button class="lc-cat-h" data-cat-t={c.id}><Icon name={c.icon || 'book-open'} size={15} /><span>{c.name}</span><small>{lc.term ? ls.length : p.n + '/' + p.of}</small><Icon name="chevron-right" size={14} cls="lc-chev" /></button>
        <div class="lc-cat-b">{#each ls as l}<button class="lc-item lc-les {lc.view === l.id ? 'on' : ''} {read.has(l.id) ? 'read' : ''}" data-v={l.id}><Icon name={read.has(l.id) ? 'circle-check' : 'circle-dashed'} size={14} cls="lc-st" /><span>{l.title}</span></button>{/each}</div></div>{/each}{#if lc.term && !hits}<p class="lc-empty">ไม่พบบทเรียนที่มีคำว่า “{lc.term}”</p>{/if}{#if !lc.term}<div class="lc-cat open lc-prac"><div class="lc-cat-h static"><Icon name="target" size={15} /><span>ฝึก</span></div>
      <div class="lc-cat-b">{#each PRACTICE as p}<button class="lc-item {lc.view === p.id ? 'on' : ''}" data-v={p.id}><Icon name={p.icon} size={14} cls="lc-st" /><span>{p.title}</span></button>{/each}</div></div>{/if}</nav>
    </aside>
    <main class="lc-main" bind:this={refs.main}>{#if mobile}<div class="lc-mbar"><button class="lc-back" aria-label="กลับ" onclick={onback}><Icon name="arrow-left" size={18} /><span>บทเรียนทั้งหมด</span></button></div>{/if}<div class="lc-doc {lesson ? 'lesson' : practice ? 'practice' : 'home'}" bind:this={refs.doc}>{#if lesson}{@render lessonView(lesson)}{:else if practice}{@render practiceView(practice)}{:else}{@render homeView()}{/if}</div></main>
