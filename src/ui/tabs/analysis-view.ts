// Re-render signal for the วิเคราะห์ tab panels (structure, signal, back-test); app-analysis.ts bumps it.
import { writable } from 'svelte/store';
export const analysisTick = writable(0);
