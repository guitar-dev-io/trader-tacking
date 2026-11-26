# trader-tacking — Price Tracker

แอป **macOS (Electron)** และ **Android (Capacitor)** สำหรับดูราคาสด กราฟ ฝึกเทรด และวิเคราะห์ Price Action จาก **VCG Markets WebTrader** — วาดโซนได้ไม่จำกัด เหมาะสำหรับฝึกอ่านโครงสร้างตลาด

> ⚠️ เครื่องมือเพื่อการเรียนรู้ ไม่ใช่คำแนะนำการลงทุน · ไม่ได้มีส่วนเกี่ยวข้องกับ VCG Markets · ตรวจสอบข้อตกลงการใช้งานของโบรกเกอร์ก่อนใช้

- **หาจุดเด้ง / จุดเข้าซื้อ-ขาย** (แท็บวิเคราะห์): โซน OB · FVG · แนวรับ/ต้าน · Fibo golden pocket จัดอันดับ ★ พร้อม Entry/SL/TP, สถานะรอ/ในโซน/ยืนยัน, สถิติเด้งย้อนหลัง, จุด SL เม่า (Equal Highs/Lows, PDH/PDL) + การกวาด (sweep), Fibo อัตโนมัติ + เครื่องมือ Fibo extension (161.8 / 261.8), SL เป็นจุด, แบ่งไม้ในโซน / Pyramid, แจ้งเตือน, ส่งไปคำนวณ lot / คำสั่งฝึก

## ความสามารถ

- **ราคาสด** bid/ask ทุก tick, watchlist, ราคาบนแถบเมนู macOS, บันทึก CSV
- **กราฟ** (TradingView Lightweight Charts): แท่งเทียน / Heikin Ashi / Bars / Line / Area, 1m–1W, โหลดย้อนหลังอัตโนมัติ
- **อินดิเคเตอร์**: SMA, EMA, WMA, Bollinger, Donchian, Keltner, RSI, MACD, Stochastic, ATR, CCI + **เขียน indicator เองด้วย JavaScript**
- **เครื่องมือวาด**: Trend, Ray, H/V line, Parallel channel, Fibonacci, Rectangle, Brush, Long/Short position, Text, Arrow, Measure — ลาก/แก้ไข, ล็อก, ซ่อน, Object tree, Undo/Redo
- **วิเคราะห์อัตโนมัติ**: Swing (HH/HL/LH/LL + จำนวนแท่งต่อขา), BOS/CHoCH, แนวรับ/ต้าน, แพทเทิร์นแท่งเทียน, TD Sequential, สัญญาณ Entry/SL/TP พร้อมเหตุผล
- **โหมดเรียนรู้**: ทดสอบย้อนหลังแบบ walk-forward (ไม่มี look-ahead) แยกสถิติตาม setup × แพทเทิร์น
- **เครื่องคำนวณ**: lot จาก % ความเสี่ยง, จุดเติมไม้ (เฉลี่ยต้นทุน / Pyramid), ต้นทุนเฉลี่ย, P/L ที่ SL/TP
- **ช่วงเวลาตลาด** Sydney / Tokyo / London / New York (รองรับ DST) + เลือก timezone ของกราฟ
- **แจ้งเตือน**: ราคา, สัญญาณใหม่, เน็ตช้า/ราคาค้าง/หลุด → macOS Notification, Telegram, Webhook (Discord/Slack/n8n…)
- **Local API** (REST + Server-Sent Events) + หน้า dashboard ที่ `http://127.0.0.1:8787`
- **Log viewer** ในแอป + ไฟล์ log, สำรอง/กู้คืน/รีเซ็ตข้อมูล
- **หนังสือบทเรียน** 54 บท แบ่ง 7 หมวด + ค้นหา: พื้นฐานการอ่านกราฟ, แท่งเทียนแต่ละแบบ (มีภาพประกอบ), โครงสร้างราคา, คู่มือ Demand & Supply (RBR/DBR/DBD/RBD, ตีโซน, ให้คะแนนโซน, วิธีเข้า, ตัวอย่างเต็ม XAUUSD), SL เม่า / Fibo, บริหารเงิน, วิธีใช้แอป
- **ฝึกเทรด**: Bar Replay (เล่นทีละแท่งโดยไม่เห็นอนาคต), บัญชีจำลอง (Market/Limit/Stop + SL/TP), สุ่มโจทย์ฝึกพร้อมให้คะแนน, บันทึกการเทรด + สถิติตามแท็ก, ส่งออก CSV
- **แพ็กบทเรียน**: ส่งออก/นำเข้ารูปวาด + โน้ต + จุดเริ่ม Replay เพื่อแชร์ให้ผู้เรียน
- **MT5 (โบรกเกอร์ใดก็ได้ เช่น Brex Capital)**: EA `mt5/PriceTrackerBridge.mq5` ส่งราคา/แท่งเทียนจาก MT5 ที่ login อยู่ในเครื่องเข้าแอปผ่าน TCP 127.0.0.1 (อ่านอย่างเดียว ไม่ส่งคำสั่ง) — Mac/Windows เท่านั้น
- **ข้อมูล Demo (Binance)** สำหรับฝึกโดยไม่ต้องมีบัญชี VCG (XAUUSD ใช้ PAXG แทน)
- ปฏิทินข่าวเศรษฐกิจ (Forex Factory) + เตือนก่อนข่าวแรง 15 นาที, แคชแท่งเทียนในเครื่อง, ตรวจเวอร์ชันใหม่จาก GitHub Releases
- **ดูหลาย Timeframe (Mac)**: กราฟ TF ใหญ่ข้างกราฟหลัก + โซน/สวิงของ TF ใหญ่บนกราฟหลัก + แถบบอกช่วงที่กราฟหลักกำลังดู + เทรนด์ทั้งสอง TF (บนมือถือใช้กราฟเดียวแบบปกติ)
- ซ่อน/แสดงทุกแผงได้, หน้าจอมือถือ + ระบบสัมผัส

## วิธีทำงาน

VCG WebTrader สตรีมราคาผ่าน Socket.IO (`wss://prod-ws-server.anttix.app`, namespace `/symbol`, `/chart-history`) โดยใช้ token จากการ login ที่มีอายุ 15 นาที
แอปจึงเปิด WebTrader จริงในหน้าต่างที่ซ่อนไว้ (ให้เว็บจัดการ login และต่ออายุ token เอง) แล้ว:

- อ่าน WebSocket frame ของราคาผ่าน Chrome DevTools Protocol (`main.js`)
- เปิด connection `/chart-history` เพิ่มภายในหน้าเว็บเดียวกัน โดยขอ token ใหม่จากตัวขอ token ของเว็บเมื่อเจอ `PERMISSION_DENIED`

| ไฟล์ | หน้าที่ |
|---|---|
| `main.js` | process หลัก: หน้าต่าง, feed ราคา, token, network monitor, IPC |
| `api.js` / `notify.js` / `logger.js` | Local API + SSE, Webhook/Telegram, log |
| `app-core.js` | ค่าคงที่, storage, state กลาง (S), ตัวช่วยจัดรูปแบบ |
| `app-chart.js` | กราฟหลัก, อินดิเคเตอร์, legend, ตัวแก้ไขสคริปต์ |
| `app-analysis.js` | เมนู/แผงวิเคราะห์โครงสร้าง, แจ้งเตือนสัญญาณ |
| `app-bounce.js` | แผงจุดเด้ง, จุด SL เม่า, Fibo อัตโนมัติ (วาดบนกราฟ) |
| `app-data.js` | โหลดกราฟ, ราคาสด/watchlist, สถานะ, alert ราคา |
| `app-overlay.js` | ตัวช่วยวาด SVG + แปลงพิกัด, ป้ายไม่ซ้อนกัน |
| `app.js` | แท็บ, หนังสือบทเรียน, log, เริ่มต้นแอป (โหลดท้ายสุด) |
| `draw.js` | เครื่องมือวาด, แถบซูม, แถบล่าง (ช่วงเวลา/session/scale), ตั้งค่ากราฟ |
| `analysis.js` | engine วิเคราะห์ (swing, structure, patterns, signals, backtest) |
| `bounce.js` | engine จุดเด้ง / liquidity / สถิติ walk-forward |
| `indicators.js` / `custom.js` | อินดิเคเตอร์ในตัว / runtime สคริปต์ผู้ใช้ |
| `planner.js` | เครื่องคำนวณ lot และจุดเติม |
| `settings.js` | หน้าต่างตั้งค่า, สถานะเครือข่าย, toast, backup/restore |
| `lessons.js`, `lessons-guide.js` | บทเรียน + หนังสือบทเรียน (หมวด, ภาพแท่งเทียน, คู่มือ D&S) |
| `tests/` | unit (node --test) + UI (Electron) |
| `tools/vcg_price_feed.py` | ตัวดึงราคาแบบ Python + Playwright (เวอร์ชันแรก) |

## Android

`android/` เป็นโปรเจกต์ Capacitor: UI เดียวกับ desktop (`www/` สร้างด้วย `npm run build:www`) + plugin native `VcgWebPlugin` ที่เปิด VCG WebTrader ใน WebView ที่ซ่อนไว้ (login ครั้งแรกในแอป) แล้วรับราคาผ่าน `bridge.js`

```bash
npm run android:sync          # build www + cap sync
cd android && ./gradlew assembleRelease
```

## ติดตั้งบน Mac (ครั้งแรก)

1. ดาวน์โหลด `Price-Tracker-mac-arm64.zip` (Mac ชิป M1/M2/M3/M4) หรือ `-x64.zip` (Mac Intel) แล้วแตกไฟล์ ลาก **Price Tracker.app** ไปไว้ใน Applications
2. แอปยังไม่ได้เซ็นกับ Apple macOS จะเตือนว่า "เปิดไม่ได้" หรือ "ไฟล์เสียหาย" ให้เปิด Terminal แล้วรัน:
   ```bash
   xattr -cr "/Applications/Price Tracker.app"
   ```
   แล้วเปิดแอปอีกครั้ง (หรือ คลิกขวาที่แอป → Open → Open)
3. ถ้ายังเปิดไม่ได้: System Settings → Privacy & Security → เลื่อนลงไปกด **Open Anyway**

ถ้าต้องการให้เปิดได้เลยโดยไม่มีคำเตือน ต้องเซ็นและ notarize ด้วยบัญชี Apple Developer (ปีละ 99 USD) — ใส่ใน CI ได้ภายหลัง

## ให้ Claude เข้าถึงแอป (Mac · MCP)

แอป Mac มี MCP server ในตัว (`claude/price-tracker-mcp.js`) ให้ Claude Desktop / Claude Code ใช้แอปนี้ได้:

| Tool | ทำอะไร |
|---|---|
| `get_status`, `get_quotes` | สถานะการเชื่อมต่อ, ราคาล่าสุด |
| `open_chart` | เปิดกราฟ symbol / TF ที่ต้องการ |
| `get_candles` | แท่งเทียน (UTC) |
| `get_chart_screenshot` | ภาพกราฟตามที่ผู้ใช้เห็น |
| `get_analysis` | เทรนด์, สวิง, BOS/CHoCH, โซน, สัญญาณ + สถิติ |
| `get_bounce_zones` | จุดเด้ง Buy/Sell, SL เม่า, การกวาด, สถิติเด้งย้อนหลัง |
| `draw_on_chart`, `clear_claude_drawings` | วาดเส้น/โซน/Fibo/ข้อความอธิบายบนกราฟ (ลบเฉพาะของ Claude) |
| `calculate_position` | เครื่องคำนวณ lot / เติมไม้ (ไม่มีการส่งคำสั่งซื้อขายจริง) |
| `add_symbol`, `get_logs` | เพิ่ม symbol, อ่าน log |

ตั้งค่า: ⚙ ตั้งค่า → **Claude** → "เพิ่มใน Claude Desktop" (เขียน `~/Library/Application Support/Claude/claude_desktop_config.json` พร้อมสำรองไฟล์เดิม) แล้วเปิด Claude Desktop ใหม่ · หรือ "คำสั่งสำหรับ Claude Code" (`claude mcp add …`) — แอปเปิด Local API เฉพาะ 127.0.0.1 พร้อม token ให้เอง และรัน MCP server ด้วยตัวแอปเอง (`ELECTRON_RUN_AS_NODE=1`) จึงไม่ต้องติดตั้ง Node

## ทดสอบ

```bash
npm test                     # unit: วิเคราะห์ (ไม่มี look-ahead), จุดเด้ง/สถิติ, สคริปต์ที่ฉีดเข้า WebTrader, MT5 bridge
xvfb-run -a npm run test:ui  # UI: เปิดแอปจริงด้วยข้อมูลจำลอง ทดสอบแผงวิเคราะห์/ฝึก/คำนวณ/บทเรียน/MTF/Replay/มือถือ (Mac: npm run test:ui)
```
CI รันทั้งสองชุดก่อน build ทุกครั้ง ถ้าไม่ผ่านจะไม่ออก build — ภาพหน้าจอจากการทดสอบอยู่ใน artifact `ui-test-screens`

## CI / Releases

`.github/workflows/build.yml` build ทั้ง Mac (arm64/x64, ad-hoc signed) และ Android APK
- push branch `feat/**` หรือกดรันเอง → pre-release `build-<n>`
- push tag `v*` → Release จริง (แอปใช้ตรวจเวอร์ชันใหม่)

**กุญแจเซ็น Android (แนะนำ):** ตั้ง GitHub Secrets `ANDROID_KEYSTORE_B64` (keystore แบบ base64, alias `pricetracker`) และ `ANDROID_KEYSTORE_PASSWORD` — ถ้าไม่ตั้ง CI จะใช้ debug key ที่แคชไว้

## รัน / Build

```bash
npm install
npm start              # รันแบบพัฒนา
npm run build:mac      # สร้าง dist/Price Tracker-darwin-{arm64,x64}/Price Tracker.app
npm run build:win      # (ทางเลือก) Windows x64
```

แอปที่ build เองยังไม่ได้เซ็นกับ Apple ต้องเซ็นแบบ ad-hoc ก่อนเปิดครั้งแรก:

```bash
xattr -cr "/Applications/Price Tracker.app" && codesign --force --deep -s - "/Applications/Price Tracker.app"
```

## Local API

เปิดได้ที่ ⚙ การตั้งค่า → API / Webhook

| Endpoint | |
|---|---|
| `GET /api/status` | สถานะการเชื่อมต่อ |
| `GET /api/quotes`, `/api/quotes/XAUUSD` | ราคาล่าสุด |
| `GET/POST/DELETE /api/symbols` | watchlist |
| `GET /api/chart` | แท่งเทียนของกราฟที่เปิดอยู่ |
| `GET /api/analysis` | เทรนด์ / โครงสร้าง / สัญญาณ / สถิติ |
| `GET /api/logs?limit=200&level=error` | log |
| `GET /api/stream` | SSE: `quote`, `signal`, `alert`, `network` (+`log` เมื่อ `?logs=1`) |

## License

MIT · กราฟใช้ [TradingView Lightweight Charts™](https://github.com/tradingview/lightweight-charts) (Apache-2.0, ดู `lib/LICENSE-lightweight-charts`)
