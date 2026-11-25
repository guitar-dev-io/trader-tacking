// Outgoing notifications: generic webhook (Discord / Slack / Make / Zapier / n8n / your server) and Telegram.
const log = require('./logger');

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
}

async function send(cfg, event, payload, text) {
  const jobs = [];
  if (cfg.webhook && cfg.webhook.url && cfg.webhook[event === 'signal' ? 'onSignal' : 'onAlert'] !== false) {
    // "content" for Discord, "text" for Slack, the rest for anything else
    jobs.push(post(cfg.webhook.url, { event, ...payload, text, content: text })
      .then(() => log.info('webhook', `ส่ง ${event} ไป webhook แล้ว`))
      .catch((e) => log.error('webhook', `ส่ง webhook ไม่สำเร็จ: ${e.message}`)));
  }
  if (cfg.telegram && cfg.telegram.botToken && cfg.telegram.chatId && cfg.telegram[event === 'signal' ? 'onSignal' : 'onAlert'] !== false) {
    jobs.push(post(`https://api.telegram.org/bot${cfg.telegram.botToken}/sendMessage`, { chat_id: cfg.telegram.chatId, text })
      .then(() => log.info('telegram', `ส่ง ${event} ไป Telegram แล้ว`))
      .catch((e) => log.error('telegram', `ส่ง Telegram ไม่สำเร็จ: ${e.message}`)));
  }
  await Promise.all(jobs);
  return jobs.length;
}

module.exports = { send };
