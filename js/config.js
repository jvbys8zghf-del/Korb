// Korb – Verbindung zu deinem Supabase-Projekt.
// Werte findest du im Supabase-Dashboard unter Project Settings → API (bzw. „Data API“ und „API Keys“).
// Der „anon“/„publishable“ Key darf öffentlich sein: Die Zugriffsregeln (RLS) in der Datenbank schützen die Daten.
// NIEMALS den „service_role“/„secret“ Key hier eintragen.
export const SUPABASE_URL = 'https://cuzxgsvrxoldzojbjhvx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1enhnc3ZyeG9sZHpvamJqaHZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwMzI0MDYsImV4cCI6MjExMDYwODQwNn0.JQW8r760S_2t1bvAY3YURm1UdBgTRkXOehuR3dFsuWg';

// Öffentlicher VAPID-Schlüssel für Push-Benachrichtigungen (siehe README, Abschnitt Push). Leer = Push ausgeblendet.
export const VAPID_PUBLIC_KEY = 'BMYJtKSvBL2fFIQF_Vb1EomAK-iTbWqkZf7qzqIvKigZFcX88TTkulvdIqAk1u9TEqInvEkTnNE9WfNjNrBvhqc';
