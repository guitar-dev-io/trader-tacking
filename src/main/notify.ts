// Outgoing notifications: generic webhook (Discord / Slack / Make / Zapier / n8n / your server) and Telegram.
import log from './logger';
import type { Settings } from './types';

async function post(url: string, body: unknown): Promise<void> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
}

export async function send(cfg: Pick<Settings, 'webhook' | 'telegram'>, event: string, payload: unknown, text: string): Promise<number> {
  const jobs: Promise<unknown>[] = [];
  const which = event === 'signal' ? 'onSignal' : 'onAlert';
  if (cfg.webhook && cfg.webhook.url && cfg.webhook[which] !== false) {
    // "content" for Discord, "text" for Slack, the rest for anything else
    jobs.push(post(cfg.webhook.url, { event, ...(payload as object), text, content: text })
      .then(() => log.info('webhook', `ส่ง ${event} ไป webhook แล้ว`))
      .catch((e: Error) => log.error('webhook', `ส่ง webhook ไม่สำเร็จ: ${e.message}`)));
  }
  if (cfg.telegram && cfg.telegram.botToken && cfg.telegram.chatId && cfg.telegram[which] !== false) {
    jobs.push(post(`https://api.telegram.org/bot${cfg.telegram.botToken}/sendMessage`, { chat_id: cfg.telegram.chatId, text })
      .then(() => log.info('telegram', `ส่ง ${event} ไป Telegram แล้ว`))
      .catch((e: Error) => log.error('telegram', `ส่ง Telegram ไม่สำเร็จ: ${e.message}`)));
  }
  await Promise.all(jobs);
  return jobs.length;
}
export default { send };
