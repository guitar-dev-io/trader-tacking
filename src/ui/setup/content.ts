// Setup guide content (Phase 4): the steps' bodies are static HTML snippets (with a few live bits from ctx).
// Setup.svelte renders the chrome (cards, dots, nav, live status) and drops these in with {@html}.
// Buttons inside a body use data-act; the component handles them with one delegated click listener.
import { ICON } from '../../app/icons';
import { esc } from '../../app/app-core';

export interface SetupCtx { mobile: boolean; win: boolean; busy: boolean; lastRun: { ok: boolean; steps: { ok: boolean; t: string }[] } | null }
export interface SetupStep { h: string; body: () => string; check?: 'vcg' | 'mt5' }
export interface SetupPath { title: string; steps: SetupStep[] }
export type PathKey = 'install' | 'demo' | 'vcg' | 'mt5';

const REL = 'https://github.com/guitar-dev-io/trader-tacking/releases';
const MT5_DL = 'https://www.metatrader5.com/en/download';
const link = (u: string, t: string) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`;
const kbd = (t: string) => `<kbd>${t}</kbd>`;
const keys = (...k: string[]) => k.map(kbd).join(' + ');

export function makePaths(ctx: SetupCtx): Record<PathKey, SetupPath> {
  return {
    install: {
      title: 'ติดตั้งแอป',
      steps: [
        { h: 'Mac (M1–M4 และ Intel)', body: () => `
          <ol>
            <li>เปิด ${link(REL, 'หน้าดาวน์โหลด (GitHub Releases)')} แล้วเลือก build ล่าสุด</li>
            <li>Mac ชิป Apple (M1/M2/M3/M4) โหลดไฟล์ <b>…-arm64-mac.zip</b> · Mac Intel โหลด <b>…-x64-mac.zip</b>
              <small>เช็กชิปได้ที่ เมนู  → About This Mac · ถ้าโหลดผิดตัว แอปจะช้ามาก</small></li>
            <li>ดับเบิลคลิกไฟล์ zip แล้วลาก <b>Price Tracker</b> ไปไว้ในโฟลเดอร์ <b>Applications</b></li>
            <li>เปิดครั้งแรก: <b>คลิกขวา → Open → Open</b>
              <small>ถ้าขึ้นว่า "ไม่สามารถตรวจสอบผู้พัฒนาได้" ไปที่ System Settings → Privacy &amp; Security → เลื่อนลงกด <b>Open Anyway</b></small></li>
            <li>อัปเดตเวอร์ชันใหม่: โหลด zip ใหม่แล้วลากทับของเดิม (การตั้งค่าและ watchlist ยังอยู่)</li>
          </ol>` },
        { h: 'Windows 10 / 11', body: () => `
          <p>เปิด ${link(REL, 'หน้าดาวน์โหลด')} แล้วเลือก 1 แบบ:</p>
          <ul>
            <li><b>Price-Tracker-Setup-&lt;เวอร์ชัน&gt;.exe</b> — ตัวติดตั้ง <span class="su-tag">แนะนำ</span>
              <small>มีไอคอนในเมนู Start และเลือกให้เปิดอัตโนมัติเมื่อเปิดเครื่องได้</small></li>
            <li><b>Price-Tracker-portable-&lt;เวอร์ชัน&gt;.exe</b> — ไฟล์เดียว ไม่ต้องติดตั้ง
              <small>เก็บการตั้งค่าในโฟลเดอร์ <code>Price Tracker Data</code> ข้างไฟล์ exe · พกใส่ USB ได้</small></li>
            <li><b>…-win-x64.zip</b> — แตกไฟล์แล้วเปิด Price Tracker.exe</li>
          </ul>
          <p>ถ้าขึ้น <b>"Windows protected your PC"</b> (SmartScreen): กด <b>More info → Run anyway</b>
            <small class="muted">แอปยังไม่ได้ซื้อใบรับรอง Windows จึงขึ้นเตือน</small></p>` },
        { h: 'Android', body: () => `
          <ol>
            <li>เปิด ${link(REL, 'หน้าดาวน์โหลด')} บนมือถือ แล้วโหลดไฟล์ <b>.apk</b></li>
            <li>แตะไฟล์ที่โหลด → ถ้าขึ้น "ไม่อนุญาตให้ติดตั้งจากแหล่งนี้" แตะ <b>การตั้งค่า</b> → เปิด <b>อนุญาตจากแหล่งนี้</b> → กลับมาแตะ <b>ติดตั้ง</b></li>
            <li>ถ้า Play Protect เตือน แตะ <b>รายละเอียดเพิ่มเติม → ติดตั้งต่อไป</b> (แอปนี้ไม่ได้อยู่ใน Play Store จึงขึ้นเตือน)</li>
            <li>อัปเดต: โหลด .apk ใหม่แล้วติดตั้งทับ ไม่ต้องลบของเดิม</li>
          </ol>
          <p class="muted">บนมือถือใช้ราคาจาก VCG หรือ Demo ได้ · MT5 ใช้ได้เฉพาะบนคอม</p>` },
      ],
    },
    demo: {
      title: 'ฝึกด้วยข้อมูล Demo',
      steps: [{ h: 'ไม่ต้องสมัคร ไม่ต้อง login', body: () => `
        <p>ใช้กราฟตัวอย่างฝึกอ่านแท่งเทียน ตีเส้น วิเคราะห์ และฝึกเทรดจำลองได้ทุกอย่าง</p>
        <p class="muted">อยากได้ราคาจริงเมื่อไร กลับมาที่คู่มือนี้แล้วเลือก VCG หรือ MT5</p>
        <button class="su-primary" data-act="demo">เริ่มใช้ Demo</button>
        <button class="su-secondary" data-act="learn">${ICON.html('graduation-cap', 16)}เปิดศูนย์การเรียนรู้</button>` }],
    },
    vcg: {
      title: 'เชื่อมต่อ VCG Markets',
      steps: [
        { h: 'มีบัญชี VCG', body: () => `
          <p>ใช้บัญชีเดียวกับที่ login เว็บ VCG WebTrader (บัญชี demo ของ VCG ก็ได้)</p>
          <ul>
            <li>ยังไม่มีบัญชี → สมัครที่เว็บไซต์ VCG Markets ก่อน</li>
            <li><b>เคยสมัครด้วยปุ่ม Google?</b> ${ctx.mobile ? 'บนมือถือ Google ไม่อนุญาตให้ login ผ่านแอปอื่น ' : ''}ให้ไปที่เว็บ VCG กด <b>ลืมรหัสผ่าน</b> เพื่อตั้งรหัสผ่าน แล้วใช้ <b>อีเมล + รหัสผ่าน</b> แทน</li>
          </ul>` },
        { h: 'เข้าสู่ระบบ', body: () => `
          <ol>
            <li>กดปุ่มด้านล่าง ${ctx.mobile ? 'หน้า login ของ VCG จะเปิดเต็มจอ' : 'จะเปิดหน้าต่าง VCG WebTrader'}</li>
            <li>กรอก <b>อีเมล</b> และ <b>รหัสผ่าน</b> ของ VCG (ถ้ามีรหัส OTP ให้กรอกด้วย)</li>
            <li>${ctx.mobile ? 'login เสร็จหน้า login จะปิดให้เอง' : 'login เสร็จปิดหน้าต่างนั้นได้เลย แอปยังรับราคาต่อ'} · login ครั้งเดียว แอปจำไว้ให้</li>
          </ol>
          <p class="su-safe">${ICON.html('lock', 15)}รหัสผ่านกรอกในหน้าเว็บของ VCG เอง แอปนี้ไม่เห็นและไม่เก็บรหัสผ่านของคุณ</p>
          <button class="su-primary" data-act="vcg-login">${ICON.html('log-in', 18)}เข้าสู่ระบบ VCG</button>` , check: 'vcg' },
        { h: 'รับราคาสด', body: () => `
          <p>เมื่อสถานะเป็น ${ICON.html('circle-check', 15)} ราคาเข้าแล้ว ปิดคู่มือนี้แล้วเริ่มใช้งานได้เลย</p>
          <ul><li>ถ้ารอเกิน 1 นาที กด <b>เชื่อมต่อใหม่</b></li><li>ยังไม่ได้ → แท็บ <b>Log</b> แล้วส่งภาพให้ผู้พัฒนา</li></ul>
          <button data-act="vcg-retry">${ICON.html('refresh-cw', 15)}เชื่อมต่อใหม่</button>`, check: 'vcg' },
      ],
    },
    mt5: {
      title: 'เชื่อมต่อ MT5 (โบรกเกอร์ไหนก็ได้)',
      steps: [
        { h: 'ติดตั้ง MetaTrader 5', body: () => `
          <ol>
            <li>โหลด MT5 จาก ${link(MT5_DL, 'metatrader5.com')} หรือจากเว็บโบรกเกอร์ของคุณ</li>
            <li>${ctx.win ? 'Windows: เปิดไฟล์ติดตั้ง mt5setup.exe ตามขั้นตอน (ใช้ MT5 แบบ portable ก็ได้)' : 'Mac: เปิดไฟล์ .pkg ติดตั้งตามขั้นตอน (MT5 บน Mac รันผ่าน Wine ครั้งแรกจะช้าหน่อย)'}</li>
            <li><b>เปิด MT5 อย่างน้อย 1 ครั้ง</b> ให้มันสร้างโฟลเดอร์ข้อมูลก่อน</li>
          </ol>
          <p class="muted">แอปของเราอ่านราคาจาก MT5 ในเครื่องคุณ — ใช้ได้ทุกโบรกเกอร์ที่มี MT5 (ไม่ใช่ MT4)</p>` },
        { h: 'Login บัญชีโบรกเกอร์ใน MT5', body: () => `
          <ol>
            <li>ใน MT5 ไปที่เมนู <b>File → Login to Trade Account</b></li>
            <li>ถ้าไม่มีชื่อโบรกเกอร์: <b>File → Open an Account</b> → พิมพ์ชื่อโบรกเกอร์ (เช่น Brex, Exness, XM) → เลือก server ที่โบรกเกอร์แจ้งในอีเมล</li>
            <li>กรอก <b>เลขบัญชี (Login)</b>, <b>รหัสผ่าน</b> และเลือก <b>Server</b> → OK</li>
            <li>มุมขวาล่างของ MT5 ต้องขึ้นเป็นตัวเลข kb ไม่ใช่ "No connection"</li>
          </ol>
          <p class="su-safe">${ICON.html('shield-check', 15)}ใช้ <b>รหัสผ่านนักลงทุน (investor password)</b> ได้ — ดูราคาได้แต่ส่งออเดอร์ไม่ได้ ปลอดภัยกว่า · รหัสผ่านกรอกใน MT5 เท่านั้น แอปนี้ไม่เห็น</p>` },
        { h: 'อนุญาตให้ EA ส่งราคาให้แอป', body: () => `
          <ol>
            <li>ใน MT5 กด ${ctx.win ? keys('Ctrl', 'O') : keys('⌘', ',')} หรือเมนู <b>Tools → Options</b> → แท็บ <b>Expert Advisors</b></li>
            <li>ติ๊ก <b>Allow WebRequest for listed URL</b></li>
            <li>ดับเบิลคลิกช่อง "add new URL" แล้วพิมพ์ <code>http://127.0.0.1</code> → OK</li>
          </ol>
          <p class="muted">ไม่ต้องเปิด "Allow algorithmic trading" — EA นี้อ่านราคาอย่างเดียว ไม่ส่งออเดอร์</p>` },
        { h: 'ติด EA (อัตโนมัติ)', body: () => `
          <p>แอปจะคัดลอก EA, compile ให้ และเปิด MT5 พร้อม EA บนกราฟ</p>
          <ol><li><b>ปิด MT5 ก่อน</b> (${ctx.win ? keys('Alt', 'F4') : keys('⌘', 'Q')})</li><li>กดปุ่มด้านล่าง แล้วรอ MT5 เปิดขึ้นมา (10–30 วินาที)</li></ol>
          <button class="su-primary" data-act="mt5-launch" ${ctx.busy ? 'disabled' : ''}>${ctx.busy ? 'กำลังทำ…' : `${ICON.html('rocket', 18)}เปิด MT5 พร้อม EA`}</button>
          ${ctx.lastRun ? `<ul class="su-run">${ctx.lastRun.steps.map((x: { ok: boolean; t: string }) => `<li class="${x.ok ? 'ok' : 'bad'}">${ICON.html(x.ok ? 'check' : 'x', 14)}${esc(x.t)}</li>`).join('')}</ul>` : ''}
          <details ${ctx.lastRun && !ctx.lastRun.ok ? 'open' : ''}><summary>ทำเอง (ถ้าปุ่มอัตโนมัติไม่ได้ผล)</summary>
            <ol>
              <li><button data-act="mt5-install">คัดลอก EA ลง MT5</button></li>
              <li>ใน MT5: Navigator (${keys(ctx.win ? 'Ctrl' : '⌘', 'N')}) → คลิกขวา <b>Expert Advisors → Refresh</b></li>
              <li>ถ้าไม่เห็น PriceTrackerBridge: ดับเบิลคลิกไฟล์ใน MetaEditor แล้วกด <b>Compile</b> (F7)</li>
              <li>ลาก <b>PriceTrackerBridge</b> ไปวางบนกราฟไหนก็ได้ → OK (ห้ามปิดกราฟนั้น)</li>
            </ol></details>`, check: 'mt5' },
        { h: 'เสร็จแล้ว', body: () => `
          <p>เมื่อสถานะเป็น ${ICON.html('circle-check', 15)} ราคาจากโบรกเกอร์ของคุณจะเข้ามาที่แอป</p>
          <ul>
            <li>ชื่อ symbol ของโบรกเกอร์อาจมีคำต่อท้าย (เช่น XAUUSDm, XAUUSDbrex.) แอปจับคู่ให้เอง</li>
            <li>ไม่ต้องเปิด MT5 ค้างไว้เอง — แอปจะเปิด MT5 ให้แบบย่อหน้าต่างตอนเปิดแอป และปิดให้ตอนปิดแอป (ปิดได้ที่ การตั้งค่า → MT5) · อย่าปิดกราฟที่ติด EA ใน MT5</li>
            <li>เปลี่ยนกลับไป VCG ได้ที่แท็บราคา → แหล่งข้อมูล</li>
          </ul>`, check: 'mt5' },
      ],
    },
  };
}
