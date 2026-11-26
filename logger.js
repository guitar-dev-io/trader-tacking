// Simple logger: ring buffer in memory + rotating file in <userData>/logs/app.log
const fs = require('fs');
const path = require('path');

const MAX_MEM = 3000;
const MAX_FILE = 5 * 1024 * 1024;
const buf = [];
const listeners = new Set();
let file = null;

function init(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); file = path.join(dir, 'app.log'); } catch (_) {}
}

function write(level, source, msg, data) {
  const e = { t: new Date().toISOString(), level, source, msg: String(msg) };
  if (data !== undefined) {
    try { e.data = typeof data === 'string' ? data : JSON.stringify(data).slice(0, 2000); } catch (_) { e.data = String(data); }
  }
  buf.push(e); if (buf.length > MAX_MEM) buf.splice(0, buf.length - MAX_MEM);
  if (file) {
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > MAX_FILE) fs.renameSync(file, file + '.1');
      fs.appendFileSync(file, `${e.t} [${level.toUpperCase()}] ${source}: ${e.msg}${e.data ? ' ' + e.data : ''}\n`);
    } catch (_) {}
  }
  listeners.forEach((fn) => { try { fn(e); } catch (_) {} });
  return e;
}

module.exports = {
  init,
  file: () => file,
  info: (src, msg, data) => write('info', src, msg, data),
  warn: (src, msg, data) => write('warn', src, msg, data),
  error: (src, msg, data) => write('error', src, msg, data),
  debug: (src, msg, data) => write('debug', src, msg, data),
  write,
  recent: (n = 500, level) => (level ? buf.filter((e) => e.level === level) : buf).slice(-n),
  onLog: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
};
