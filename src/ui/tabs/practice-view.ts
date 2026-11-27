// ฝึก tab: learn.js (SIM / QUIZ / LESSON) owns the logic and pushes snapshots here; Sim/Quiz/LessonPack.svelte render them.
import { mount, flushSync, type Component } from 'svelte';
import { writable, type Writable } from 'svelte/store';
import Sim from './Sim.svelte';
import Quiz from './Quiz.svelte';
import LessonPack from './LessonPack.svelte';

export interface SimRow { id: number; buy: boolean; lot: number; at: string; pl: number | null; plS: string }
export interface SimSnap {
  mode: 'live' | 'replay'; balance: string; open: number; openS: string; eq: string;
  ticket: Record<string, any>; tags: [string, string][];
  positions: SimRow[]; orders: { id: number; text: string; at: string }[];
  st: { n: number; win: string; avgR: string; pf: string; total: string; totalUp: boolean; dd: string };
  byTag: { label: string; n: number; win: string; avgR: string }[];
  history: { up: boolean; head: string; body: string; sub: string }[];
}
export interface QuizSnap { canSkip: boolean; inReplay: boolean; done: number; skipped: number; win: string; avgR: string }
export interface LessonSnap { symbol: string }

export const simView = writable<SimSnap | null>(null);
export const quizView = writable<QuizSnap | null>(null);
export const lessonView = writable<LessonSnap | null>(null);

const mounted = new Set<string>();
function show<T>(id: string, C: Component<any>, store: Writable<T | null>, snap: T, api: unknown) {
  const box = document.getElementById(id); if (!box) return;
  store.set(snap);
  if (!mounted.has(id) || !box.firstElementChild) { box.replaceChildren(); mount(C, { target: box, props: { api } }); mounted.add(id); }
  flushSync();
}
export const showSim = (snap: SimSnap, api: unknown) => show('sim', Sim, simView, snap, api);
export const showQuiz = (snap: QuizSnap, api: unknown) => show('quiz', Quiz, quizView, snap, api);
export const showLesson = (snap: LessonSnap, api: unknown) => show('lesson-pack', LessonPack, lessonView, snap, api);
/** per-tick: only push new numbers (the component patches text, no rebuild) */
export function tickSim(snap: SimSnap) { simView.set(snap); flushSync(); }
