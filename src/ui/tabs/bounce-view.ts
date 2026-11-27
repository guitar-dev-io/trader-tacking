// Re-render signal for the จุดเด้ง panel; app-bounce.ts bumps it after runBounce() and on live-price ticks.
import { writable } from 'svelte/store';
export const bounceTick = writable(0);
