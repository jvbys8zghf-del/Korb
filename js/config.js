// Korb – Verbindung zu deinem Supabase-Projekt.
// Werte findest du im Supabase-Dashboard unter Project Settings → API (bzw. „Data API“ und „API Keys“).
// Der „anon“/„publishable“ Key darf öffentlich sein: Die Zugriffsregeln (RLS) in der Datenbank schützen die Daten.
// NIEMALS den „service_role“/„secret“ Key hier eintragen.
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

// Öffentlicher VAPID-Schlüssel für Push-Benachrichtigungen (siehe README, Abschnitt Push). Leer = Push ausgeblendet.
export const VAPID_PUBLIC_KEY = '';
