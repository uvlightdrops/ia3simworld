# Offene & Zukünftige Kundenanforderungen 📋

Dieses Dokument listet ausschließlich die **neuen, offenen oder zukünftigen** funktionalen Anforderungen an die IA3 SimWorld-Plattform. 

Alle erfolgreich umgesetzten Anforderungen wurden systematisch archiviert und in die entsprechenden technischen Dokumente überführt (siehe **ℹ️ About**-Menüpunkt im Game-Frontend oder im Ordner `docs/`):
- `docs/requirements-and-architecture.md` (Architektur, Multiplayer, Geländegenerator, unendliche Sektoren, UX-Feinheiten, LERP-Bewegung)
- `docs/agent-logic-and-cooperation.md` (Kognitives Verhalten, soziale Transmission, Vereinbarungen, tageszeitabhängige Zyklen, Herbst-Festival-Szenario)
- `docs/opensim-interoperability.md` (OpenSIM-PNG-Heightmaps, LSL-Skripte, Koordinatenskalierung, 256x256-Kacheldimensionen)

---

## Offene Entwicklungsziele

### 1. World & Spieler-Interaktion (Abgeschlossen & Archiviert)
- **[x] Interaktive Anfragen:** Die human player interagieren ebenso mit den NPC wie diese untereinander.
- **[x] Echtzeit-Entscheidungen & Auto-Antworten:** Ein human player kann eine Interaktionsanfrage eines NPC entweder manuell (Multiple Choice innerhalb von 12 Ticks) oder per vorkonfiguriertem Auto-Antwort-Modus (Auto-Accept / Auto-Reject) beantworten.
- **[x] Tiefere Interaktion:** NPCs fragen an, ob eine tiefere Interaktion erwünscht ist, bevor weiterführende Quests/Schenkungen freigeschaltet werden.
- **[x] Energieabhängige Geschwindigkeiten:** Die NPCs und HPCs bewegen sich je nach Energiezustand mit einer Geschwindigkeit von 3, 2 oder 1 Kacheln pro Tick.

### 2. AI Game Manager (Soziale Dreigliederung) - Abgeschlossen & Archiviert
- **[x] Gedankenprotokolle (Thoughts):** Erfassung und kontinuierliche Anzeige der Überlegungen der drei Game-Manager-KIs im Dashboard mit Zeitstempel.
- **[x] Admin-Settings:** Schieberegler direkt auf den Dashboard-Seiten zur Steuerung der Spawnhäufigkeiten, Eventraten und der Artefakt-Qualität.

### 3. Multiplayer & Dezentrales Sharding (Nächste Schritte)
- **[x] Föderiertes Sharding (Sektor-Knoten):** Aufteilung der Weltkarte in eigenständige Chunks (Sektor (0,0) auf `ia3`, Sektor (1,0) auf `ia3-two`, Sektor (0,1) auf `ia3-three`) mit vollautomatischem, toroidalem Handover-Grenzübertritts-Protokoll per HTTP REST API zwischen den Sim-Knoten.
- **[ ] Föderierte Wissensgraphen:** Agenteninteressen und Kooperationsvereinbarungen werden als GraphLang-Kanten zwischen den P2P-Knoten kontinuierlich ausgetauscht.
- **[ ] Dezentrale Brain-Nodes:** Spieler können eigene Python agent-service Instanzen bereitstellen, die die kollektive Berechnung von Agenten-Kognition unterstützen.

### 4. Augmented Reality (AR) & Real-World Geodaten-Integration (In Planung)
- **[ ] Echtzeit-Datenkopplung Augsburg/Bayern:** Anbindung realer Höhendaten (DGM-Raster OpenData Bayern) und OSM-Vektordaten (Gebäude, Straßen) zur Generierung realgetreuer OpenSIM- und Engine-Sektoren.
- **[ ] Geografisches Koordinatensystem:** Mathematische Umrechnung von WGS84 Lat/Lon in 2D-Meter-Simulationsgitter zur exakten Positionierung von Agenten an realen Standorten (z. B. Rathausplatz Augsburg).
- **[ ] Live-Echtdaten-Synchronisation:** Integration von Live-Wetterdaten und Sensor-APIs zur Steuerung von Dürren, Ernten und Agenten-Prioritäten basierend auf echten Begebenheiten.

