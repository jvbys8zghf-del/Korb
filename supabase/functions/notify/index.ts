// Korb – Mitteilung „Anna geht einkaufen“ an die anderen im Haushalt (Web Push mit VAPID).
// Benötigte Secrets (Supabase → Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// SUPABASE_URL, SUPABASE_ANON_KEY und SUPABASE_SERVICE_ROLE_KEY stellt Supabase automatisch bereit.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Nur POST.' }, 405);

  const env = (k: string) => Deno.env.get(k) ?? '';
  if (!env('VAPID_PUBLIC_KEY') || !env('VAPID_PRIVATE_KEY')) return json({ sent: 0, note: 'Push ist nicht eingerichtet.' });

  // Wer ruft an? Über die Anmeldung des Aufrufers und die Datenbank-Regeln, nicht über Angaben im Body.
  const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: me, error } = await asUser.rpc('my_session');
  if (error || !me) return json({ error: 'Nicht Mitglied eines Haushalts.' }, 403);

  const body = await req.json().catch(() => ({}));
  if (body.type !== 'shopping') return json({ error: 'Unbekannte Mitteilung.' }, 400);
  const store = clip(body.store_name, 40), list = clip(body.list_name, 40);

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { data: subs, error: subErr } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, member_id, members!inner(push_enabled)')
    .eq('household_id', me.household_id)
    .neq('member_id', me.member_id)
    .eq('members.push_enabled', true);
  if (subErr) return json({ error: 'Abonnements nicht lesbar.' }, 500);

  webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:korb@example.invalid', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  const payload = JSON.stringify({
    title: `${me.member_name} geht einkaufen`,
    body: `${store ? `Bei ${store}. ` : ''}Fehlt noch was${list ? ` auf „${list}“` : ''}? Jetzt eintragen, es erscheint sofort.`,
    tag: `shopping-${me.member_id}`,
  });

  let sent = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 1800, urgency: 'high' });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint); // abgelaufen
    }
  }));
  return json({ sent });
});
