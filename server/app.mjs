import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError, createProvider } from './provider.mjs';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const now = () => new Date().toISOString();
const id = () => randomUUID();
function string(value, name, max, optional = false) {
  if (optional && (value == null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new AppError(400, `${name}: Bitte 1 bis ${max} Zeichen eingeben.`);
  return value.trim();
}
function agentFields(body) {
  if (typeof body.web !== 'boolean') throw new AppError(400, 'Websuche muss ein Wahrheitswert sein.');
  return { name: string(body.name, 'Name', 60), role: string(body.role, 'Rolle', 160), instructions: string(body.instructions, 'Anweisungen', 6000), memory: string(body.memory, 'Gedächtnis', 6000, true), web: body.web };
}
function equal(a, b) { const x = Buffer.from(a || ''), y = Buffer.from(b || ''); return x.length === y.length && timingSafeEqual(x, y); }
async function readBody(req) {
  let size = 0, chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 100000) throw new AppError(413, 'Die Anfrage ist zu groß.'); chunks.push(chunk); }
  try { const data = JSON.parse(Buffer.concat(chunks).toString()); if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error(); return data; }
  catch { throw new AppError(400, 'Ungültige Anfrage.'); }
}

export function createApp(config = {}) {
  if (config.demo) throw new Error('Simulierter Betrieb ist nicht verfügbar. Bitte den echten API-Zugang einrichten.');
  const token = config.token || '';
  if (token.length < 24) throw new Error('APP_TOKEN muss mindestens 24 Zeichen lang sein.');
  const dbPath = config.dbPath || join(process.cwd(), 'data', 'agentenwerk.sqlite');
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS agents(id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS routines(id TEXT PRIMARY KEY, agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS budget(day TEXT PRIMARY KEY, count INTEGER NOT NULL);`);
  const all = table => db.prepare(`SELECT data FROM ${table}`).all().map(r => JSON.parse(r.data));
  const get = (table, key) => { const r = db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(key); if (!r) throw new AppError(404, 'Eintrag nicht gefunden.'); return JSON.parse(r.data); };
  const put = (table, item) => {
    if (table === 'agents') db.prepare('INSERT OR REPLACE INTO agents(id,data) VALUES(?,?)').run(item.id, JSON.stringify(item));
    else db.prepare(`INSERT INTO ${table}(id,agent_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(item.id, item.agentId, JSON.stringify(item));
  };
  // UPDATE, not REPLACE, preserves children when editing agents.
  const updateAgent = item => db.prepare('UPDATE agents SET data=? WHERE id=?').run(JSON.stringify(item), item.id);
  const provider = config.provider || createProvider(config);
  const active = new Map();
  const maxConcurrent = config.maxConcurrent || 3;
  const maxDaily = config.maxDaily || 60;
  let closed = false;
  let generationActive = 0;
  let connectionCheck = null;
  let requestWindow = { at: Date.now(), count: 0 };
  const budget = () => {
    const day = now().slice(0, 10);
    if ((db.prepare('SELECT count FROM budget WHERE day=?').get(day)?.count || 0) >= maxDaily) throw new AppError(429, 'Das tägliche Anfragelimit ist erreicht.');
    db.prepare('INSERT INTO budget(day,count) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET count=count+1').run(day);
  };
  for (const run of all('runs')) if (run.status === 'running') put('runs', { ...run, status: 'failed', error: 'Server wurde während der Ausführung neu gestartet. Bitte erneut starten.', finishedAt: now() });

  function enqueue(agentId, task, routineId = null) {
    get('agents', agentId);
    if (all('runs').filter(r => ['queued', 'running'].includes(r.status)).length >= 30) throw new AppError(429, 'Die Warteschlange ist voll. Bitte warten.');
    budget();
    const run = { id: id(), agentId, task: string(task, 'Aufgabe', 20000), status: 'queued', createdAt: now(), routineId, result: '', sources: [] };
    put('runs', run); return run;
  }
  async function execute(run) {
    const controller = new AbortController(); active.set(run.id, controller);
    put('runs', { ...run, status: 'running', startedAt: now() });
    try {
      const agent = get('agents', run.agentId);
      const history = all('runs').filter(r => r.agentId === agent.id && r.status === 'done' && r.createdAt <= run.createdAt).slice(-5).flatMap(r => [{ role: 'user', content: r.task.slice(0, 4000) }, { role: 'assistant', content: r.result.slice(0, 6000) }]);
      const result = await provider.run(agent, run.task, history, controller.signal);
      if (!closed && get('runs', run.id).status !== 'cancelled') put('runs', { ...get('runs', run.id), status: 'done', result: result.text, sources: result.sources, usage: result.usage, finishedAt: now() });
    } catch (e) {
      if (!closed) { const current = get('runs', run.id); if (current.status !== 'cancelled') put('runs', { ...current, status: 'failed', error: e instanceof AppError ? e.message : 'Die Aufgabe konnte nicht abgeschlossen werden.', finishedAt: now() }); }
    } finally { active.delete(run.id); }
  }
  function tick() {
    if (closed) return;
    for (const routine of all('routines')) {
      if (!routine.enabled || Date.parse(routine.nextAt) > Date.now()) continue;
      // One catch-up run only, and never overlap an earlier run of this routine.
      if (!all('runs').some(r => r.routineId === routine.id && ['queued', 'running'].includes(r.status))) {
        try { enqueue(routine.agentId, routine.task, routine.id); routine.error = ''; }
        catch (e) { routine.error = e.message; }
      }
      routine.nextAt = new Date(Date.now() + routine.hours * 3600000).toISOString(); put('routines', routine);
    }
    const busy = new Set(all('runs').filter(r => r.status === 'running').map(r => r.agentId));
    for (const run of all('runs').filter(r => r.status === 'queued')) {
      if (active.size >= maxConcurrent) break;
      if (busy.has(run.agentId)) continue;
      busy.add(run.agentId); void execute(run);
    }
  }
  const timer = setInterval(tick, config.tickMs || 1000);
  timer.unref();

  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      if (!path.startsWith('/api/')) {
        if (req.method !== 'GET') throw new AppError(405, 'Methode nicht erlaubt.');
        const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/icon.svg': ['icon.svg', 'image/svg+xml'] };
        if (!files[path]) throw new AppError(404, 'Seite nicht gefunden.');
        const [file, mime] = files[path]; res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-cache' }); res.end(readFileSync(join(publicDir, file))); return;
      }
      if (path === '/api/status' && req.method === 'GET') return send(200, { configured: !!config.apiKey || !!config.provider, model: config.model || 'chat-latest', maxDaily, connectionCheck });
      if (Date.now() - requestWindow.at > 60000) requestWindow = { at: Date.now(), count: 0 };
      if (++requestWindow.count > 180) throw new AppError(429, 'Zu viele Anfragen. Bitte kurz warten.');
      if (!['GET', 'HEAD'].includes(req.method)) {
        if (!req.headers['content-type']?.startsWith('application/json')) throw new AppError(415, 'JSON-Anfrage erforderlich.');
        if (req.headers['sec-fetch-site'] === 'cross-site') throw new AppError(403, 'Anfrage von fremder Website blockiert.');
      }
      if (path === '/api/login' && req.method === 'POST') {
        const body = await readBody(req);
        if (!equal(body.token, token)) throw new AppError(401, 'Der Zugangscode ist nicht korrekt.');
        res.setHeader('Set-Cookie', `session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`);
        return send(200, { ok: true });
      }
      const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('session='));
      const bearer = req.headers.authorization?.replace(/^Bearer /, '');
      if (!equal(bearer || (cookie ? decodeURIComponent(cookie.slice(8)) : ''), token)) throw new AppError(401, 'Bitte mit deinem Zugangscode anmelden.');
      if (path === '/api/connection/check' && req.method === 'POST') {
        budget();
        try { connectionCheck = await provider.check(); return send(200, connectionCheck); }
        catch (e) { connectionCheck = { ok: false, checkedAt: now() }; throw e; }
      }
      if (path === '/api/logout' && req.method === 'POST') { res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return send(200, { ok: true }); }
      if (path === '/api/state' && req.method === 'GET') return send(200, { agents: all('agents'), runs: all('runs'), routines: all('routines') });
      if (path === '/api/generate' && req.method === 'POST') {
        const body = await readBody(req); const description = string(body.description, 'Beschreibung', 4000);
        if (generationActive >= 2) throw new AppError(429, 'Es werden bereits Agenten erstellt. Bitte warten.');
        budget(); generationActive++;
        try { const draft = await provider.generate(description); return send(200, agentFields(draft)); }
        finally { generationActive--; }
      }
      if (path === '/api/agents' && req.method === 'POST') {
        if (all('agents').length >= 50) throw new AppError(400, 'Maximal 50 Agenten erlaubt.');
        const agent = { ...agentFields(await readBody(req)), id: id(), createdAt: now() }; put('agents', agent); return send(201, agent);
      }
      const match = path.match(/^\/api\/(agents|runs|routines)\/([\w-]+)$/);
      if (match) {
        const [, table, key] = match; const item = get(table, key);
        if (req.method === 'PATCH' && table === 'agents') { const updated = { ...item, ...agentFields(await readBody(req)) }; updateAgent(updated); return send(200, updated); }
        if (req.method === 'DELETE' && table === 'agents') {
          if (all('runs').some(r => r.agentId === key && (['queued', 'running'].includes(r.status) || active.has(r.id)))) throw new AppError(409, 'Bitte zuerst die laufenden Aufgaben stoppen und kurz auf den Abschluss warten.');
          db.prepare('DELETE FROM agents WHERE id=?').run(key); return send(200, { ok: true });
        }
        if (req.method === 'PATCH' && table === 'runs') {
          const body = await readBody(req); if (body.status !== 'cancelled' || !['queued', 'running'].includes(item.status)) throw new AppError(409, 'Diese Aufgabe kann nicht mehr gestoppt werden.');
          put('runs', { ...item, status: 'cancelled', finishedAt: now() }); active.get(key)?.abort(); return send(200, { ok: true });
        }
        if (req.method === 'PATCH' && table === 'routines') {
          const body = await readBody(req); if (typeof body.enabled !== 'boolean') throw new AppError(400, 'Aktivierung ungültig.');
          put('routines', { ...item, enabled: body.enabled, nextAt: new Date(Date.now() + item.hours * 3600000).toISOString(), error: '' }); return send(200, { ok: true });
        }
        if (req.method === 'DELETE' && table === 'routines') { db.prepare('DELETE FROM routines WHERE id=?').run(key); return send(200, { ok: true }); }
      }
      if (path === '/api/runs' && req.method === 'POST') { const body = await readBody(req); return send(202, enqueue(string(body.agentId, 'Agent', 100), string(body.task, 'Aufgabe', 20000))); }
      if (path === '/api/routines' && req.method === 'POST') {
        const body = await readBody(req); get('agents', string(body.agentId, 'Agent', 100));
        if (![1, 24, 168].includes(body.hours)) throw new AppError(400, 'Ungültiges Intervall.');
        if (all('routines').length >= 20) throw new AppError(400, 'Maximal 20 Routinen erlaubt.');
        const item = { id: id(), agentId: body.agentId, task: string(body.task, 'Aufgabe', 20000), hours: body.hours, enabled: true, nextAt: new Date(Date.now() + body.hours * 3600000).toISOString() }; put('routines', item); return send(201, item);
      }
      throw new AppError(404, 'Funktion nicht gefunden.');
    } catch (e) { if (!res.headersSent) send(e instanceof AppError ? e.status : 500, { error: e instanceof AppError ? e.message : 'Ein interner Fehler ist aufgetreten.' }); else res.end(); }
  });
  return { server, tick, async close() { closed = true; clearInterval(timer); for (const c of active.values()) c.abort(); await new Promise(resolve => server.close(resolve)); db.close(); } };
}
