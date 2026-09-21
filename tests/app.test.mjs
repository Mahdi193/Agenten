import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.mjs';
import { createProvider } from '../server/provider.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const token = 'test-token-at-least-24-characters';
const agent = { name: 'Mira', role: 'Recherche', instructions: 'Prüfe die Quellen.', memory: '', web: true };
async function fixture(t, options = {}) {
  const app = createApp({ token, dbPath: ':memory:', tickMs: 10, provider: { run: async () => ({ text: 'Fertig', sources: [], usage: null }), generate: async () => agent }, ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const api = async (path, method = 'GET', body, auth = true) => {
    const res = await fetch(base + '/api/' + path, { method, headers: { ...(auth ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json(), headers: res.headers };
  };
  const until = async (predicate) => { for (let n = 0; n < 100; n++) { const result = (await api('state')).data; if (predicate(result)) return result; await new Promise(r => setTimeout(r, 15)); } throw Error('Timed out'); };
  return { app, api, base, until };
}
test('authentication, cookie flags, no API secrets exposed, invalid input rejected', async t => {
  const { api, base } = await fixture(t);
  assert.equal((await api('state', 'GET', null, false)).status, 401);
  assert.equal((await api('login', 'POST', { token: 'wrong' }, false)).status, 401);
  const login = await api('login', 'POST', { token }, false);
  assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.equal((await api('agents', 'POST', { ...agent, web: 'yes' })).status, 400);
  const status = await api('status', 'GET', null, false); assert.equal('apiKey' in status.data, false);
  const cross = await fetch(base + '/api/agents', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site', Authorization: `Bearer ${token}` }, body: JSON.stringify(agent) });
  assert.equal(cross.status, 403);
  const page = await fetch(base); assert.equal(page.status, 200); assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});
test('agent creation, generation, execution, history and edits preserve run records', async t => {
  const calls = [];
  const { api, until } = await fixture(t, { provider: { generate: async () => agent, run: async (a, task, history) => { calls.push({ a, task, history }); return { text: 'Ergebnis', sources: [], usage: {} }; } } });
  const generated = await api('generate', 'POST', { description: 'Recherche-Assistent' }); assert.equal(generated.data.name, 'Mira');
  const a = (await api('agents', 'POST', agent)).data;
  const r = await api('runs', 'POST', { agentId: a.id, task: 'Erste Aufgabe' }); assert.equal(r.status, 202);
  await until(s => s.runs[0].status === 'done');
  await api('agents/' + a.id, 'PATCH', { ...agent, memory: 'Kurz antworten' });
  assert.equal((await api('state')).data.runs.length, 1);
  await api('runs', 'POST', { agentId: a.id, task: 'Zweite Aufgabe' }); await until(s => s.runs.length === 2 && s.runs.every(r => r.status === 'done'));
  assert.equal(calls[1].history.length, 2); assert.equal(calls[1].a.memory, 'Kurz antworten');
  await api('agents/' + a.id, 'DELETE', {}); assert.equal((await api('state')).data.runs.length, 0);
});
test('running tasks can be cancelled; agent deletion is blocked while active', async t => {
  const { api, until } = await fixture(t, { provider: { run: async (a, task, history, signal) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Error('abort')))) } });
  const a = (await api('agents', 'POST', agent)).data;
  const r = (await api('runs', 'POST', { agentId: a.id, task: 'Langsame Aufgabe' })).data;
  await until(s => s.runs[0].status === 'running');
  assert.equal((await api('agents/' + a.id, 'DELETE', {})).status, 409);
  assert.equal((await api('runs/' + r.id, 'PATCH', { status: 'cancelled' })).status, 200);
  await until(s => s.runs[0].status === 'cancelled');
});
test('daily cap, routine validation and pause', async t => {
  const { api } = await fixture(t, { maxDaily: 1 });
  const a = (await api('agents', 'POST', agent)).data;
  await api('runs', 'POST', { agentId: a.id, task: 'Eine Aufgabe' });
  assert.equal((await api('runs', 'POST', { agentId: a.id, task: 'Zu viel' })).status, 429);
  assert.equal((await api('routines', 'POST', { agentId: a.id, task: 'Bericht', hours: 0 })).status, 400);
  const routine = (await api('routines', 'POST', { agentId: a.id, task: 'Bericht', hours: 24 })).data;
  assert.ok(Date.parse(routine.nextAt) > Date.now());
  await api('routines/' + routine.id, 'PATCH', { enabled: false });
  assert.equal((await api('state')).data.routines[0].enabled, false);
});
test('OpenAI payload uses server-side credentials, structured output and source citations', async () => {
  const requests = [];
  const provider = createProvider({ apiKey: 'server-secret', model: 'chat-latest', fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body); requests.push({ url, options, body });
    return { ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: body.text ? JSON.stringify(agent) : 'Bericht', annotations: [{ type: 'url_citation', url: 'https://example.org', title: 'Quelle' }] }] }] }) };
  } });
  assert.equal((await provider.generate('Recherche')).name, 'Mira');
  const result = await provider.run(agent, 'Aufgabe', [], new AbortController().signal);
  assert.equal(requests[0].body.text.format.type, 'json_schema');
  assert.equal(requests[1].body.tools[0].type, 'web_search');
  assert.equal(requests[1].body.store, false); assert.equal(result.sources[0].title, 'Quelle');
  assert.equal(requests[1].options.headers.Authorization, 'Bearer server-secret');
});
test('incomplete OpenAI responses and missing credentials never become fake successes', async () => {
  const incomplete = createProvider({ apiKey: 'x', fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'incomplete', output: [] }) }) });
  await assert.rejects(() => incomplete.run(agent, 'Test', []), /nicht vollständig/);
  await assert.rejects(() => createProvider({}).run(agent, 'Test', []), /API-Schlüssel/);
});

test('simulation cannot be enabled and connection checks use the provider', async t => {
  assert.throws(() => createApp({ demo: true }), /Simulierter Betrieb/);
  let checks = 0;
  const { api } = await fixture(t, { provider: { check: async () => { checks++; return { ok: true, model: 'test-model', checkedAt: new Date().toISOString() }; } } });
  assert.equal((await api('connection/check', 'POST', {}, false)).status, 401);
  assert.equal(checks, 0);
  assert.equal((await api('connection/check', 'POST', {})).data.ok, true);
  assert.equal(checks, 1);
  assert.equal((await api('status')).data.connectionCheck.model, 'test-model');
});

test('due routines run once, advance their schedule and persist across restarts', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'agentenwerk-test-'));
  const dbPath = join(directory, 'test.sqlite');
  let calls = 0;
  const app = createApp({ token, dbPath, tickMs: 60000, provider: { run: async () => { calls++; return { text: 'Bericht', sources: [] }; } } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const post = async (path, body) => (await fetch(base + '/api/' + path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  try {
    const a = await post('agents', agent);
    const routine = await post('routines', { agentId: a.id, task: 'Bericht', hours: 24 });
    const database = new DatabaseSync(dbPath);
    database.prepare('UPDATE routines SET data=? WHERE id=?').run(JSON.stringify({ ...routine, nextAt: new Date(0).toISOString() }), routine.id);
    database.close();
    app.tick(); await new Promise(resolve => setImmediate(resolve)); app.tick();
    assert.equal(calls, 1);
    const state = await (await fetch(base + '/api/state', { headers: { Authorization: `Bearer ${token}` } })).json();
    assert.equal(state.runs[0].status, 'done'); assert.ok(Date.parse(state.routines[0].nextAt) > Date.now());
  } finally { await app.close(); }
  const restored = createApp({ token, dbPath, tickMs: 60000 });
  await new Promise(resolve => restored.server.listen(0, '127.0.0.1', resolve));
  try {
    const state = await (await fetch(`http://127.0.0.1:${restored.server.address().port}/api/state`, { headers: { Authorization: `Bearer ${token}` } })).json();
    assert.equal(state.agents.length, 1); assert.equal(state.runs[0].result, 'Bericht'); assert.equal(state.routines.length, 1);
  } finally { await restored.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('different agents run concurrently, while the same agent remains serialized', async t => {
  const starts = [], finishes = [];
  const { api, until } = await fixture(t, { provider: { run: async (a, task) => {
    starts.push(task);
    await new Promise(resolve => finishes.push({ task, resolve }));
    return { text: task, sources: [] };
  } } });
  const a = (await api('agents', 'POST', agent)).data;
  const b = (await api('agents', 'POST', { ...agent, name: 'Theo' })).data;
  await api('runs', 'POST', { agentId: a.id, task: 'A1' });
  await api('runs', 'POST', { agentId: a.id, task: 'A2' });
  await api('runs', 'POST', { agentId: b.id, task: 'B1' });
  await until(s => s.runs.filter(r => r.status === 'running').length === 2);
  assert.deepEqual(starts.sort(), ['A1', 'B1']);
  finishes.find(f => f.task === 'A1').resolve();
  await until(s => s.runs.some(r => r.task === 'A2' && r.status === 'running'));
  finishes.find(f => f.task === 'A2').resolve(); finishes.find(f => f.task === 'B1').resolve();
  await until(s => s.runs.every(r => r.status === 'done'));
});
