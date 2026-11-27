// The TypeScript computation core under the names the renderer has always used (AN, BOUNCE, MM, JOURNAL).
import * as analysis from '../core/analysis';
import * as bounce from '../core/bounce';
import * as mm from '../core/mm';
import * as journal from '../core/journal';
import { def } from '../pt';

export const AN = { ...analysis };
export const BOUNCE = { ...bounce };
export const MM = { ...mm };
export const JOURNAL = { ...journal };

