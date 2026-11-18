// Korb – Startseite: Kacheln, Eingabe, Abhaken mit verzögertem Nachrücken.
import * as store from './store.js';
import * as L from './logic.js';
import { $, esc, icon, avatar, transition, toast, reduced } from './dom.js';
import * as sheets from './sheets.js';

export const ui = { pending: new Set(), timer: null, recentAll: false, fresh: new Set(), flash: null };
let mounted = false;

export function mount(root) {
  root.innerHTML = `
    <header class="topbar" id="topbar"><div class="wrap">
      <span class="wordmark"><span class="mark" aria-hidden="true">${icon('basket')}</span>Korb</span>
      <span class="mini-title" id="miniTitle" aria-hidden="true"></span>
      <button type="button" class="avatars" id="avatarsBtn" aria-label="Haushalt und Einstellungen"><span id="avatars" style="display:flex"></span></button>
    </div></header>
    <main class="wrap" id="main">
      <section class="hero">
        <button type="button" class="list-switch" id="listSwitch" aria-label="Liste wechseln"><h1 id="listName"></h1>${icon('chevron', 'chev')}</button>
        <div class="meta" id="meta"></div>
        <div class="hero-actions"><button type="button" class="btn btn-primary" id="shopBtn">${icon('cart')} Einkaufen</button></div>
      </section>
      <div class="presence" id="presence" hidden></div>
      <section id="suggestBlock" hidden><h2 class="block-label">Vielleicht fällig</h2><div class="chips" id="suggest"></div></section>
      <section id="open" aria-label="Offene Artikel"></section>
      <section id="recentBlock" hidden><h2 class="block-label"><span>Zuletzt gekauft</span><button type="button" id="recentToggle"></button></h2><div class="grid recent" id="recent"></div></section>
    </main>
    <div class="composer"><div class="wrap">
      <div class="preview" id="preview" hidden></div>
      <form class="bar" id="addForm" autocomplete="off">
        <button type="button" class="round" id="recipeBtn" aria-label="Zutaten aus einem Rezept">${icon('book')}</button>
        <label class="sr" for="addInput">Artikel hinzufügen</label>
        <input id="addInput" type="text" placeholder="Was fehlt? z. B. 2 l Milch, Brot" enterkeyhint="enter" autocapitalize="sentences" autocorrect="off" spellcheck="false">
        <button type="submit" class="round go" id="addGo" aria-label="Hinzufügen" disabled>${icon('up')}</button>
      </form>
    </div></div>`;
  bind();
  mounted = true;
  render();
}
export const isMounted = () => mounted && document.getElementById('main');
export function unmount() { mounted = false; }

// ---------- Kacheln ----------
function tile(it) {
  const m = store.member(it.added_by), mine = it.added_by === store.me(), checked = ui.pending.has(it.id), qty = L.fmtQty(it);
  const cls = ['tile', checked && 'checked', ui.fresh.has(it.id) && 'fresh', ui.flash === it.id && 'flash'].filter(Boolean).join(' ');
  return `<button type="button" class="${cls}" data-id="${it.id}" data-act="tile" style="view-transition-name:t${it.id.replace(/-/g, '')}" aria-pressed="${checked}"
    aria-label="${esc(it.name)}${qty ? ', ' + esc(qty) : ''}${!mine ? ', von ' + esc(m.name) : ''}">
    <span class="tick">${icon('check')}</span>
    ${it.note ? '<span class="note-dot" aria-hidden="true"></span>' : ''}
    ${!mine ? `<span class="by" aria-hidden="true">${avatar(m, 'sm')}</span>` : ''}
    <span class="e" aria-hidden="true">${esc(it.emoji)}</span><span class="n">${esc(it.name)}</span><span class="q">${esc(qty)}</span></button>`;
}
const recentTile = (it) => `<button type="button" class="tile" data-id="${it.id}" data-act="readd" style="view-transition-name:t${it.id.replace(/-/g, '')}" aria-label="${esc(it.name)} wieder hinzufügen">
  <span class="e" aria-hidden="true">${esc(it.emoji)}</span><span class="n">${esc(it.name)}</span></button>`;

function syncLabel() {
  const st = store.state, n = store.pendingCount();
  if (st.sync === 'offline') return `<span class="sync offline">Offline${n ? ` · ${n} ${n === 1 ? 'Änderung wartet' : 'Änderungen warten'}` : ''}</span>`;
  if (st.sync === 'error') return `<span class="sync error">Sync hakt · versuche erneut</span>`;
  if (n && st.sync === 'syncing') return `<span class="sync syncing">Sende …</span>`;
  return '';
}

export function render() {
  if (!isMounted()) return;
  const list = store.currentList();
  if (!list) return;
  document.body.dataset.color = list.color;
  const open = store.items(list.id, false);
  const done = store.items(list.id, true).sort((a, b) => store.ms(b.done_at) - store.ms(a.done_at));

  $('#listName').textContent = list.name;
  $('#miniTitle').textContent = list.name;
  const shoppers = store.state.presence;
  $('#avatars').innerHTML = store.members().map((m) => avatar(m, shoppers.some((p) => p.member_id === m.id) ? 'live' : '')).join('');

  const last = open.slice().sort((a, b) => store.ms(b.added_at) - store.ms(a.added_at))[0];
  const who = last && (last.added_by === store.me() ? 'du' : store.member(last.added_by).name);
  $('#meta').innerHTML = (open.length ? `<span><b>${open.length}</b> offen${last ? ` · zuletzt ${esc(who)}, ${L.ago(store.ms(last.added_at))}` : ''}</span>` : '<span>Alles erledigt</span>') + syncLabel();

  const pres = $('#presence');
  const p = shoppers.find((x) => x.list_id === list.id) || shoppers[0];
  if (p) {
    const m = store.member(p.member_id);
    const mins = Math.max(1, Math.round((Date.now() - p.since) / 6e4));
    pres.hidden = false;
    pres.innerHTML = `<span class="pulse" aria-hidden="true"></span><div class="txt"><b>${esc(m.name)}</b> kauft gerade${p.store_name ? ` bei ${esc(p.store_name)}` : ''} ein
      <small>Seit ${mins} Min.${p.list_id === list.id ? ` · was du jetzt hinzufügst, sieht ${esc(m.name)} sofort` : ` · Liste „${esc(p.list_name || '')}“`}</small></div>${avatar(m)}`;
  } else pres.hidden = true;

  const sug = store.suggestions(list.id);
  $('#suggestBlock').hidden = !sug.length;
  $('#suggest').innerHTML = sug.map((s) => `<button type="button" class="chip ${s.ratio >= 1 ? 'due' : ''}" data-act="suggest" data-name="${esc(s.name)}">
    <span class="e" aria-hidden="true">${esc(s.emoji)}</span><span class="t">${esc(s.name)}<small>${s.ratio >= 1 ? 'fällig' : 'bald'} · alle ~${s.interval} Tage</small></span>
    <span class="plus" aria-hidden="true">${icon('plus')}</span></button>`).join('');

  let html = '';
  if (!open.length) {
    html = done.length
      ? `<div class="empty"><div class="e">✨</div><h2>Alles erledigt</h2><p>Unten eintippen, was als Nächstes fehlt.</p></div>`
      : `<div class="empty"><div class="e">🧺</div><h2>Korb ist leer</h2><p>Tippe unten, was fehlt. Mehrere auf einmal gehen auch: „2 l Milch, Brot, 500 g Hack“.</p></div>`;
  } else {
    L.CATS.forEach((c) => {
      const its = open.filter((i) => i.cat === c.key).sort((a, b) => store.ms(a.added_at) - store.ms(b.added_at));
      if (!its.length) return;
      html += `<h2 class="cat-label" style="--h:${c.hue}">${esc(c.name)}</h2><div class="grid">${its.map(tile).join('')}</div>`;
    });
    if (!store.hint.seen) html += `<p class="hint">Tippen hakt ab · Halten öffnet Details</p>`;
  }
  $('#open').innerHTML = html;

  const shown = ui.recentAll ? done.slice(0, 48) : done.slice(0, 8);
  $('#recentBlock').hidden = !done.length;
  $('#recentToggle').textContent = done.length > 8 ? (ui.recentAll ? 'Weniger' : 'Alle') : '';
  $('#recent').innerHTML = shown.map(recentTile).join('');
  ui.fresh.clear(); ui.flash = null;
}

// ---------- Abhaken ----------
function toggleTile(id) {
  if (ui.pending.has(id)) ui.pending.delete(id); else ui.pending.add(id);
  const el = document.querySelector(`.tile[data-id="${id}"]`);
  if (el) { el.classList.toggle('checked', ui.pending.has(id)); el.setAttribute('aria-pressed', ui.pending.has(id)); }
  clearTimeout(ui.timer);
  if (ui.pending.size) ui.timer = setTimeout(commitPending, 1400);
  if (!store.hint.seen) store.hint.seen = true;
}
function commitPending() {
  const ids = [...ui.pending];
  ui.pending.clear();
  if (!ids.length) return;
  store.setDone(ids, true);
  transition(render);
  const first = store.item(ids[0]);
  toast(ids.length === 1 ? `${first.name} erledigt` : `${ids.length} Artikel erledigt`, 'Rückgängig', () => { store.setDone(ids, false); transition(render); });
}

export function addFromText(text) {
  const list = store.currentList();
  const parsed = L.parseInput(text);
  if (!parsed.length || !list) return false;
  const res = store.addParsed(list.id, parsed);
  res.forEach((r) => (r.type === 'exists' ? (ui.flash = r.item.id) : ui.fresh.add(r.item.id)));
  transition(render);
  const merged = res.filter((r) => r.type === 'merged'), exists = res.filter((r) => r.type === 'exists');
  if (res.length === 1 && exists.length) toast(`${exists[0].item.name} steht schon drauf`);
  else if (res.length === 1 && merged.length) toast(`${merged[0].item.name}: jetzt ${L.fmtQty(merged[0].item)}`);
  else if (res.length > 1) toast(`${res.length} Artikel hinzugefügt${merged.length ? ` · ${merged.length} zusammengeführt` : ''}`);
  setTimeout(() => {
    const last = res[res.length - 1];
    const el = last && document.querySelector(`.tile[data-id="${last.item.id}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
  }, 80);
  return true;
}

// ---------- Eingabe ----------
const QTY_PREFIX = /^([\d.,½¼¾/]+\s*(x|×)?\s*((g|kg|ml|l|pck|packung|dose|flasche|bund|kiste|netz)\.?\s+)?)/i;
const lastSegment = (v) => { const parts = v.split(L.SPLIT_RE); return parts[parts.length - 1].trim(); };
function renderPreview() {
  const input = $('#addInput'), v = input.value, pv = $('#preview');
  $('#addGo').disabled = !v.trim();
  if (!v.trim()) { pv.hidden = true; pv.innerHTML = ''; return; }
  const list = store.currentList();
  const parsed = L.parseInput(v);
  const openNow = list ? store.items(list.id, false) : [];
  let html = '';
  if (parsed.length > 1 || parsed.some((p) => p.qty != null)) {
    html += `<div class="lbl">${parsed.length === 1 ? 'Wird hinzugefügt' : `${parsed.length} Artikel erkannt`}</div><div class="pv-items">` +
      parsed.map((p) => {
        const ex = openNow.find((o) => o.key === p.key), sum = ex && L.addQty(ex, p);
        const tag = ex ? (sum ? `→ ${L.fmtQty(sum)}` : 'schon drauf') : L.fmtQty(p);
        return `<span class="pv ${ex ? 'merge' : ''}"><span aria-hidden="true">${esc(p.emoji)}</span>${esc(p.name)}${tag ? ` <small>${esc(tag)}</small>` : ''}</span>`;
      }).join('') + '</div>';
  }
  const seg = lastSegment(v).replace(QTY_PREFIX, '');
  const hits = seg ? L.search(seg, 5).filter((e) => e.name.toLowerCase() !== seg.toLowerCase()) : [];
  if (hits.length) {
    html += `<div class="sugg">${hits.map((e) => {
      const ex = openNow.find((o) => o.key === L.norm(e.name));
      return `<button type="button" data-act="complete" data-name="${esc(e.name)}"><span class="e" aria-hidden="true">${e.emoji}</span>${esc(e.name)}<span class="c">${ex ? 'schon drauf' : esc(L.catName(e.cat))}</span></button>`;
    }).join('')}</div>`;
  }
  pv.hidden = !html;
  pv.innerHTML = html;
}
function complete(name) {
  const input = $('#addInput'), v = input.value, seg = lastSegment(v);
  const prefix = v.slice(0, v.length - seg.length);
  input.value = prefix + (seg.match(QTY_PREFIX) || [''])[0] + name;
  input.focus();
  renderPreview();
}

// ---------- Ereignisse ----------
function bind() {
  let press = null;
  const root = document.getElementById('app');
  root.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('.tile[data-act="tile"]');
    if (!t) return;
    press = { id: t.dataset.id, x: e.clientX, y: e.clientY, long: false };
    press.timer = setTimeout(() => { press.long = true; sheets.itemSheet(t.dataset.id); }, 480);
  });
  const cancel = (e) => { if (press && (e.type !== 'pointermove' || Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10)) clearTimeout(press.timer); };
  ['pointerup', 'pointercancel', 'pointermove'].forEach((ev) => root.addEventListener(ev, cancel, { passive: true }));
  root.addEventListener('contextmenu', (e) => {
    const t = e.target.closest('.tile[data-act="tile"]');
    if (t) { e.preventDefault(); if (!press || !press.long) sheets.itemSheet(t.dataset.id); }
  });
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    const act = el.dataset.act;
    if (act === 'tile') { if (press && press.long && press.id === el.dataset.id) { press = null; return; } toggleTile(el.dataset.id); }
    else if (act === 'readd') { const id = el.dataset.id; ui.fresh.add(id); store.readd(id); transition(render); }
    else if (act === 'suggest') addFromText(el.dataset.name);
    else if (act === 'complete') complete(el.dataset.name);
  });
  $('#recentToggle').addEventListener('click', () => { ui.recentAll = !ui.recentAll; transition(render); });
  $('#listSwitch').addEventListener('click', () => sheets.listsSheet());
  $('#avatarsBtn').addEventListener('click', () => sheets.householdSheet());
  $('#presence').addEventListener('click', () => sheets.householdSheet());
  $('#shopBtn').addEventListener('click', () => sheets.storeSheet());
  $('#recipeBtn').addEventListener('click', () => sheets.recipeSheet());

  const input = $('#addInput');
  input.addEventListener('input', renderPreview);
  input.addEventListener('paste', (e) => {
    const txt = e.clipboardData?.getData('text') || '';
    if (!/\n/.test(txt)) return;
    e.preventDefault();
    const joined = txt.split(/\n+/).map((s) => s.trim()).filter(Boolean).join(', ');
    input.value = (input.value.trim() ? input.value.replace(/,?\s*$/, ', ') : '') + joined;
    renderPreview();
  });
  $('#addForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (addFromText(input.value)) { input.value = ''; renderPreview(); }
  });
  const top = $('#topbar');
  const onScroll = () => top.classList.toggle('scrolled', window.scrollY > 44);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}
