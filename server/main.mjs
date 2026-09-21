import { createApp } from './app.mjs';
if (process.argv.includes('--demo')) throw new Error('Der Demomodus wurde entfernt. OPENAI_API_KEY und APP_TOKEN auf dem Server einrichten.');
if (!process.env.OPENAI_API_KEY?.trim()) throw new Error('OPENAI_API_KEY fehlt. Der Server startet erst mit echtem API-Zugang.');
const positive = (name, fallback, max) => { const n = Number(process.env[name] || fallback); if (!Number.isInteger(n) || n < 1 || n > max) throw Error(`${name} ist ungültig.`); return n; };
const app = createApp({ apiKey: process.env.OPENAI_API_KEY, token: process.env.APP_TOKEN, model: process.env.OPENAI_MODEL || 'chat-latest', maxDaily: positive('MAX_DAILY_REQUESTS', 60, 10000), maxConcurrent: positive('MAX_CONCURRENT_RUNS', 3, 10) });
const port = positive('PORT', 8787, 65535);
const host = process.env.HOST || '127.0.0.1';
app.server.listen(port, host, () => console.log(`Agentenwerk: http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
