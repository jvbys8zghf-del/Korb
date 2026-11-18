// Korb – Test-Backend ohne Server. Nur für die Entwicklung auf localhost mit ?mock in der Adresse.
// Simuliert Supabase im Browser: gemeinsame Daten über localStorage, „Realtime“ zwischen Tabs über BroadcastChannel.
import { TABLES } from './backend.js';

const KEY = 'korb-mock-server';
const bc = new BroadcastChannel('korb-mock');
const now = () => new Date().toISOString();
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } };
const db = () => load() || { households: [], members: [], devices: [], ...Object.fromEntries(TABLES.filter((t) => t !== 'members').map((t) => [t, []])) };
const save = (d) => localStorage.setItem(KEY, JSON.stringify(d));
const idOf = (table, r) => (table === 'store_positions' ? r.store_id + '|' + r.pos_key : r.id);

export function deviceId() {
  let u = sessionStorage.getItem('korb-mock-uid');
  if (!u) { u = crypto.randomUUID(); sessionStorage.setItem('korb-mock-uid', u); }
  return u;
}

export function createMockBackend() {
  let uid = deviceId();
  const session = (d, memberId) => {
    const m = d.members.find((x) => x.id === memberId), h = d.households.find((x) => x.id === m.household_id);
    return { household_id: h.id, household_name: h.name, invite_code: h.invite_code, member_id: m.id, member_name: m.name };
  };
  const myMember = (d) => d.devices.find((x) => x.auth_uid === uid)?.member_id;
  const code = () => 'KORB-' + Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  const listeners = { data: null, presence: null };
  const presenceState = new Map();

  bc.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'row' && listeners.data && m.row.household_id === listeners.data.hh) listeners.data.fn(m.table, m.row);
    if (m.type === 'presence' && listeners.presence) {
      if (m.payload) presenceState.set(m.key, m.payload); else presenceState.delete(m.key);
      listeners.presence([...presenceState.values()]);
      if (m.ask && listeners.presence.mine) bc.postMessage({ type: 'presence', key: listeners.presence.key, payload: listeners.presence.mine });
    }
  };
  const rpcs = {
    my_session: (d) => (myMember(d) ? session(d, myMember(d)) : null),
    create_household: (d, a) => {
      if (myMember(d)) throw new Error('Dieses Gerät gehört schon zu einem Haushalt.');
      const h = { id: crypto.randomUUID(), name: a.p_household, invite_code: code() };
      const m = { id: crypto.randomUUID(), household_id: h.id, name: a.p_name, hue: a.p_hue, push_enabled: true, updated_at: now(), synced_at: now() };
      d.households.push(h); d.members.push(m); d.devices.push({ auth_uid: uid, member_id: m.id });
      d.lists.push({ id: crypto.randomUUID(), household_id: h.id, name: 'Einkauf', color: 'basil', sort: 0, deleted: false, updated_at: now(), synced_at: now() });
      return session(d, m.id);
    },
    join_household: (d, a) => {
      const h = d.households.find((x) => x.invite_code === a.p_code.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^KORB/, 'KORB-'));
      if (!h) return { error: 'Diesen Code gibt es nicht. Bitte prüfen.' };
      const m = { id: crypto.randomUUID(), household_id: h.id, name: a.p_name, hue: a.p_hue, push_enabled: true, updated_at: now(), synced_at: now() };
      d.members.push(m); d.devices.push({ auth_uid: uid, member_id: m.id });
      bc.postMessage({ type: 'row', table: 'members', row: m });
      return session(d, m.id);
    },
    household_members_by_code: (d, a) => {
      const h = d.households.find((x) => x.invite_code === a.p_code.toUpperCase().trim());
      return h ? d.members.filter((m) => m.household_id === h.id).map(({ id, name, hue }) => ({ id, name, hue })) : [];
    },
    recover_member: (d, a) => {
      d.devices = d.devices.filter((x) => x.auth_uid !== uid);
      d.devices.push({ auth_uid: uid, member_id: a.p_member });
      return session(d, a.p_member);
    },
  };

  return {
    kind: 'mock',
    async ensureAuth() { return uid; },
    async rpc(name, args) { const d = db(); const r = rpcs[name](d, args || {}); save(d); return r; },
    async pull(table, hh, since) {
      return db()[table].filter((r) => r.household_id === hh && (!since || r.synced_at > since)).sort((a, b) => (a.synced_at < b.synced_at ? -1 : 1));
    },
    async push(table, rows) {
      if (!navigator.onLine) throw new Error('offline');
      const d = db();
      for (const row of rows) {
        const i = d[table].findIndex((r) => idOf(table, r) === idOf(table, row));
        if (i >= 0 && d[table][i].updated_at > row.updated_at) continue; // Last-Write-Wins
        const merged = { ...(i >= 0 ? d[table][i] : {}), ...row, synced_at: now() };
        if (i >= 0) d[table][i] = merged; else d[table].push(merged);
        bc.postMessage({ type: 'row', table, row: merged });
      }
      save(d);
    },
    async household(hh) { return db().households.find((h) => h.id === hh) || null; },
    subscribe(hh, fn, onStatus) { listeners.data = { hh, fn }; setTimeout(() => onStatus('SUBSCRIBED'), 0); },
    presence(hh, memberId, onSync) {
      listeners.presence = onSync; onSync.key = memberId;
      bc.postMessage({ type: 'presence', key: '_', payload: null, ask: true });
      return {
        track: (p) => { onSync.mine = p; bc.postMessage({ type: 'presence', key: memberId, payload: p }); },
        untrack: () => { onSync.mine = null; bc.postMessage({ type: 'presence', key: memberId, payload: null }); },
      };
    },
    async invoke(fn, body) {
      if (fn === 'notify') return { sent: 0 };
      throw new Error('Rezept-Links gehen erst mit dem echten Server. Füge den Rezepttext ein.');
    },
    async savePushSubscription() {},
    async deletePushSubscription() {},
    async signOut() { sessionStorage.removeItem('korb-mock-uid'); uid = null; },
  };
}
