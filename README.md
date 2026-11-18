# Korb

Die Einkaufsliste für euren Haushalt. Eine Web-App für das iPhone, die auf den Home-Bildschirm gehört: live geteilt, offline nutzbar, ohne Konto, ohne Werbung, ohne Tracking.

**Was Korb kann**
- Kacheln nach Gang sortiert; Tippen hakt ab, Halten öffnet Details
- Mehrere Artikel auf einmal eintippen: `2 l Milch, Brot, 500 g Hack`; Mengen werden zusammengeführt
- Einkaufsmodus, der pro Laden lernt, in welcher Reihenfolge du durch den Markt gehst
- „Anna kauft gerade bei Rewe ein“, live; optional als Mitteilung aufs iPhone
- Vorschläge für Wiederkehrendes („Milch, alle ~5 Tage“)
- Rezepte per Link oder Text: Portionen umrechnen, Vorräte abwählen, zusammenführen
- Mehrere Listen mit Farbe, Beitritt per Code, Rückkehr nach Gerätewechsel
- Offline voll bedienbar, Änderungen werden nachgeliefert

**Technik:** Statische Web-App (HTML, CSS, JavaScript, kein Build-Schritt) auf GitHub Pages, Daten in Supabase (Postgres mit Zugriffsregeln, Realtime, zwei Edge Functions).

---

## Einrichtung (ca. 20 Minuten, einmalig)

### 1. Supabase-Projekt
1. Auf [supabase.com](https://supabase.com) anmelden → **New project**. Name `korb`, Region **Central EU (Frankfurt)**. Das Datenbank-Passwort sicher notieren; Korb selbst braucht es nicht.
2. **Authentication → Sign In / Providers** (je nach Version auch *Auth → Settings*): **Allow anonymous sign-ins** einschalten und speichern.
3. **SQL Editor → New query**: den kompletten Inhalt von `supabase/schema.sql` einfügen → **Run**. Erwartung: „Success. No rows returned“. Das Skript darf mehrfach laufen.
4. **Project Settings → API** (bzw. *Data API* und *API Keys*): die **Project URL** und den **anon / publishable key** kopieren.
5. In `js/config.js` eintragen:
   ```js
   export const SUPABASE_URL = 'https://DEIN-PROJEKT.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJ…';   // anon/publishable, NICHT service_role/secret
   ```

### 2. Rezeptimport per Link (Edge Function)
1. Supabase → **Edge Functions → Deploy a new function → Via Editor**.
2. Name genau `recipe-import`. Den Inhalt von `supabase/functions/recipe-import/index.ts` einfügen → **Deploy**.
3. „Verify JWT“ eingeschaltet lassen.

Ohne diese Funktion klappt der Rezeptimport trotzdem, wenn man die Zutatenliste als Text einfügt.

### 3. Mitteilungen „Anna geht einkaufen“ (optional)
1. GitHub Pages zuerst einrichten (Schritt 4), dann `https://DEIN-NAME.github.io/korb/tools/vapid.html` öffnen → **Schlüssel erzeugen**. Das Schlüsselpaar entsteht nur in deinem Browser.
2. Supabase → **Edge Functions → Secrets** (bzw. *Manage secrets*), drei Einträge:
   - `VAPID_PUBLIC_KEY` = öffentlicher Schlüssel
   - `VAPID_PRIVATE_KEY` = privater Schlüssel (geheim, nirgendwo sonst eintragen)
   - `VAPID_SUBJECT` = `https://DEIN-NAME.github.io/korb/`
3. Edge Function `notify` wie in Schritt 2 anlegen (Inhalt aus `supabase/functions/notify/index.ts`).
4. Den **öffentlichen** Schlüssel in `js/config.js` bei `VAPID_PUBLIC_KEY` eintragen.
5. Auf jedem iPhone: Korb vom Home-Bildschirm öffnen → oben rechts auf die Profilbilder → **Mitteilungen** einschalten.

### 4. Veröffentlichen mit GitHub Pages
1. Auf GitHub ein Repository `korb` anlegen (**Public**, sonst ist Pages kostenpflichtig). Die Daten bleiben trotzdem geschützt: Sie liegen in Supabase, nicht im Code.
2. Alle Dateien dieses Ordners hochladen (*Add file → Upload files*), inklusive `.nojekyll`.
3. **Settings → Pages → Build and deployment**: Source *Deploy from a branch*, Branch `main`, Ordner `/ (root)` → **Save**.
4. Nach 1–2 Minuten läuft Korb unter `https://DEIN-NAME.github.io/korb/`.

### 5. Auf die iPhones bringen
1. Die Adresse in **Safari** öffnen (nicht in Chrome oder in der Vorschau eines Messengers).
2. Teilen-Symbol → **Zum Home-Bildschirm** → Hinzufügen.
3. Korb über das neue Symbol öffnen. Die erste Person wählt **Neuen Haushalt anlegen**, alle anderen **Mit Code beitreten**. Den Code findet man oben rechts bei den Profilbildern.

Wichtig: Die Home-Bildschirm-App hat einen eigenen Speicher. Deshalb erst installieren, dann beitreten.

---

## Updates veröffentlichen
1. Dateien ändern und hochladen.
2. In `sw.js` die Zeile `const VERSION = 'korb-v1'` hochzählen (`korb-v2` …).
3. Beim nächsten Öffnen zeigt Korb „Neue Version · Neu laden“.

Ohne neue `VERSION` bleiben die Geräte auf der alten, zwischengespeicherten Fassung.

## Lokal entwickeln
```bash
python3 -m http.server 8000
```
- `http://localhost:8000/?mock`: Test-Modus ohne Server. Jeder Browser-Tab verhält sich wie ein eigenes iPhone; Live-Sync zwischen Tabs.
- `npm test`: Tests für Parser, Mengen, Vorschläge, Markt-Sortierung und Rezepte (Node 20+).

## Wie die Daten geschützt sind
- **Anmeldung:** Jedes Gerät meldet sich anonym bei Supabase an und wird über den Einladungscode einem Haushalt zugeordnet.
- **Zugriffsregeln:** Die Regeln in der Datenbank (Row Level Security) lassen jedes Gerät nur die Daten des eigenen Haushalts lesen und schreiben. Getestet mit fremden Geräten, falschen Codes und veralteten Offline-Änderungen.
- **Der Einladungscode ist der Schlüssel zum Haushalt.** Er hat 6 Zeichen aus 32 Möglichkeiten, also rund eine Milliarde Kombinationen. Nach 10 Versuchen in 15 Minuten sperrt der Server. Wer den Code kennt, kann beitreten und sich als bestehendes Mitglied anmelden. Gebt ihn also nur innerhalb des Haushalts weiter.
- **Öffentliche Schlüssel:** Der anon-Key und der öffentliche VAPID-Schlüssel dürfen öffentlich sein. Der service_role-Key und der private VAPID-Schlüssel gehören nie in den Code.
- **Kein Tracking:** Keine Analyse, keine Werbung, keine externen Schriften.

## Bekannte Grenzen (iPhone-Web-Apps)
- Keine Haptik (Vibration); Safari erlaubt das Web-Apps nicht.
- Korb erscheint nicht im Teilen-Menü anderer Apps. Rezepte daher per Link einfügen.
- Mitteilungen nur in der Home-Bildschirm-App ab iOS 16.4.
- Keine Live Activity, kein Widget, kein Siri, keine Apple Watch. Das ginge nur mit einer nativen App.
- Für den Rezeptimport per Link muss die Seite ein maschinenlesbares Rezept (schema.org) enthalten. Das trifft auf die meisten großen Rezeptseiten zu.

## Aufbau
```
index.html, manifest.webmanifest, sw.js     App-Hülle, Installation, Offline-Cache
css/app.css                                 Design (hell/dunkel, Safe Areas)
js/main.js                                  Start, Ansicht wählen, Updates
js/store.js                                 lokaler Zustand, Ausgangskorb, Sync, Live-Updates
js/backend.js | js/mock.js                  Supabase | Test-Backend
js/logic.js, js/catalog.js                  Parser, Mengen, Vorschläge, Markt-Lernen, Katalog
js/home.js, js/sheets.js, js/onboarding.js  Oberfläche
js/push.js                                  Mitteilungen
supabase/schema.sql                         Datenbank, Zugriffsregeln, Funktionen
supabase/functions/*                        Rezeptimport, Mitteilungen
tools/vapid.html                            Push-Schlüssel erzeugen
vendor/supabase-2.118.0.js                  Supabase-Bibliothek (MIT), lokal für den Offline-Betrieb
```
