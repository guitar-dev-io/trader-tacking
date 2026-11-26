// ES-module entry of the renderer: the app modules (src/app.ts, in the old script order) + build info.
// New code lives under src/ as modules and is started from here; see docs/MIGRATION.md.
import { PT } from './pt';
import './app';

declare const __APP_VERSION__: string;
declare const __WEB__: boolean;

PT.BUILD = { version: __APP_VERSION__, web: __WEB__, dev: import.meta.env.DEV };
