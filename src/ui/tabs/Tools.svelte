<script lang="ts">
  // ราคา tab → "การเชื่อมต่อ & เครื่องมือ": WebTrader/login, reconnect, CSV tick log, local API status.
  import Icon from '../Icon.svelte';
  import { tools, type ToolsApi } from './tools-view';
  let { api }: { api: ToolsApi } = $props();
  const a = $derived($tools.api);
</script>

<div class="btns">
  <button id="show-trader" onclick={() => api.showTrader()}>เปิด WebTrader / Login</button>
  <button id="reload-trader" onclick={() => api.reload()}><i data-icon="refresh-cw"><Icon name="refresh-cw" size={16} bare /></i>เชื่อมต่อใหม่</button>
</div>
<label class="chk"><input type="checkbox" id="csv" checked={$tools.csv} onchange={() => api.toggleCsv()}> บันทึกทุก tick ลง CSV</label>
<div class="btns"><button id="open-csv" onclick={() => api.openCsv()}>เปิดโฟลเดอร์ CSV</button></div>
<p class="muted" id="api-info">{#if a && a.enabled}API: <b>http://127.0.0.1:{a.port}</b>{a.lan ? ' (เปิดให้วง LAN)' : ''}{:else if a}API: ปิดอยู่{/if}</p>
