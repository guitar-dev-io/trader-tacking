/* global $, esc, toast, vcg, store, setSource, connStatus, S, ICON */
// Setup guide: install the app, pick a price source, log in (VCG or MT5) — with live checks.
// Windows or macOS? (the desktop preload tags <html> with os-win32 / os-darwin)
function isWin() { const c = document.documentElement.classList; return (typeof vcg !== 'undefined' && vcg.os === 'win32') || c.contains('os-win32') || (!c.contains('os-darwin') && /^Win/i.test(navigator.platform || '')); }
// "⌘," → "Ctrl+," on Windows, for shortcut hints in UI text
function osKeys(t) { return isWin() ? String(t).replace(/⇧⌘/g, 'Ctrl+Shift+').replace(/⌘/g, 'Ctrl+') : t; }
window.isWin = isWin; window.osKeys = osKeys;

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
  const keys = (...k) => k.map(kbd).join(' + ');
  const win = () => isWin();

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
            <li><b>เคยสมัครด้วยปุ่ม Google?</b> ${isMobile() ? 'บนมือถือ Google ไม่อนุญาตให้ login ผ่านแอปอื่น ' : ''}ให้ไปที่เว็บ VCG กด <b>ลืมรหัสผ่าน</b> เพื่อตั้งรหัสผ่าน แล้วใช้ <b>อีเมล + รหัสผ่าน</b> แทน</li>
          </ul>` },
        { h: 'เข้าสู่ระบบ', body: () => `
          <ol>
            <li>กดปุ่มด้านล่าง ${isMobile() ? 'หน้า login ของ VCG จะเปิดเต็มจอ' : 'จะเปิดหน้าต่าง VCG WebTrader'}</li>
            <li>กรอก <b>อีเมล</b> และ <b>รหัสผ่าน</b> ของ VCG (ถ้ามีรหัส OTP ให้กรอกด้วย)</li>
            <li>${isMobile() ? 'login เสร็จหน้า login จะปิดให้เอง' : 'login เสร็จปิดหน้าต่างนั้นได้เลย แอปยังรับราคาต่อ'} · login ครั้งเดียว แอปจำไว้ให้</li>
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
            <li>${win() ? 'Windows: เปิดไฟล์ติดตั้ง mt5setup.exe ตามขั้นตอน (ใช้ MT5 แบบ portable ก็ได้)' : 'Mac: เปิดไฟล์ .pkg ติดตั้งตามขั้นตอน (MT5 บน Mac รันผ่าน Wine ครั้งแรกจะช้าหน่อย)'}</li>
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
            <li>ใน MT5 กด ${win() ? keys('Ctrl', 'O') : keys('⌘', ',')} หรือเมนู <b>Tools → Options</b> → แท็บ <b>Expert Advisors</b></li>
            <li>ติ๊ก <b>Allow WebRequest for listed URL</b></li>
            <li>ดับเบิลคลิกช่อง "add new URL" แล้วพิมพ์ <code>http://127.0.0.1</code> → OK</li>
          </ol>
          <p class="muted">ไม่ต้องเปิด "Allow algorithmic trading" — EA นี้อ่านราคาอย่างเดียว ไม่ส่งออเดอร์</p>` },
        { h: 'ติด EA (อัตโนมัติ)', body: () => `
          <p>แอปจะคัดลอก EA, compile ให้ และเปิด MT5 พร้อม EA บนกราฟ</p>
          <ol><li><b>ปิด MT5 ก่อน</b> (${win() ? keys('Alt', 'F4') : keys('⌘', 'Q')})</li><li>กดปุ่มด้านล่าง แล้วรอ MT5 เปิดขึ้นมา (10–30 วินาที)</li></ol>
          <button class="su-primary" data-act="mt5-launch" ${busy ? 'disabled' : ''}>${busy ? 'กำลังทำ…' : `${ICON.html('rocket', 18)}เปิด MT5 พร้อม EA`}</button>
          ${lastRun ? `<ul class="su-run">${lastRun.steps.map((x) => `<li class="${x.ok ? 'ok' : 'bad'}">${ICON.html(x.ok ? 'check' : 'x', 14)}${esc(x.t)}</li>`).join('')}</ul>` : ''}
          <details ${lastRun && !lastRun.ok ? 'open' : ''}><summary>ทำเอง (ถ้าปุ่มอัตโนมัติไม่ได้ผล)</summary>
            <ol>
              <li><button data-act="mt5-install">คัดลอก EA ลง MT5</button></li>
              <li>ใน MT5: Navigator (${keys(win() ? 'Ctrl' : '⌘', 'N')}) → คลิกขวา <b>Expert Advisors → Refresh</b></li>
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

  // ------------------------------------------------------------ render
  function startHtml() {
    const mob = isMobile(), s = st();
    const cur = S.source === 'mt5' ? live.mt5() : S.source === 'vcg' ? live.vcg() : { t: 'ใช้ข้อมูล Demo' };
    const card = (p, icon, t, sub, dis) => `<button class="su-card" data-path="${p}" ${dis ? 'disabled' : ''}><i>${ICON.svg(icon, 24)}</i><span><b>${t}</b><small>${sub}</small></span></button>`;
    return `<h2>เริ่มต้นใช้งาน Price Tracker</h2>
      <p class="muted">เลือกว่าจะเอาราคามาจากไหน · เปลี่ยนทีหลังได้เสมอ</p>
      <div class="su-now ${cur.ok ? 'ok' : ''}">สถานะตอนนี้: ${esc(cur.t)}${s.version ? ' · v' + esc(s.version) : ''}</div>
      ${card('demo', 'graduation-cap', 'ฝึก / เรียน (Demo)', 'ไม่ต้องสมัคร ไม่ต้อง login · เริ่มได้ทันที')}
      ${card('vcg', 'globe', 'VCG Markets', 'login ด้วยอีเมล + รหัสผ่านของ VCG · ใช้ได้ทั้ง Mac และ Android')}
      ${card('mt5', 'monitor', 'MT5 โบรกเกอร์ของฉัน', mob ? 'ใช้ได้เฉพาะแอปบนคอม (Mac/Windows)' : 'Exness, XM, Brex ฯลฯ · EA อ่านอย่างเดียว ส่งออเดอร์ไม่ได้ — ดูออเดอร์/โพซิชันของตัวเองได้', mob)}
      <div class="su-sec">ยังไม่ได้ติดตั้ง หรืออยากอัปเดต?</div>
      ${card('install', 'download', 'วิธีติดตั้งแอป', 'Mac (zip) และ Android (apk) · แก้ปัญหาเปิดครั้งแรกไม่ได้')}
      <p class="su-ro">${ICON.html('shield-check', 15)}แอปนี้<b>อ่านและแสดงราคาเท่านั้น</b> ไม่ส่งคำสั่งซื้อขาย · ผลวิเคราะห์มีไว้เพื่อการเรียนรู้ ไม่ใช่คำแนะนำการลงทุน</p>`;
  }
  function pathHtml() {
    const P = PATHS[path], s = P.steps[step], n = P.steps.length;
    const chk = s.check ? live[s.check]() : null;
    return `<h2>${P.title}</h2>
      ${n > 1 ? `<div class="su-dots">${P.steps.map((x, i) => `<button class="${i < step ? 'done' : i === step ? 'now' : ''}" data-step="${i}" title="${esc(x.h)}">${i < step ? ICON.svg('check', 14) : i + 1}</button>`).join('<i></i>')}</div>` : ''}
      <h3>${n > 1 ? `ขั้นที่ ${step + 1}: ` : ''}${s.h}</h3>
      <div class="su-body">${s.body()}</div>
      ${chk ? `<div class="su-now ${chk.ok ? 'ok' : ''}">${ICON.html(chk.ok ? 'circle-check' : 'hourglass', 16)}${esc(chk.t)}</div>` : ''}
      <div class="su-nav"><button data-nav="back">‹ ${step ? 'ย้อนกลับ' : 'เลือกใหม่'}</button>
        ${step < n - 1 ? '<button class="su-next" data-nav="next">ถัดไป ›</button>' : path === 'demo' ? '' : '<button class="su-next" data-nav="done">เสร็จแล้ว ' + ICON.svg('check', 15) + '</button>'}</div>`;
  }
  function render() {
    if (!box) return;
    const html = `<div class="su-card-wrap"><button class="su-x" data-nav="close" aria-label="ปิด">${ICON.svg('x', 18)}</button>${path === 'start' ? startHtml() : pathHtml()}</div>`;
    if (html === box._html) return;
    const sc = box.querySelector('.su-card-wrap'), top = sc ? sc.scrollTop : 0, open = box.querySelector('details[open]');
    box._html = html; box.innerHTML = html;
    if (open && box.querySelector('details')) box.querySelector('details').open = true;
    box.querySelector('.su-card-wrap').scrollTop = top;
  }
  async function act(a) {
    if (a === 'demo') { setSource('demo'); close(true); toast('ใช้ข้อมูล Demo แล้ว', 'ok'); }
    else if (a === 'learn') { if (S.source !== 'demo' && !st().connected) setSource('demo'); close(true); if (window.LEARN) LEARN.open(); }
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
    if (b.dataset.path) { path = b.dataset.path; step = path === 'install' ? (document.body.classList.contains('mobile') ? 2 : isWin() ? 1 : 0) : 0; lastRun = null; }
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

// ------------------------------------------------------------ source pill in the watchlist panel + ⌘ → Ctrl on Windows
const SRC_UI = (() => {
  const st = () => (typeof connStatus !== 'undefined' && connStatus) || {};
  function info() {
    const s = st(), m = s.mt5 || {}, nq = Object.keys(S.quotes || {}).length;
    if (S.source === 'demo') return { cls: 'ok', t: 'Demo · Binance (ฝึก)', hint: '' };
    if (S.source === 'mt5') {
      if (!m.connected) return { cls: 'wait', t: 'MT5 · รอ EA เชื่อมต่อ', hint: 'เปิด MT5 แล้วติด EA PriceTrackerBridge บนกราฟ — กดที่ป้าย → วิธีเชื่อมต่อ' };
      const unk = (m.unknown || []);
      return { cls: nq ? 'ok' : 'wait', t: 'MT5 · ' + (m.broker || 'เชื่อมต่อแล้ว'),
        hint: unk.length ? `ไม่พบใน MT5: ${unk.join(', ')} — โบรกเกอร์นี้ใช้ชื่อเช่น ${(m.symbols || [])[0] || 'XAUUSD.m'} (แอปจับคู่ให้เองในเวอร์ชันใหม่)` : nq ? '' : 'Bid / Ask จะขึ้นเมื่อมี tick แรก · ช่วงตลาดปิดจะเป็น —' };
    }
    if (s.connected) return { cls: nq ? 'ok' : 'wait', t: 'VCG · ' + (nq ? 'ราคาสด' : 'รอ tick แรก'), hint: nq ? '' : 'Bid / Ask จะขึ้นเมื่อมี tick แรก · ช่วงตลาดปิดจะเป็น —' };
    return { cls: s.loggedIn ? 'wait' : 'bad', t: 'VCG · ' + (s.loggedIn ? 'กำลังเชื่อมต่อ…' : 'ยังไม่ได้ login'), hint: s.loggedIn ? '' : 'กดที่ป้ายด้านบน → วิธีเชื่อมต่อ / login' };
  }
  // pill menu: switch source / open the guide
  function menu() {
    let m = document.getElementById('src-menu');
    if (m) { m.remove(); return; }
    const pill = document.getElementById('src-pill'), r = pill.getBoundingClientRect();
    const cap = vcg.capabilities || {};
    const it = (k, icon, t, sub, dis) => `<button role="menuitemradio" aria-checked="${S.source === k}" data-src="${k}" ${dis ? 'disabled' : ''}><i>${ICON.svg(icon, 20)}</i><span><b>${t}</b><small>${sub}</small></span>${S.source === k ? '<em>' + ICON.svg('check', 16) + '</em>' : ''}</button>`;
    m = document.createElement('div'); m.id = 'src-menu'; m.setAttribute('role', 'menu');
    m.innerHTML = it('vcg', 'globe', 'VCG Markets', 'ราคาจริงจากบัญชี VCG', !cap.vcg)
      + (cap.mt5 ? it('mt5', 'monitor', 'MT5 โบรกเกอร์ของฉัน', 'EA อ่านอย่างเดียว ส่งออเดอร์ไม่ได้') : '')
      + it('demo', 'graduation-cap', 'Demo (ฝึก)', 'ไม่ต้อง login')
      + '<hr><button data-src="guide"><i>' + ICON.svg('book-open', 20) + '</i><span><b>วิธีเชื่อมต่อ / login</b><small>คู่มือเริ่มต้นทีละขั้น</small></span></button>';
    document.body.appendChild(m);
    const w = 260; m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px'; m.style.top = (r.bottom + 6) + 'px';
    m.onclick = (e) => {
      const b = e.target.closest('[data-src]'); if (!b || b.disabled) return;
      m.remove();
      if (b.dataset.src === 'guide') SETUP.open(S.source === 'mt5' ? 'mt5' : S.source === 'demo' ? 'start' : 'vcg', S.source === 'vcg' ? 1 : 0);
      else if (b.dataset.src !== S.source) setSource(b.dataset.src);
    };
    setTimeout(() => document.addEventListener('click', function off(e) { if (!m.contains(e.target) && e.target !== pill) { m.remove(); } document.removeEventListener('click', off, true); }, true), 0);
  }
  function render() {
    const pill = document.getElementById('src-pill'); if (!pill) return;
    if (!pill._wired) { pill._wired = 1; pill.onclick = (e) => { e.stopPropagation(); menu(); }; }
    const i = info(), cls = 'src-pill ' + i.cls;
    if (pill.className !== cls) pill.className = cls;
    if (pill.textContent !== i.t) pill.textContent = i.t;
    const h = document.getElementById('src-hint'); if (h && h.textContent !== i.hint) h.textContent = i.hint;
  }
  function osText() {
    if (!isWin()) return;
    document.querySelectorAll('[title*="⌘"]').forEach((e) => { e.title = osKeys(e.title); });
  }
  setTimeout(() => { render(); osText(); }, 0);
  setInterval(render, 1000);
  return { render, info, menu };
})();
window.SRC_UI = SRC_UI;
