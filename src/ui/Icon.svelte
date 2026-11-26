<script lang="ts">
  // A Lucide icon from the app's icon set (icons.js) — same markup as ICON.html(), so the CSS stays the same.
  // bare: just the <svg> (ICON.svg), for places that never had the inline-icon wrapper.
  import { ICON } from '../../icons.js';
  let { name, size = 16, cls = '', bare = false }: { name: string; size?: number; cls?: string; bare?: boolean } = $props();
</script>

{@html bare ? ICON.svg(name, size) : ICON.html(name, size, cls)}
