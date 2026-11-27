// The drawing store of the open symbol (Phase 5a): one module owns the array; everyone imports the live binding
// and replaces it through setDrawings() (undo/redo, clear, symbol switch, lesson packs, Claude, journal).
// Stored under drawingsKey() as exactly these objects (old {type,p1,p2} / {type:'hline',price} are upgraded by
// normalize() in draw.ts when loaded).
import type { Drawing } from './types';
import { S, store } from '../state';
import { def } from '../pt';

export let drawings: Drawing[] = [];
export function setDrawings(list: Drawing[]): void { drawings = list; }
export const drawingsKey = (): string => 'drawings:' + S.symbol;
export const saveDrawings = (): void => store.set(drawingsKey(), drawings);

// tests / devtools / not-yet-migrated modules: PT.drawings (get + set), PT.saveDrawings
def({ drawings: [() => drawings, (v) => setDrawings(v as Drawing[])], drawingsKey: [() => drawingsKey], saveDrawings: [() => saveDrawings] });
