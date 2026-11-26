<script lang="ts">
  // A Lucide icon from the app's icon set (icons.js) — same markup as ICON.html(), so the CSS stays the same.
  import { ICON } from '../../icons.js';
  let { name, size = 16, cls = '' }: { name: string; size?: number; cls?: string } = $props();
</script>

{@html ICON.html(name, size, cls)}
