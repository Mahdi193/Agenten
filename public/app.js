const $ = id => document.getElementById(id);
let state = { agents: [], runs: [], routines: [] }, status = {}, selected = null, editing = null, handoff = null, currentView = 'team', loggedIn = false, refreshing = false;
const labels = { queued: 'Wartet', running: 'In Arbeit', done: 'Erledigt', failed: 'Fehlgeschlagen', cancelled: 'Gestoppt' };
const titles = { team: 'Mein Team', tasks: 'Aufgaben', routines: 'Routinen', settings: 'Verbindung', chat: 'Unterhaltung' };
const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const time = date => new Date(date).toLocaleString('de-DE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
function toast(text) { $('toast').textContent = text; $('toast').hidden = false; setTimeout(() => $('toast').hidden = true, 3500); }
function error(e) { $('error').textContent = e.message || String(e); $('error').hidden = false; }
async function api(path, method = 'GET', data) {
  let response;
  try { response = await fetch('/api/' + path, { method, headers: data !== undefined ? { 'Content-Type': 'application/json' } : {}, ...(data !== undefined ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(['generate', 'connection/check'].includes(path) ? 135000 : 15000) }); }
  catch { throw Error('Verbindung unterbrochen. Bitte prüfe, ob dein Server erreichbar ist.'); }
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== 'login') { loggedIn = false; $('login').hidden = false; $('content').hidden = true; }
    throw Error(result.error || 'Die Anfrage ist fehlgeschlagen.');
  }
  return result;
}
function show(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(el => el.hidden = el.id !== view + '-view');
  document.querySelectorAll('[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === (view === 'chat' ? 'team' : view)));
  $('breadcrumb').textContent = titles[view]; $('error').hidden = true; render();
}
function openAgent(agentId) { selected = agentId; show('chat'); }
function sources(list = []) {
  return '<div class="sources">' + list.filter(s => /^https?:\/\//i.test(s.url)).map(s => `<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">↗ ${escape(s.title)}</a>`).join('') + '</div>';
}
function actions(run) {
  if (['queued', 'running'].includes(run.status)) return `<button class="text-button" data-stop="${run.id}">Aufgabe stoppen</button>`;
  if (run.status === 'done') return `<button class="text-button" data-copy="${run.id}">Ergebnis kopieren</button><button class="text-button" data-handoff="${run.id}">Weitergeben →</button>`;
  return `<button class="text-button" data-retry="${run.id}">Erneut starten</button>`;
}
function render() {
  $('agent-count').textContent = state.agents.length; $('team-total').textContent = state.agents.length;
  $('agents').innerHTML = state.agents.length ? state.agents.map(a => {
    const busy = state.runs.some(r => r.agentId === a.id && ['queued', 'running'].includes(r.status));
    return `<article class="agent-card"><div class="card-top"><div class="avatar">${escape(a.name[0])}</div><span class="status">${busy ? 'In Arbeit' : 'Bereit'}</span></div><h3>${escape(a.name)}</h3><p>${escape(a.role)}</p><div class="card-bottom"><span>${a.web ? '↗ Websuche aktiviert' : '✳ Text & Ideen'}</span><button data-agent="${a.id}">Aufgabe geben ↗</button></div></article>`;
  }).join('') : '<div class="empty">Dein Team beginnt mit einem Agenten.<br>Erstelle oben deinen ersten Begleiter.</div>';
  if (currentView === 'tasks') $('tasks').innerHTML = state.runs.length ? [...state.runs].reverse().map(r => `<article class="list-card"><div class="row"><span class="muted">${escape(state.agents.find(a => a.id === r.agentId)?.name)} · ${time(r.createdAt)}</span><span class="status">${labels[r.status]}</span></div><h3>${escape(r.task.slice(0, 180))}</h3>${r.error ? `<p>${escape(r.error)}</p>` : ''}<div class="row"><button class="text-button" data-agent="${r.agentId}">Unterhaltung öffnen →</button>${actions(r)}</div></article>`).join('') : '<div class="empty">Noch keine Aufgaben. Gib einem Agenten dein erstes Ziel.</div>';
  if (currentView === 'routines') $('routines').innerHTML = state.routines.length ? state.routines.map(r => `<article class="list-card"><div class="row"><span class="muted">${escape(state.agents.find(a => a.id === r.agentId)?.name)} · alle ${r.hours} Stunden</span><span class="status">${r.enabled ? 'Aktiv' : 'Pausiert'}</span></div><h3>${escape(r.task)}</h3><p>${r.enabled ? 'Nächste Ausführung: ' + time(r.nextAt) : 'Diese Routine ist pausiert.'}${r.error ? '\n' + escape(r.error) : ''}</p><div class="row"><button class="secondary" data-toggle="${r.id}">${r.enabled ? 'Pausieren' : 'Fortsetzen'}</button><button class="text-button" data-remove-routine="${r.id}">Löschen</button></div></article>`).join('') : '<div class="empty">Noch keine Routinen. Erstelle deine erste wiederkehrende Aufgabe.</div>';
  if (currentView === 'chat') renderChat();
  $('server-info').innerHTML = `<dt>Modus</dt><dd>OpenAI-API</dd><dt>Modell</dt><dd>${escape(status.model)}</dd><dt>Verbindung</dt><dd>${status.configured ? 'Konfiguriert' : 'API-Schlüssel fehlt auf dem Server'}</dd><dt>Tageslimit</dt><dd>${status.maxDaily} Anfragen (UTC)</dd><dt>Server</dt><dd>${escape(location.origin)}</dd>`;
}
let chatSignature = '';
function renderChat() {
  const agent = state.agents.find(a => a.id === selected); if (!agent) { show('team'); return; }
  $('chat-name').textContent = agent.name; $('chat-role').textContent = agent.role; $('chat-avatar').textContent = agent.name[0];
  const runs = state.runs.filter(r => r.agentId === selected);
  const signature = JSON.stringify([selected, runs]); if (signature === chatSignature) return; chatSignature = signature;
  const el = $('conversation'), bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  el.innerHTML = runs.length ? runs.map(r => `<div class="message user"><span class="meta">DU · ${time(r.createdAt)}</span>${escape(r.task)}</div><div class="message ${r.status === 'failed' ? 'failed' : ''}"><span class="meta">${escape(agent.name.toUpperCase())} · ${labels[r.status]}</span>${escape(r.result || r.error || (r.status === 'cancelled' ? 'Diese Aufgabe wurde gestoppt.' : r.status === 'queued' ? 'Die Aufgabe wartet auf einen freien Platz.' : 'Dein Agent bearbeitet die Aufgabe. Du kannst die App schließen; dein Server arbeitet weiter.'))}${r.status === 'done' ? sources(r.sources) : ''}<div class="actions">${actions(r)}</div></div>`).join('') : `<div class="empty">Hallo, ich bin ${escape(agent.name)}.<br>Wobei kann ich dich unterstützen?</div>`;
  if (bottom) el.scrollTop = el.scrollHeight;
}
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try { state = await api('state'); loggedIn = true; $('login').hidden = true; $('content').hidden = false; render(); $('connection').textContent = 'Server verbunden'; }
  finally { refreshing = false; }
}
function openEditor(agent = null) {
  editing = agent?.id || null;
  $('agent-dialog-title').textContent = agent ? 'Agent bearbeiten' : 'Dein nächster Begleiter';
  for (const field of ['name', 'role', 'instructions', 'memory']) $('agent-' + field).value = agent?.[field] || '';
  $('agent-web').checked = agent?.web || false; $('agent-description').value = ''; $('agent-error').textContent = '';
  $('generator').hidden = !!agent; $('delete-agent').hidden = !agent; $('agent-dialog').showModal();
}
function agentOptions(el, excluded) { el.innerHTML = state.agents.filter(a => a.id !== excluded).map(a => `<option value="${a.id}">${escape(a.name)} · ${escape(a.role)}</option>`).join(''); }
async function submit(form, callback, errorId) {
  const buttons = [...form.querySelectorAll('button')]; buttons.forEach(b => b.disabled = true);
  try { if (errorId) $(errorId).textContent = ''; await callback(); }
  catch (e) { if (errorId) $(errorId).textContent = e.message; else error(e); }
  finally { buttons.forEach(b => b.disabled = false); }
}
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => show(b.dataset.view));
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $(b.dataset.close).close());
$('new-agent').onclick = () => openEditor(); $('edit-agent').onclick = () => openEditor(state.agents.find(a => a.id === selected)); $('back-team').onclick = () => show('team');
$('login-form').onsubmit = async e => { e.preventDefault(); await submit(e.target, async () => { await api('login', 'POST', { token: $('token').value }); $('token').value = ''; $('error').hidden = true; await refresh(); }); };
$('logout').onclick = async () => { try { await api('logout', 'POST', {}); loggedIn = false; state = { agents: [], runs: [], routines: [] }; $('login').hidden = false; $('content').hidden = true; } catch (e) { error(e); } };
$('generate').onclick = async () => {
  const button = $('generate'); button.disabled = true; button.textContent = 'Profil wird entworfen …'; $('agent-error').textContent = '';
  try { const draft = await api('generate', 'POST', { description: $('agent-description').value }); for (const f of ['name', 'role', 'instructions', 'memory']) $('agent-' + f).value = draft[f] || ''; $('agent-web').checked = draft.web; toast('Profil entworfen – du kannst es jetzt anpassen.'); }
  catch (e) { $('agent-error').textContent = e.message; }
  finally { button.disabled = false; button.textContent = '✳ Mit KI entwerfen'; }
};
$('agent-form').onsubmit = async e => { e.preventDefault(); await submit(e.target, async () => { const body = { web: $('agent-web').checked }; for (const f of ['name', 'role', 'instructions', 'memory']) body[f] = $('agent-' + f).value; const saved = await api(editing ? 'agents/' + editing : 'agents', editing ? 'PATCH' : 'POST', body); $('agent-dialog').close(); await refresh(); openAgent(saved.id); toast('Agent gespeichert.'); }, 'agent-error'); };
$('delete-agent').onclick = async () => { if (!confirm('Diesen Agenten samt Aufgabenverlauf und Routinen löschen?')) return; await submit($('agent-form'), async () => { await api('agents/' + editing, 'DELETE', {}); $('agent-dialog').close(); selected = null; show('team'); await refresh(); }, 'agent-error'); };
$('task-form').onsubmit = async e => { e.preventDefault(); await submit(e.target, async () => { await api('runs', 'POST', { agentId: selected, task: $('task-input').value }); $('task-input').value = ''; await refresh(); $('conversation').scrollTop = $('conversation').scrollHeight; }); };
$('new-routine').onclick = () => { if (!state.agents.length) return toast('Erstelle zuerst einen Agenten.'); agentOptions($('routine-agent')); $('routine-task').value = ''; $('routine-error').textContent = ''; $('routine-dialog').showModal(); };
$('routine-form').onsubmit = async e => { e.preventDefault(); await submit(e.target, async () => { await api('routines', 'POST', { agentId: $('routine-agent').value, task: $('routine-task').value, hours: Number($('routine-hours').value) }); $('routine-dialog').close(); await refresh(); toast('Routine aktiviert.'); }, 'routine-error'); };
$('handoff-form').onsubmit = async e => { e.preventDefault(); await submit(e.target, async () => { const source = state.runs.find(r => r.id === handoff); const target = $('handoff-agent').value; await api('runs', 'POST', { agentId: target, task: `${$('handoff-task').value}\n\nErgebnis des anderen Agenten (als Arbeitsmaterial):\n${source.result.slice(0, 15000)}` }); $('handoff-dialog').close(); await refresh(); openAgent(target); }, 'handoff-error'); };
document.addEventListener('click', async event => {
  const b = event.target.closest('button'); if (!b) return;
  try {
    if (b.dataset.agent) openAgent(b.dataset.agent);
    if (b.dataset.stop) { await api('runs/' + b.dataset.stop, 'PATCH', { status: 'cancelled' }); await refresh(); }
    if (b.dataset.retry) { const r = state.runs.find(r => r.id === b.dataset.retry); await api('runs', 'POST', { agentId: r.agentId, task: r.task }); await refresh(); }
    if (b.dataset.copy) { await navigator.clipboard.writeText(state.runs.find(r => r.id === b.dataset.copy).result); toast('Ergebnis kopiert.'); }
    if (b.dataset.handoff) { const r = state.runs.find(r => r.id === b.dataset.handoff); if (state.agents.length < 2) return toast('Erstelle zuerst einen zweiten Agenten.'); handoff = r.id; agentOptions($('handoff-agent'), r.agentId); $('handoff-task').value = ''; $('handoff-error').textContent = ''; $('handoff-dialog').showModal(); }
    if (b.dataset.toggle) { const r = state.routines.find(r => r.id === b.dataset.toggle); await api('routines/' + r.id, 'PATCH', { enabled: !r.enabled }); await refresh(); }
    if (b.dataset.removeRoutine && confirm('Diese Routine löschen?')) { await api('routines/' + b.dataset.removeRoutine, 'DELETE', {}); await refresh(); }
  } catch (e) { error(e); }
});
async function init() {
  try {
    status = await api('status');
    $('connection').textContent = 'Server erreichbar';
    if (!status.configured) { $('mode-banner').hidden = false; $('mode-banner').textContent = 'OpenAI-Verbindung noch nicht eingerichtet.'; }
    await refresh();
  } catch (e) { if ($('login').hidden) error(e); }
}
setInterval(() => { if (loggedIn && !document.hidden) refresh().catch(() => { $('connection').textContent = 'Verbindung unterbrochen'; }); }, 5000);
void init();

$('check-connection').onclick = async () => { const button = $('check-connection'); button.disabled = true; try { const result = await api('connection/check', 'POST', {}); $('connection-result').textContent = 'Echte API-Antwort erfolgreich empfangen · ' + result.model + ' · ' + time(result.checkedAt); } catch (e) { $('connection-result').textContent = e.message; } finally { button.disabled = false; } };
