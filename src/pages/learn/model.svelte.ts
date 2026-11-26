// Learning center state (Svelte runes). The lesson book (lessons.js + lessons-guide.js + mm-learn.js) in reading
// order, what the user has read, the current view and the search term. Same localStorage keys as before
// (lc.read, lc.view, lc.cats, lc.scroll, lc.last), so saved progress carries over.
import { SvelteSet } from 'svelte/reactivity';
import { store } from '../../state';
import { LESSONS } from '../../../lessons.js';
import { LESSONS_EXTRA, LESSON_CATS, LESSON_CAT_OF } from '../../../lessons-guide.js';

export interface Cat { id: string; name: string; icon?: string }
export interface Lesson { id: string; c: string; t: string; b: string; title: string; text: string; q: string; min: number }
export interface Practice { id: string; icon: string; title: string; sub: string }

export const cats: Cat[] = LESSON_CATS || [{ id: 'all', name: 'บทเรียน', icon: 'book-open' }];
// stable id from the title (lessons have no ids; titles are unique)
const hash = (t: string) => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return 'L' + (h >>> 0).toString(36); };
const strip = (h: string) => h.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const raw: { t: string; b: string; c: string }[] = [
  ...LESSONS.map((l: { t: string; b: string }, i: number) => ({ ...l, c: (LESSON_CAT_OF || {})[i] || cats[0].id })),
  ...(LESSONS_EXTRA || []),
];
// reading order = category order, then the order inside each category
export const all: Lesson[] = cats.flatMap((c) => raw.filter((l) => l.c === c.id)).map((l) => {
  const text = strip(l.b), title = l.t.replace(/^\d+\.\s*/, '');
  return { ...l, id: hash(l.t), title, text, q: (l.t + ' ' + text).toLowerCase(), min: Math.max(1, Math.round(text.length / 700)) };
});
export const byId = new Map(all.map((l) => [l.id, l]));
export const catOf = (id: string): Cat => cats.find((c) => c.id === id) || cats[0];
export const PRACTICE: Practice[] = [
  { id: 'p:mmquiz', icon: 'calculator', title: 'โจทย์ฝึกคำนวณ MM', sub: 'สุ่มโจทย์ lot, SL เป็นเงิน, R:R, Drawdown, Margin, บัญชีเซ็นต์ — มีเฉลยทีละขั้น' },
  { id: 'p:mmplan', icon: 'table-2', title: 'แผน MM ตามขนาดพอร์ต', sub: '$100 ถึง $10,000 · lot ที่ SL ต่าง ๆ · จุดหยุดรายวัน · เป้ารายเดือน' },
  { id: 'p:replay', icon: 'rewind', title: 'ฝึกด้วย Replay บนกราฟ', sub: 'ย้อนกราฟแล้วเล่นทีละแท่ง ตีโซน วางจุดเข้า SL TP แล้วดูผล' },
];
export const PATH = [
  { c: 'basics', t: 'อ่านกราฟเบื้องต้น' }, { c: 'candles', t: 'แท่งเทียนแต่ละแบบ' }, { c: 'structure', t: 'โครงสร้างราคา' },
  { c: 'ds', t: 'แนวรับ-ต้าน / Demand & Supply' }, { c: 'liquidity', t: 'Liquidity / Fibo' }, { c: 'mm', t: 'บริหารเงิน (MM)' },
].filter((p) => cats.some((c) => c.id === p.c));

const validView = (v: string) => v === 'home' || byId.has(v) || PRACTICE.some((p) => p.id === v);
const v0 = store.get<string>('lc.view', 'home');

export const lc = $state({
  view: validView(v0) ? v0 : 'home',
  term: '',
  mListMode: true,
});
export const read = new SvelteSet<string>(store.get<string[]>('lc.read', []).filter((id) => byId.has(id)));
export const openCats = new SvelteSet<string>(store.get<string[]>('lc.cats', cats.map((c) => c.id)));

export const saveRead = () => store.set('lc.read', [...read]);
export const saveCats = () => store.set('lc.cats', [...openCats]);
export function progress(cid?: string) { const ls = all.filter((l) => !cid || l.c === cid); return { n: ls.filter((l) => read.has(l.id)).length, of: ls.length }; }
export const firstUnread = (cid: string) => all.find((l) => l.c === cid && !read.has(l.id)) || all.find((l) => l.c === cid);
export function mark(id: string, on: boolean) { if (on) read.add(id); else read.delete(id); saveRead(); }
export function setView(v: string) {
  lc.view = v; store.set('lc.view', v);
  if (byId.has(v)) { store.set('lc.last', v); const c = byId.get(v)!.c; if (!openCats.has(c)) { openCats.add(c); saveCats(); } }
}
export { validView };
