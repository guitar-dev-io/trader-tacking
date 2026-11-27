// Re-render signal for the calculator tab: planner.ts bumps it in renderPlanner().
import { writable } from 'svelte/store';
export const plannerTick = writable(0);
