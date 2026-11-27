<script lang="ts">
  // Paper-trading panel (simulated orders on live or replay data). learn.js SIM owns the account; this only renders
  // the snapshot and calls back. Same ids/data-attributes as the old HTML (tests + muscle memory).
  import { simView } from './practice-view';
  let { api }: { api: any } = $props();
  const v = $derived($simView);
  let armed = $state(false);
  const set = (k: string, val: any) => api.setTicket(k, val);
  const val = (e: Event) => (e.currentTarget as HTMLInputElement).value;
  function placeOnce(e: MouseEvent) {
    const b = e.currentTarget as HTMLButtonElement; if (b.disabled) return;
    b.disabled = true; setTimeout(() => { b.disabled = false; }, 800);   // one order per click
    api.place();
  }
  function reset() { if (!armed) { armed = true; return; } armed = false; api.reset(); }
</script>

{#if v}
  <div class="panel-h">บัญชีจำลอง · {v.mode === 'replay' ? 'Replay' : 'ราคาสด'}</div>
  <div class="sum"><span>เงินทุน</span><b>{v.balance}</b><span>กำไร/ขาดทุนที่เปิดอยู่</span><b id="sim-open" class={v.open >= 0 ? 'up' : 'down'}>{v.openS}</b><span>Equity</span><b id="sim-eq">{v.eq}</b></div>
  <h4>ส่งคำสั่ง (จำลอง)</h4>
  <div class="seg"><button data-t="side" data-v="1" class={v.ticket.side === 1 ? 'on buy' : ''} onclick={() => set('side', 1)}>▲ Buy</button><button data-t="side" data-v="-1" class={v.ticket.side === -1 ? 'on sell' : ''} onclick={() => set('side', -1)}>▼ Sell</button></div>
  <div class="grid" style="margin-top:6px">
    <label>ประเภท<select data-k="type" value={v.ticket.type} onchange={(e) => set('type', val(e))}><option value="market">Market</option><option value="limit">Limit</option><option value="stop">Stop</option></select></label>
    <label>ราคา (คำสั่งรอ)<input data-k="price" type="number" step="any" value={v.ticket.price} disabled={v.ticket.type === 'market'} onchange={(e) => set('price', val(e))}></label>
    <label>Lot<input data-k="lot" type="number" step="0.01" min="0.01" value={v.ticket.lot} onchange={(e) => set('lot', val(e))}></label>
    <label>เหตุผล (แท็ก)<select data-k="tag" value={v.ticket.tag} onchange={(e) => set('tag', val(e))}>{#each v.tags as [k, t]}<option value={k}>{t}</option>{/each}</select></label>
    <label>SL<input data-k="sl" type="number" step="any" value={v.ticket.sl} onchange={(e) => set('sl', val(e))}></label>
    <label>TP<input data-k="tp" type="number" step="any" value={v.ticket.tp} onchange={(e) => set('tp', val(e))}></label>
  </div>
  <label class="note">บันทึก (ทำไมถึงเข้า)<input data-k="note" value={v.ticket.note} placeholder="เช่น ย่อมาแตะ HL + BE ที่โซน H1" onchange={(e) => set('note', val(e))}></label>
  <div class="btns"><button id="sim-plan" onclick={() => api.fromPlan()}>ใช้ค่าจากเครื่องคำนวณ</button><button id="sim-lot" onclick={() => api.riskLot()}>lot ตามความเสี่ยง</button><button id="sim-place" class="primary" onclick={placeOnce}>ส่งคำสั่ง</button></div>
  {#if v.positions.length}
    <h4>สถานะที่เปิด ({v.positions.length})</h4>
    <div class="btns bulk"><button data-bulk="all" onclick={() => api.bulk('all')}>ปิดทั้งหมด</button><button data-bulk="win" class="upb" onclick={() => api.bulk('win')}>ปิดไม้กำไร</button><button data-bulk="loss" class="downb" onclick={() => api.bulk('loss')}>ปิดไม้ขาดทุน</button><button data-bulk="be" title="เลื่อน SL มาที่ราคาเข้า เฉพาะไม้ที่กำไรอยู่" onclick={() => api.bulk('be')}>กันทุน (BE)</button></div>
    <table class="stat"><tbody>{#each v.positions as p}<tr><td class={p.buy ? 'up' : 'down'}>{p.buy ? 'BUY' : 'SELL'} {p.lot}</td><td>{p.at}</td><td data-pl={p.id} class={(p.pl as number) >= 0 ? 'up' : 'down'}>{p.plS}</td><td><button data-close={p.id} onclick={() => api.closePos(p.id)}>ปิด</button></td></tr>{/each}</tbody></table>
  {/if}
  {#if v.orders.length}
    <h4>คำสั่งรอ ({v.orders.length}) <button data-bulk="cancel" class="mini" onclick={() => api.bulk('cancel')}>ยกเลิกทั้งหมด</button></h4>
    <table class="stat"><tbody>{#each v.orders as o}<tr><td>{o.text}</td><td>{o.at}</td><td><button data-cancel={o.id} onclick={() => api.cancel(o.id)}>ยกเลิก</button></td></tr>{/each}</tbody></table>
  {/if}
  <h4>สถิติการฝึก ({v.st.n} ไม้)</h4>
  <div class="sum"><span>ชนะ</span><b>{v.st.win}</b><span>R เฉลี่ย</span><b>{v.st.avgR}</b><span>Profit factor</span><b>{v.st.pf}</b><span>กำไรรวม</span><b class={v.st.totalUp ? 'up' : 'down'}>{v.st.total}</b><span>Drawdown สูงสุด</span><b>{v.st.dd}</b></div>
  {#if v.byTag.length}
    <table class="stat"><thead><tr><th>แท็ก</th><th>ไม้</th><th>ชนะ</th><th>R เฉลี่ย</th></tr></thead><tbody>{#each v.byTag as t}<tr><td>{t.label}</td><td>{t.n}</td><td>{t.win}</td><td>{t.avgR}</td></tr>{/each}</tbody></table>
  {/if}
  {#if v.history.length}
    <h4>บันทึกการเทรด (ล่าสุด)</h4><div class="journal">{#each v.history as h}<div class="jr"><b class={h.up ? 'up' : 'down'}>{h.head}</b> {h.body}<br><span class="muted">{h.sub}</span></div>{/each}</div>
  {/if}
  <div class="btns"><button id="sim-csv" onclick={() => api.csv()}>ส่งออกบันทึก (CSV)</button><button id="sim-reset" class="danger" data-armed={armed ? '1' : null} onclick={reset}>{armed ? 'กดอีกครั้งเพื่อยืนยัน' : `รีเซ็ตบัญชี${v.mode === 'replay' ? ' Replay' : 'สด'}`}</button></div>
{/if}
