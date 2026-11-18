// Korb – Anbindung an Supabase. Die Datenschicht (store.js) spricht nur mit dieser Schnittstelle.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const TABLES = ['lists', 'stores', 'members', 'items', 'purchases', 'store_positions']; // Reihenfolge = Abhängigkeiten
const CONFLICT = { store_positions: 'store_id,pos_key' };
const PAGE = 1000;

export function createSupabaseBackend() {
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'korb-auth' },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  let dataChannel = null, presenceChannel = null;

  const unwrap = ({ data, error }) => { if (error) throw Object.assign(new Error(error.message || 'Fehler'), { cause: error }); return data; };

  return {
    kind: 'supabase',
    async ensureAuth() {
      const { data } = await client.auth.getSession();
      if (data.session) return data.session.user.id;
      const res = unwrap(await client.auth.signInAnonymously());
      return res.user.id;
    },
    rpc: async (name, args) => unwrap(await client.rpc(name, args)),
    async pull(table, householdId, since) {
      const rows = [];
      let cursor = since;
      for (;;) {
        let q = client.from(table).select('*').eq('household_id', householdId).order('synced_at', { ascending: true }).limit(PAGE);
        if (cursor) q = q.gt('synced_at', cursor);
        const page = unwrap(await q);
        rows.push(...page);
        if (page.length < PAGE) break;
        cursor = page[page.length - 1].synced_at;
      }
      return rows;
    },
    async push(table, rows) {
      if (!rows.length) return;
      if (table === 'members') { // Mitglieder entstehen nur über die Beitritts-Funktionen, hier nur ändern
        for (const r of rows) {
          unwrap(await client.from('members').update({ name: r.name, hue: r.hue, push_enabled: r.push_enabled, updated_at: r.updated_at }).eq('id', r.id));
        }
        return;
      }
      unwrap(await client.from(table).upsert(rows, CONFLICT[table] ? { onConflict: CONFLICT[table] } : undefined));
    },
    async household(householdId) {
      return unwrap(await client.from('households').select('id,name,invite_code').eq('id', householdId).maybeSingle());
    },
    subscribe(householdId, onRow, onStatus) {
      if (dataChannel) client.removeChannel(dataChannel);
      dataChannel = client.channel('korb-data-' + householdId);
      for (const table of TABLES) {
        dataChannel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` },
          (payload) => payload.new && Object.keys(payload.new).length && onRow(table, payload.new));
      }
      dataChannel.subscribe((status) => onStatus(status));
    },
    // Wer kauft gerade ein? Flüchtiger Zustand, nichts davon wird gespeichert.
    presence(householdId, memberId, onSync) {
      if (presenceChannel) client.removeChannel(presenceChannel);
      presenceChannel = client.channel('korb-presence-' + householdId, { config: { presence: { key: memberId } } });
      presenceChannel.on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        onSync(Object.values(state).flat().filter((p) => p && p.shopping));
      });
      presenceChannel.subscribe();
      return {
        track: (payload) => presenceChannel.track(payload).catch(() => {}),
        untrack: () => presenceChannel.untrack().catch(() => {}),
      };
    },
    async invoke(fn, body) {
      const { data, error } = await client.functions.invoke(fn, { body });
      if (error) {
        let msg = error.message;
        try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) {}
        throw new Error(msg);
      }
      return data;
    },
    async savePushSubscription(row) { unwrap(await client.from('push_subscriptions').upsert(row)); },
    async deletePushSubscription(endpoint) { unwrap(await client.from('push_subscriptions').delete().eq('endpoint', endpoint)); },
    async signOut() { await client.auth.signOut().catch(() => {}); },
  };
}

export const isConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
