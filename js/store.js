// Korb – Datenschicht: lokaler Zustand (IndexedDB), Ausgangskorb für Offline-Änderungen, Sync und Live-Updates.
// Prinzip: Jede Änderung wirkt sofort lokal, landet im Ausgangskorb und wird gesendet, sobald Netz da ist.
// Konflikte löst die Datenbank per Last-Write-Wins über updated_at.
import * as idb from './idb.js';
import { TABLES, createSupabaseBackend, isConfigured } from './backend.js';
import * as L from './logic.js';

const rowId = (table, r) => (table === 'store_positions' ? `${r.store_id}|${r.pos_key}` : r.id);
const iso = () => new Date().toISOString();
export const ms = (t) => (t ? Date.parse(String(t).replace(/(\.\d{3})\d+/, '$1')) : 0);

const S = {
  backend: null,
  ready: false,
  session: null, // { household_id, household_name, invite_code, member_id, member_name }
  lostSession: null,
  data: Object.fromEntries(TABLES.map((t) => [t, new Map()])),
  cursors: {},
  outbox: [],
  prefs: { list: null, hintSeen: false },
  presence: [],
  sync: 'idle', // idle | syncing | offline | error
  realtime: false,
};
export const state = S;

// ---------- Beobachter ----------
const listeners = new Set();
let emitQueued = false;
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
function emit() {
  if (emitQueued) return;
  emitQueued = true;
  (window.requestAnimationFrame || setTimeout)(() => { emitQueued = false; listeners.forEach((fn) => fn()); });
}

// ---------- Speichern ----------
let saveTimer = null;
const snapshot = () => ({
  v: 1, session: S.session, lostSession: S.lostSession, cursors: S.cursors, outbox: S.outbox, prefs: S.prefs,
  data: Object.fromEntries(TABLES.map((t) => [t, [...S.data[t].values()]])),
});
function persist(now = false) {
  clearTimeout(saveTimer);
  if (now) return idb.set('state', snapshot());
  saveTimer = setTimeout(() => idb.set('state', snapshot()), 250);
}
async function loadLocal() {
  const snap = await idb.get('state');
  if (!snap || snap.v !== 1) return;
  Object.assign(S, { session: snap.session, lostSession: snap.lostSession || null, cursors: snap.cursors || {}, outbox: snap.outbox || [], prefs: { ...S.prefs, ...snap.prefs } });
  for (const t of TABLES) S.data[t] = new Map((snap.data[t] || []).map((r) => [rowId(t, r), r]));
}
function clearData() {
  for (const t of TABLES) S.data[t] = new Map();
  S.cursors = {}; S.outbox = []; S.prefs.list = null;
}

// ---------- Sync ----------
function setSync(v) { if (S.sync !== v) { S.sync = v; emit(); } }

function applyRemote(table, row) {
  const id = rowId(table, row), cur = S.data[table].get(id);
  if (cur && ms(cur.updated_at) > ms(row.updated_at)) return false;
  const pending = S.outbox.find((e) => e.table === table && rowId(table, e.row) === id);
  if (pending && ms(pending.row.updated_at) > ms(row.updated_at)) return false;
  S.data[table].set(id, { ...cur, ...row });
  return true;
}

function mutate(table, patch) {
  const id = rowId(table, patch);
  const cur = S.data[table].get(id);
  const row = { ...cur, ...patch, household_id: S.session.household_id, updated_at: iso() };
  S.data[table].set(id, row);
  const { synced_at, ...clean } = row;
  const entry = { table, row: clean };
  const i = S.outbox.findIndex((e) => e.table === table && rowId(table, e.row) === id);
  if (i >= 0) S.outbox[i] = entry; else S.outbox.push(entry);
  persist(); emit(); scheduleFlush();
  return row;
}

let flushing = false, flushTimer = null, retryTimer = null, retryDelay = 2000;
function scheduleFlush(delay = 300) { clearTimeout(flushTimer); flushTimer = setTimeout(flush, delay); }

const isDataError = (e) => /^(22|23|42)/.test(e?.cause?.code || ''); // ungültige Daten / Regelverstoß, nicht Netzwerk

async function flush() {
  if (flushing || !S.backend || !S.session || !S.outbox.length) return;
  if (!navigator.onLine) return setSync('offline');
  flushing = true; setSync('syncing');
  const batch = S.outbox.slice();
  try {
    for (const table of TABLES) {
      const entries = batch.filter((e) => e.table === table);
      if (!entries.length) continue;
      try {
        await S.backend.push(table, entries.map((e) => e.row));
      } catch (e) {
        if (!isDataError(e)) throw e;
        // Einzelne fehlerhafte Zeile darf den Rest nicht blockieren: einzeln senden, Unsendbares verwerfen
        for (const entry of entries) {
          try { await S.backend.push(table, [entry.row]); } catch (e2) {
            if (!isDataError(e2)) throw e2;
            console.warn('Korb: Änderung verworfen', table, entry.row, e2.message);
          }
        }
      }
    }
    S.outbox = S.outbox.filter((e) => !batch.includes(e));
    retryDelay = 2000;
    setSync('idle');
  } catch (e) {
    console.warn('Korb: Senden fehlgeschlagen', e.message);
    setSync(navigator.onLine ? 'error' : 'offline');
    clearTimeout(retryTimer);
    retryTimer = setTimeout(flush, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 60000);
  } finally {
    flushing = false; persist(); emit();
  }
  if (S.outbox.length && S.sync === 'idle') scheduleFlush();
}

let pulling = null;
function pullAll() {
  if (pulling) return pulling;
  if (!S.backend || !S.session || !navigator.onLine) return Promise.resolve();
  pulling = (async () => {
    const hh = S.session.household_id;
    for (const t of TABLES) {
      const since = S.cursors[t] ? new Date(ms(S.cursors[t]) - 5000).toISOString() : null;
      const rows = await S.backend.pull(t, hh, since);
      let max = S.cursors[t];
      for (const r of rows) { applyRemote(t, r); if (!max || ms(r.synced_at) > ms(max)) max = r.synced_at; }
      if (max) S.cursors[t] = max;
    }
    const h = await S.backend.household(hh).catch(() => null);
    if (h) Object.assign(S.session, { household_name: h.name, invite_code: h.invite_code });
    persist(); emit();
  })().catch((e) => { console.warn('Korb: Abruf fehlgeschlagen', e.message); setSync(navigator.onLine ? 'error' : 'offline'); })
    .finally(() => { pulling = null; });
  return pulling;
}

let presenceHandle = null;
function connectLive() {
  const { household_id: hh, member_id: me } = S.session;
  S.backend.subscribe(hh, (table, row) => { if (applyRemote(table, row)) { persist(); emit(); } }, (status) => {
    const was = S.realtime;
    S.realtime = status === 'SUBSCRIBED';
    if (S.realtime && !was) pullAll();
    emit();
  });
  presenceHandle = S.backend.presence(hh, me, (list) => { S.presence = list.filter((p) => p.member_id !== me); emit(); });
}

async function connect() {
  if (!S.backend) return;
  try {
    await S.backend.ensureAuth();
    if (!S.session) return;
    const sess = await S.backend.rpc('my_session');
    if (!sess) { S.lostSession = S.session; S.session = null; persist(true); emit(); return; }
    S.session = { ...S.session, ...sess };
    connectLive();
    await pullAll();
    await flush();
  } catch (e) {
    console.warn('Korb: Verbindung fehlgeschlagen', e.message);
    setSync(navigator.onLine ? 'error' : 'offline');
    clearTimeout(retryTimer); retryTimer = setTimeout(connect, 15000);
  }
}

export async function start({ mock = false } = {}) {
  if (mock) {
    const m = await import('./mock.js');
    idb.setNamespace(m.deviceId());
    S.backend = m.createMockBackend();
  }
  await loadLocal();
  if (!mock && !isConfigured()) { S.ready = true; S.unconfigured = true; emit(); return; }
  if (!mock) S.backend = createSupabaseBackend();
  S.ready = true; emit();
  window.addEventListener('online', () => { setSync('idle'); connect(); });
  window.addEventListener('offline', () => setSync('offline'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { pullAll().then(flush); } else persist(true);
  });
  window.addEventListener('pagehide', () => persist(true));
  if (!navigator.onLine) setSync('offline');
  connect();
}

// ---------- Haushalt ----------
async function adopt(sess) {
  const prev = S.session || S.lostSession;
  if (!prev || prev.household_id !== sess.household_id) clearData();
  S.session = sess; S.lostSession = null;
  persist(true); emit();
  connectLive();
  await pullAll();
  await flush();
}
const checkErr = (r) => { if (r && r.error) throw new Error(r.error); return r; };
export async function createHousehold(householdName, name, hue) {
  await S.backend.ensureAuth();
  await adopt(checkErr(await S.backend.rpc('create_household', { p_household: householdName, p_name: name, p_hue: hue })));
}
export async function joinHousehold(code, name, hue) {
  await S.backend.ensureAuth();
  await adopt(checkErr(await S.backend.rpc('join_household', { p_code: code, p_name: name, p_hue: hue })));
}
export async function membersByCode(code) {
  await S.backend.ensureAuth();
  return (await S.backend.rpc('household_members_by_code', { p_code: code })) || [];
}
export async function recover(code, memberId) {
  await S.backend.ensureAuth();
  await adopt(checkErr(await S.backend.rpc('recover_member', { p_code: code, p_member: memberId })));
}
export async function signOutDevice() {
  await idb.del('state');
  await S.backend?.signOut();
}

// ---------- Lesen ----------
const alive = (r) => r && !r.deleted;
export const me = () => S.session?.member_id;
export const members = () => [...S.data.members.values()].sort((a, b) => (a.id === me() ? -1 : b.id === me() ? 1 : a.name.localeCompare(b.name, 'de')));
export const member = (id) => S.data.members.get(id) || { id, name: id === me() ? (S.session?.member_name || 'Du') : 'Jemand', hue: 150 };
export const lists = () => [...S.data.lists.values()].filter(alive).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'de'));
export function currentList() {
  const all = lists();
  return all.find((l) => l.id === S.prefs.list) || all[0] || null;
}
export function setCurrentList(id) { S.prefs.list = id; persist(); emit(); }
export const items = (listId, done) => [...S.data.items.values()].filter((i) => alive(i) && i.list_id === listId && i.done === done);
export const item = (id) => S.data.items.get(id);
export const stores = () => [...S.data.stores.values()].filter(alive).sort((a, b) => ms(b.last_at) - ms(a.last_at) || a.name.localeCompare(b.name, 'de'));
export const store = (id) => S.data.stores.get(id);
export function positions(storeId) {
  const out = {};
  for (const r of S.data.store_positions.values()) if (r.store_id === storeId) out[r.pos_key] = { p: r.p, n: r.n };
  return out;
}
function describe(key) {
  let best = null;
  for (const i of S.data.items.values()) if (i.key === key && (!best || ms(i.updated_at) > ms(best.updated_at))) best = i;
  return best ? { name: best.name, emoji: best.emoji, cat: best.cat } : (({ name, emoji, cat }) => ({ name, emoji, cat }))(L.parseSegment(key));
}
export function suggestions(listId) {
  const purchases = [...S.data.purchases.values()].filter(alive).map((p) => ({ key: p.key, at: ms(p.bought_at) }));
  return L.suggestions(purchases, new Set(items(listId, false).map((i) => i.key)), describe);
}
export const pendingCount = () => S.outbox.length;
export const hint = { get seen() { return S.prefs.hintSeen; }, set seen(v) { S.prefs.hintSeen = v; persist(); } };

// ---------- Ändern ----------
export function addParsed(listId, parsed) {
  const res = [];
  for (const p of parsed) {
    const open = items(listId, false).find((i) => i.key === p.key);
    if (open) {
      const sum = L.addQty(open, p);
      if (sum) res.push({ type: 'merged', item: mutate('items', { id: open.id, ...sum }) });
      else if (open.qty == null && p.qty != null) res.push({ type: 'merged', item: mutate('items', { id: open.id, qty: p.qty, unit: p.unit }) });
      else res.push({ type: 'exists', item: open });
      continue;
    }
    const old = [...S.data.items.values()].find((i) => i.list_id === listId && i.key === p.key && (i.done || i.deleted));
    const base = { qty: p.qty, unit: p.unit, done: false, done_at: null, done_by: null, deleted: false, added_by: me(), added_at: iso() };
    if (old) { res.push({ type: 'reopened', item: mutate('items', { id: old.id, ...base }) }); continue; }
    res.push({ type: 'added', item: mutate('items', {
      id: L.uuid(), list_id: listId, name: p.name, key: p.key, emoji: p.emoji, cat: p.cat, note: p.note || '', ...base,
    }) });
  }
  return res;
}
const lastPurchase = new Map();
export function setDone(ids, done) {
  for (const id of ids) {
    const it = item(id);
    if (!it) continue;
    if (done) {
      mutate('items', { id, done: true, done_at: iso(), done_by: me() });
      const pid = L.uuid();
      mutate('purchases', { id: pid, key: it.key, bought_at: iso(), deleted: false });
      lastPurchase.set(id, pid);
    } else {
      mutate('items', { id, done: false, done_at: null, done_by: null });
      const pid = lastPurchase.get(id);
      if (pid && S.data.purchases.get(pid)) mutate('purchases', { id: pid, deleted: true });
      lastPurchase.delete(id);
    }
  }
}
export const readd = (id) => mutate('items', { id, done: false, done_at: null, done_by: null, deleted: false, added_by: me(), added_at: iso() });
export const updateItem = (id, patch) => mutate('items', { id, ...patch });
export const removeItem = (id) => mutate('items', { id, deleted: true });
export const restoreItem = (id) => mutate('items', { id, deleted: false });

export function addList(name, color) {
  const l = mutate('lists', { id: L.uuid(), name, color, sort: lists().length, deleted: false });
  setCurrentList(l.id);
  return l;
}
export const updateList = (id, patch) => mutate('lists', { id, ...patch });
export function deleteList(id) {
  mutate('lists', { id, deleted: true });
  if (S.prefs.list === id) setCurrentList(lists()[0]?.id || null);
}

export const addStore = (name) => mutate('stores', { id: L.uuid(), name, trips: 0, last_at: null, deleted: false });
export function finishTrip(storeId, sequence) {
  const changed = L.learnPositions(positions(storeId), sequence);
  for (const [pos_key, v] of Object.entries(changed)) mutate('store_positions', { store_id: storeId, pos_key, p: v.p, n: v.n });
  const s = store(storeId);
  mutate('stores', { id: storeId, trips: (s?.trips || 0) + 1, last_at: iso() });
}

export function updateMe(patch) {
  const cur = S.data.members.get(me()) || { id: me(), name: S.session.member_name, hue: 150, push_enabled: true };
  if (patch.name) S.session.member_name = patch.name;
  return mutate('members', { ...cur, ...patch, id: me() });
}

// ---------- Live: wer kauft ein? ----------
export function setShopping(info) {
  if (!presenceHandle) return;
  if (info) presenceHandle.track({ member_id: me(), shopping: true, since: Date.now(), ...info });
  else presenceHandle.untrack();
}
export const invoke = (fn, body) => S.backend.invoke(fn, body);
export const backend = () => S.backend;
