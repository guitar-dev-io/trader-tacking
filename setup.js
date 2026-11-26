/* global $, esc, toast, vcg, store, setSource, connStatus, S */
// Setup guide: install the app, pick a price source, log in (VCG or MT5) — with live checks.
const SETUP = (() => {
  const REL = 'https://github.com/guitar-dev-io/trader-tacking/releases';
  const MT5_DL = 'https://www.metatrader5.com/en/download';
  const isMobile = () => document.body.classList.contains('mobile') || !(vcg.capabilities && vcg.capabilities.mt5);
  let box = null, path = 'start', step = 0, timer = null, busy = false, lastRun = null;

  const st = () => (typeof connStatus !== 'undefined' && connStatus) || {};
  const live = {
    vcg: () => { const s = st(); return s.connected && S.source === 'vcg' ? { ok: true, t: 'ราคาจาก VCG เข้าแล้ว' } : s.loggedIn ? { t: 'login แล้ว กำลังรอราคา…' } : { t: 'ยังไม่ได้ login' }; },
    mt5: () => {
      const m = st().mt5 || {};
      if (!m.connected) return { t: S.source === 'mt5' ? 'รอ EA ใน MT5 เชื่อมต่อ (พอร์ต ' + (m.port || 7788) + ')' : 'ยังไม่ได้เลือก MT5 เป็นแหล่งราคา' };
      return { ok: true, t: 'เชื่อมต่อแล้ว: ' + (m.broker || 'MT5') + (m.server ? ' (' + m.server + ')' : '') + ' · ' + (m.symbols || []).length + ' symbol' };
    },
  };

  const link = (u, t) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`;
  const kbd = (t) => `<kbd>${t}</kbd>`;

  // ------------------------------------------------------------ content
  const PATHS = {
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
        <button class="su-primary" data-act="demo">เริ่มใช้ Demo</button>` }],
    },
    vcg: {
      title: 'เชื่อมต่อ VCG Markets',
      steps: [
        { h: 'มีบัญชี VCG', body: () => `
          <p>ใช้บัญชีเดียวกับที่ login เว็บ VCG WebTrader (บัญชี demo ของ VCG ก็ได้)</p>
          <ul>
            <li>ยังไม่มีบัญชี → สมัครที่เว็บไซต์ VCG Markets ก่อน</li>
            <li><b>เคยสมัครด้วยปุ่ม Google?</b> ${isMobile() ? 'บนมือถือ Google ไม่อนุญาตให้ login ผ่านแอปอื่น ' : ''}ให้ไปที่เว็บ VCG กด <b>ลืมรหัสผ่าน</b> เพื่อตั้งรหัสผ่าน แล้วใช้ <b>อีเมล + รหัสผ่าน</b> แทน</li>
          </ul>` },
        { h: 'เข้าสู่ระบบ', body: () => `
          <ol>
            <li>กดปุ่มด้านล่าง ${isMobile() ? 'หน้า login ของ VCG จะเปิดเต็มจอ' : 'จะเปิดหน้าต่าง VCG WebTrader'}</li>
            <li>กรอก <b>อีเมล</b> และ <b>รหัสผ่าน</b> ของ VCG (ถ้ามีรหัส OTP ให้กรอกด้วย)</li>
            <li>${isMobile() ? 'login เสร็จหน้า login จะปิดให้เอง' : 'login เสร็จปิดหน้าต่างนั้นได้เลย แอปยังรับราคาต่อ'} · login ครั้งเดียว แอปจำไว้ให้</li>
          </ol>
          <p class="su-safe">🔒 รหัสผ่านกรอกในหน้าเว็บของ VCG เอง แอปนี้ไม่เห็นและไม่เก็บรหัสผ่านของคุณ</p>
          <button class="su-primary" data-act="vcg-login">🔐 เข้าสู่ระบบ VCG</button>` , check: 'vcg' },
        { h: 'รับราคาสด', body: () => `
          <p>เมื่อสถานะเป็น ✅ ราคาเข้าแล้ว ปิดคู่มือนี้แล้วเริ่มใช้งานได้เลย</p>
          <ul><li>ถ้ารอเกิน 1 นาที กด <b>เชื่อมต่อใหม่</b></li><li>ยังไม่ได้ → แท็บ <b>Log</b> แล้วส่งภาพให้ผู้พัฒนา</li></ul>
          <button data-act="vcg-retry">↻ เชื่อมต่อใหม่</button>`, check: 'vcg' },
      ],
    },
    mt5: {
      title: 'เชื่อมต่อ MT5 (โบรกเกอร์ไหนก็ได้)',
      steps: [
        { h: 'ติดตั้ง MetaTrader 5', body: () => `
          <ol>
            <li>โหลด MT5 จาก ${link(MT5_DL, 'metatrader5.com')} หรือจากเว็บโบรกเกอร์ของคุณ</li>
            <li>Mac: เปิดไฟล์ .pkg ติดตั้งตามขั้นตอน (MT5 บน Mac รันผ่าน Wine ครั้งแรกจะช้าหน่อย)</li>
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
          <p class="su-safe">🔒 ใช้ <b>รหัสผ่านนักลงทุน (investor password)</b> ได้ — ดูราคาได้แต่ส่งออเดอร์ไม่ได้ ปลอดภัยกว่า · รหัสผ่านกรอกใน MT5 เท่านั้น แอปนี้ไม่เห็น</p>` },
        { h: 'อนุญาตให้ EA ส่งราคาให้แอป', body: () => `
          <ol>
            <li>ใน MT5 กด ${kbd('⌘')} + ${kbd(',')} หรือเมนู <b>Tools → Options</b> → แท็บ <b>Expert Advisors</b></li>
            <li>ติ๊ก <b>Allow WebRequest for listed URL</b></li>
            <li>ดับเบิลคลิกช่อง "add new URL" แล้วพิมพ์ <code>http://127.0.0.1</code> → OK</li>
          </ol>
          <p class="muted">ไม่ต้องเปิด "Allow algorithmic trading" — EA นี้อ่านราคาอย่างเดียว ไม่ส่งออเดอร์</p>` },
        { h: 'ติด EA (อัตโนมัติ)', body: () => `
          <p>แอปจะคัดลอก EA, compile ให้ และเปิด MT5 พร้อม EA บนกราฟ</p>
          <ol><li><b>ปิด MT5 ก่อน</b> (${kbd('⌘')} + ${kbd('Q')})</li><li>กดปุ่มด้านล่าง แล้วรอ MT5 เปิดขึ้นมา (10–30 วินาที)</li></ol>
          <button class="su-primary" data-act="mt5-launch" ${busy ? 'disabled' : ''}>${busy ? 'กำลังทำ…' : '🚀 เปิด MT5 พร้อม EA'}</button>
          ${lastRun ? `<ul class="su-run">${lastRun.steps.map((x) => `<li class="${x.ok ? 'ok' : 'bad'}">${x.ok ? '✓' : '✗'} ${esc(x.t)}</li>`).join('')}</ul>` : ''}
          <details ${lastRun && !lastRun.ok ? 'open' : ''}><summary>ทำเอง (ถ้าปุ่มอัตโนมัติไม่ได้ผล)</summary>
            <ol>
              <li><button data-act="mt5-install">คัดลอก EA ลง MT5</button></li>
              <li>ใน MT5: Navigator (${kbd('⌘')} + ${kbd('N')}) → คลิกขวา <b>Expert Advisors → Refresh</b></li>
              <li>ถ้าไม่เห็น PriceTrackerBridge: ดับเบิลคลิกไฟล์ใน MetaEditor แล้วกด <b>Compile</b> (F7)</li>
              <li>ลาก <b>PriceTrackerBridge</b> ไปวางบนกราฟไหนก็ได้ → OK (ห้ามปิดกราฟนั้น)</li>
            </ol></details>`, check: 'mt5' },
        { h: 'เสร็จแล้ว', body: () => `
          <p>เมื่อสถานะเป็น ✅ ราคาจากโบรกเกอร์ของคุณจะเข้ามาที่แอป</p>
          <ul>
            <li>ชื่อ symbol ของโบรกเกอร์อาจมีคำต่อท้าย (เช่น XAUUSDm, XAUUSDbrex.) แอปจับคู่ให้เอง</li>
            <li>ต้องเปิด MT5 ค้างไว้ และอย่าปิดกราฟที่ติด EA — ปิดแล้วราคาหยุด</li>
            <li>เปลี่ยนกลับไป VCG ได้ที่แท็บราคา → แหล่งข้อมูล</li>
          </ul>`, check: 'mt5' },
      ],
    },
  };

  // ------------------------------------------------------------ render
  function startHtml() {
    const mob = isMobile(), s = st();
    const cur = S.source === 'mt5' ? live.mt5() : S.source === 'vcg' ? live.vcg() : { t: 'ใช้ข้อมูล Demo' };
    const card = (p, icon, t, sub, dis) => `<button class="su-card" data-path="${p}" ${dis ? 'disabled' : ''}><i>${icon}</i><span><b>${t}</b><small>${sub}</small></span></button>`;
    return `<h2>เริ่มต้นใช้งาน Price Tracker</h2>
      <p class="muted">เลือกว่าจะเอาราคามาจากไหน · เปลี่ยนทีหลังได้เสมอ</p>
      <div class="su-now ${cur.ok ? 'ok' : ''}">สถานะตอนนี้: ${esc(cur.t)}${s.version ? ' · v' + esc(s.version) : ''}</div>
      ${card('demo', '🎓', 'ฝึก / เรียน (Demo)', 'ไม่ต้องสมัคร ไม่ต้อง login · เริ่มได้ทันที')}
      ${card('vcg', '🟢', 'VCG Markets', 'login ด้วยอีเมล + รหัสผ่านของ VCG · ใช้ได้ทั้ง Mac และ Android')}
      ${card('mt5', '🔵', 'MT5 โบรกเกอร์ของฉัน', mob ? 'ใช้ได้เฉพาะแอปบนคอม (Mac/Windows)' : 'Exness, XM, Brex ฯลฯ · ราคาและสเปรดตรงกับบัญชีจริง', mob)}
      <div class="su-sec">ยังไม่ได้ติดตั้ง หรืออยากอัปเดต?</div>
      ${card('install', '⬇️', 'วิธีติดตั้งแอป', 'Mac (zip) และ Android (apk) · แก้ปัญหาเปิดครั้งแรกไม่ได้')}`;
  }
  function pathHtml() {
    const P = PATHS[path], s = P.steps[step], n = P.steps.length;
    const chk = s.check ? live[s.check]() : null;
    return `<h2>${P.title}</h2>
      ${n > 1 ? `<div class="su-dots">${P.steps.map((x, i) => `<button class="${i < step ? 'done' : i === step ? 'now' : ''}" data-step="${i}" title="${esc(x.h)}">${i < step ? '✓' : i + 1}</button>`).join('<i></i>')}</div>` : ''}
      <h3>${n > 1 ? `ขั้นที่ ${step + 1}: ` : ''}${s.h}</h3>
      <div class="su-body">${s.body()}</div>
      ${chk ? `<div class="su-now ${chk.ok ? 'ok' : ''}">${chk.ok ? '✅' : '⏳'} ${esc(chk.t)}</div>` : ''}
      <div class="su-nav"><button data-nav="back">‹ ${step ? 'ย้อนกลับ' : 'เลือกใหม่'}</button>
        ${step < n - 1 ? '<button class="su-next" data-nav="next">ถัดไป ›</button>' : path === 'demo' ? '' : '<button class="su-next" data-nav="done">เสร็จแล้ว ✓</button>'}</div>`;
  }
  function render() {
    if (!box) return;
    const html = `<div class="su-card-wrap"><button class="su-x" data-nav="close" aria-label="ปิด">✕</button>${path === 'start' ? startHtml() : pathHtml()}</div>`;
    if (html === box._html) return;
    const sc = box.querySelector('.su-card-wrap'), top = sc ? sc.scrollTop : 0, open = box.querySelector('details[open]');
    box._html = html; box.innerHTML = html;
    if (open && box.querySelector('details')) box.querySelector('details').open = true;
    box.querySelector('.su-card-wrap').scrollTop = top;
  }
  async function act(a) {
    if (a === 'demo') { setSource('demo'); close(true); toast('ใช้ข้อมูล Demo แล้ว', 'ok'); }
    else if (a === 'vcg-login') { if (S.source !== 'vcg') setSource('vcg'); const ok = vcg.showTrader(); vcg.log('info', 'คู่มือ: เปิดหน้า login VCG', null, 'auth'); if (ok === false) toast('เปิดหน้า login ไม่ได้ — ดูแท็บ Log', 'error'); }
    else if (a === 'vcg-retry') { vcg.reloadTrader(); toast('กำลังเชื่อมต่อใหม่…', 'info'); }
    else if (a === 'mt5-install') {
      if (!vcg.mt5InstallEA) return toast('ใช้ได้เฉพาะแอปบนคอม', 'warn');
      const r = await vcg.mt5InstallEA();
      toast(r.installed.length ? 'คัดลอก EA ลง MT5 แล้ว' : 'ไม่พบ MT5 ในเครื่อง — เปิด MT5 1 ครั้งก่อน', r.installed.length ? 'ok' : 'warn', 6000);
    } else if (a === 'mt5-launch') {
      if (!vcg.mt5Launch) return toast('ต้องอัปเดตแอปบนคอมเป็นเวอร์ชันล่าสุด', 'warn');
      if (S.source !== 'mt5') setSource('mt5');
      busy = true; render();
      try { lastRun = await vcg.mt5Launch({}); } catch (e) { lastRun = { ok: false, steps: [{ ok: false, t: String(e.message || e) }] }; }
      busy = false; box._html = null; render();
      toast(lastRun.ok ? 'กำลังเปิด MT5 พร้อม EA' : 'ยังไม่สำเร็จ — ดูรายการในคู่มือ', lastRun.ok ? 'ok' : 'warn', 6000);
    }
  }
  function onClick(e) {
    const b = e.target.closest('button,[data-path]'); if (!b || b.disabled) return;
    if (b.dataset.path) { path = b.dataset.path; step = 0; lastRun = null; }
    else if (b.dataset.step) step = +b.dataset.step;
    else if (b.dataset.nav === 'close') return close(true);
    else if (b.dataset.nav === 'done') return close(true);
    else if (b.dataset.nav === 'next') step++;
    else if (b.dataset.nav === 'back') { if (step) step--; else path = 'start'; }
    else if (b.dataset.act) return act(b.dataset.act);
    else return;
    box._html = null; render();
  }

  function open(p = 'start', s = 0) {
    if (!box) {
      box = document.createElement('div'); box.id = 'setup';
      document.body.appendChild(box);
      box.addEventListener('click', (e) => { if (e.target === box) close(true); else onClick(e); });
    }
    path = PATHS[p] ? p : 'start'; step = s; box._html = null;
    box.classList.remove('hidden'); render();
    clearInterval(timer); timer = setInterval(render, 1000);
    if (vcg.log) vcg.log('info', 'เปิดคู่มือเริ่มต้น: ' + path, null, 'ui');
  }
  function close(done) {
    if (!box) return;
    box.classList.add('hidden'); clearInterval(timer);
    if (done) store.set('setupDone', 1);
  }
  const isOpen = () => !!box && !box.classList.contains('hidden');

  // First run: show the guide once if nothing is connected yet.
  setTimeout(() => { if (!store.get('setupDone', 0) && !st().overlay && !st().connected && !(st().mt5 || {}).connected && !S.replay) open(); }, 3500);

  return { open, close, isOpen, PATHS };
})();
window.SETUP = SETUP;
