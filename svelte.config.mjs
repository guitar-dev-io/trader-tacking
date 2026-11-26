// Svelte 5 components (src/**/*.svelte): TypeScript in <script lang="ts"> via Vite's preprocessor.
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  compilerOptions: { runes: true, discloseVersion: false },   // no window.__svelte (the app adds only PT to window)
};
