<script lang="ts">
  import Icon from '../Icon.svelte';
  import { logs, LV, copyText } from './log';
  const vcg = (window as any).vcg;
  let level = $state(''), q = $state('');
  const rows = $derived.by(() => {
    const min = level === 'error' ? 3 : level === 'warn' ? 2 : level === 'info' ? 1 : 0, s = q.toLowerCase();
    return $logs.filter((e) => LV[e.level] >= min && (!s || (e.msg + ' ' + (e.data || '') + ' ' + e.source).toLowerCase().includes(s))).slice(-250).reverse();
  });
</script>

<div class="panel log-tools">
  <select id="log-level" bind:value={level}><option value="">ทุกระดับ</option><option value="error">error</option><option value="warn">warn+</option><option value="info">info+</option></select>
  <input id="log-search" placeholder="ค้นหา…" bind:value={q}>
  <button id="log-file" title="เปิดไฟล์ log" aria-label="เปิดไฟล์ log" onclick={() => vcg.openLogFile()}><Icon name="file-text" /></button>
  <button id="log-folder" title="เปิดโฟลเดอร์ log" aria-label="เปิดโฟลเดอร์ log" onclick={() => vcg.openLogFolder()}><Icon name="folder-open" /></button>
  <button id="log-copy" title="คัดลอก log" aria-label="คัดลอก log" onclick={() => navigator.clipboard.writeText(copyText())}><Icon name="clipboard-copy" /></button>
</div>
<div id="log-list">
  {#each rows as e, i (i)}
    <div class="le {e.level}"><span class="t">{new Date(e.t).toLocaleTimeString()}</span> <span class="s">{e.source}</span> {e.msg}{#if e.data} <span class="t">{e.data}</span>{/if}</div>
  {:else}
    <p class="muted" style="padding:8px">ไม่มี log</p>
  {/each}
</div>
