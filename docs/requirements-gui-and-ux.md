# Requirements & Spezifikation: Web Client GUI & UX 🖥️

Dieses Dokument spezifiziert die fachlichen und technischen Anforderungen an das Frontend (`apps/web-client`), das Canvas-Rendering, das Dashboard-Layout und die Benutzerführung.

---

## 1. Frontend-Architektur

- **Tech Stack:** Next.js 14 + React 18 + TypeScript.
- **WebSocket-Streaming:** Langlebige Verbindung (`/api/ws`) zum API-Gateway mit automatischem Fallback-Polling (1000ms).
- **Dark Theme Standard:** Konsistente Farbpalette im dunklen Retro-Stil (`#0f172a` Hintergründe, `#1e293b` Panels, `#38bdf8` Akzente).

---

## 2. Interactive World Map (HTML5 Canvas Engine)

- **Canvas-Rendermotor:** Hochleistungs-Rendering des 256x256-Gitters.
- **Interaktive Steuerung:** Pan & Drag per Maus, Stufenloser Zoom (Mousewheel / Buttons), Kamera-Zentrierung auf den Spieler.
- **Flüssige Bewegung (LERP):** Interpolation von Agenten-Positionen für sanfte Bewegung.
- **Hover-Tooltips & Pfadanzeige:** Anzeigen von Kachelinformationen und Zielpfaden per Toggle.

---

## 3. Soziale Dreigliederung Dashboards

- **🗺️ Live Map Tab:** Canvas-Karte (1:1), vertikale Legende, Master-Steuerung, nebeneinander liegende Active-Agents-Tabelle (ohne Status-Spalte) & Agenten-Detailkarte, Live-Event-Feed und nach unten verschobener Mitmach-Modus (Human Player).
- **🏛️ Dreigliederung Dropdown:** Gruppiert die drei Game-Manager KI-Seiten:
  - **📖 Geistesleben Board:** Kognitive Agenteninteressen, Relikt-Spawns, Inspirationen und KI-Gedanken-Stream.
  - **⚖️ Rechtssphäre Board:** Gerichtshof-Richtlinien (Grasland-/Waldnutzung), aktive Gesetzgebung und Katasteramt.
  - **🌾 Wirtschaftsleben Board:** Ressourcenbestände (Gras, Wasser, Holz, Beeren, Müll), Kooperationsvereinbarungen und Katastrophen-Log.
- **⚙️ Admin Dropdown & Unterseiten:** Strukturiert in 3 Haupt-Unterseiten:
  - **⚙️ Allgemein:** Ollama KI-Einstellungen, Sim-Speed, Landschaftsparameter, Singleplayer-Savegames.
  - **🌐 Kartenmanagement:** Interaktiver OSM Vektorkarten- & Maßstab-Inspektor (WGS84 ➔ 10m Sim Grid), Boundingbox-Rechner (2.56km Sektor vs 25.6km Welt), Schnellauswahl-Presets (Augsburg, München, Nürnberg) & Geodatenquellen-Verwaltung.
  - **👥 Agentenprofile:** Vitalwerte-Inspektor, Inventar und Kognitions-Log.
- **📖 About Tab:** Technische Dokumentationszentrale mit Sub-Tab-Navigation.

---

## 6. Implementierte GUI & UX Features ✅

### 6.1 Kartenverwaltung & Admin-Bereich
- ✅ **Karten-Erstellungszeit:** Erstellungszeitstempel (`createdAt`) im Admin-Board mit World-Size und Version
- ✅ **Spielstand-Speicherung:** Speichern/Laden von Simulationen (`/api/control/save-game`, `/api/control/load-game`)
- ✅ **Regenerate-Dialog:** Bestätigungsdialog mit Rückmeldung zum Artefakt-Zurücksetzen
- ✅ **OSM-Vektorkarten-Inspektor:** Interaktive 2D-Karteneinsicht mit WGS84 → 10m Grid Projektion
- ✅ **Admin-Menü mit Unterseiten:** Strukturierung in "Kartenmanagement", "Agentenprofile", "Allgemein & Landschaft"

### 6.2 Map & Dashboard Layout
- ✅ **Quadratischer Viewport:** 1:1 Aspect-Ratio Map mit vertikaler Legende daneben
- ✅ **Dreigliederungs-Dropdown:** Gruppiert die drei Game-Manager KI-Seiten in einem Menü
- ✅ **Sidebar-Optimierung:** Mitmach-Modus nach unten, Status-Spalte entfernt, Agenten-Details daneben

---

## 6. FooterBar & Hintergrund-Prozesse

- **Platzsparendes Auto-Packing:** Alle Dashboards nutzen `display: grid`, `grid-template-columns: repeat(auto-fill, minmax(360px, 1fr))` und `grid-auto-flow: dense`.
- **Responsive Anpassung:** Automatische Ausrichtung ohne ungenutzte Freiräume bei variablen Bildschirmauflösungen.

---

## 5. FooterBar & Hintergrund-Prozesse

- **Einzeilige Task-Leiste:** Anzeige des Status laufender Hintergrund-Dienste im Footer.
- **Hover-Tooltips:** Detaillierte Tooltips für:
  - ⚙️ **Sim Tick Loop** (Status & Tick-Zähler)
  - 🧠 **Mesa Agent Service** (gRPC Port :50051)
  - 🦙 **Ollama KI Provider** (Modell, Modus & Timeout)
  - 🌍 **Federated Shards** (Aktive Sektor-Knoten)
