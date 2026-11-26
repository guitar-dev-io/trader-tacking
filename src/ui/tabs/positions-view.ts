// Snapshot that positions.js pushes for the Positions.svelte panel.
import { writable } from 'svelte/store';
export interface PosView { data: any; deals: any[] | null; opt: { onChart: boolean; hist: boolean; days: number }; mt5: any; same: (s: string) => boolean }
export const posView = writable<PosView>({ data: null, deals: null, opt: { onChart: true, hist: false, days: 7 }, mt5: {}, same: () => false });
