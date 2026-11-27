<script lang="ts">
  // Lesson packs: export the drawings + a note for the current symbol, or import someone else's pack.
  import { lessonView } from './practice-view';
  let { api }: { api: any } = $props();
  const v = $derived($lessonView);
  let note = $state(''), showImport = $state(false), text = $state('');
  let area: HTMLTextAreaElement | undefined = $state();
  function importClick() { if (!showImport) { showImport = true; queueMicrotask(() => area?.focus()); } else api.importPack(text); }
</script>

{#if v}
  <div class="panel-h">แพ็กบทเรียน (แชร์รูปวาด)</div>
  <p class="muted">ส่งออกโซน/เส้นที่วาดบน {v.symbol} พร้อมโน้ต ให้คนอื่นนำเข้าแล้วเห็นบนกราฟจุดเดียวกัน (ถ้าอยู่ใน Replay จะจำจุดเริ่มไว้ด้วย)</p>
  <input id="lp-note" placeholder="โน้ตสำหรับผู้เรียน เช่น ดูการย่อมาแตะ Demand H1" style="width:100%" bind:value={note}>
  <div class="btns"><button id="lp-export" onclick={() => api.exportPack(note)}>ส่งออก / คัดลอก</button><button id="lp-import-btn" onclick={importClick}>นำเข้า</button></div>
  <textarea id="lp-import" class:hidden={!showImport} placeholder="วางข้อความบทเรียนที่นี่ แล้วกด นำเข้า อีกครั้ง" style="width:100%;height:80px;margin-top:6px" bind:this={area} bind:value={text}></textarea>
{/if}
