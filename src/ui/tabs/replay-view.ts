// Bar Replay control bar: learn.ts (REPLAY) owns the replay logic and pushes state here; ReplayBar.svelte renders it.
import { mount, flushSync } from 'svelte';
import { writable, get } from 'svelte/store';
import ReplayBar from './ReplayBar.svelte';

export interface ReplayActions { back(): void; play(): void; step(): void; exit(): void; speed(v: number): void }
export interface ReplayState { visible: boolean; playing: boolean; info: string; speed: number }
export const rp = writable<ReplayState>({ visible: false, playing: false, info: '', speed: 1 });

export function mountReplayBar(target: HTMLElement, api: ReplayActions) { mount(ReplayBar, { target, props: { api } }); flushSync(); }
export function setReplay(p: Partial<ReplayState>) { rp.update((s) => ({ ...s, ...p })); flushSync(); }
export const replaySpeed = () => get(rp).speed;
