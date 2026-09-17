# Getränkekasse – zentrale Version

Die App ist für Julien Ehrlich vorkonfiguriert und enthält die neun vereinbarten Getränke.

## Was jetzt zentral gespeichert wird
- Buchungen und Stornierungen
- offener Kontostand (aus Buchungen berechnet)
- freiwillige PIN als SHA-256-Hash
- Getränke und Preise

## Datenbank in ca. 5 Minuten einrichten
1. Kostenloses Supabase-Projekt anlegen.
2. Im Supabase SQL Editor den kompletten Inhalt von `supabase-schema.sql` ausführen.
3. In Supabase unter Project Settings / API die **Project URL** und den **anon public key** kopieren.
4. `config.js` öffnen und beide Werte eintragen.
5. Den gesamten Ordner auf GitHub Pages / Netlify / Vercel hochladen.

Solange `config.js` leer ist, läuft die App automatisch im lokalen Demo-Modus.

## Sicherheit
Diese erste private Klein-App nutzt den öffentlichen Supabase-Key und einfache RLS-Regeln. Die PIN wird nicht im Klartext gespeichert. Für eine öffentlich beworbene oder besonders schützenswerte Anwendung sollte als nächste Stufe Supabase Auth bzw. eine serverseitige PIN-Prüfung ergänzt werden.
