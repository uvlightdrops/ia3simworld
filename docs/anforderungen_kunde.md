# Offene & Zukünftige Kundenanforderungen 📋

Dieses Dokument listet ausschließlich die **neuen, offenen oder zukünftigen** funktionalen Anforderungen an die IA3 SimWorld-Plattform. 

Alle erfolgreich umgesetzten Anforderungen wurden systematisch archiviert und in die entsprechenden technischen Dokumente überführt (siehe **ℹ️ About**-Menüpunkt im Game-Frontend oder im Ordner `docs/`):
- `docs/requirements-world-generation.md` (Welt- & Landschaftsgenerierung, Value-Noise, Sektorensystem, Realwelt-Geodaten)
- `docs/requirements-agent-logic.md` (Agenten-Kognition, Mesa-Framework, 24h Rhythmus, toroidales A*, Quests & Interaktionen)
- `docs/requirements-gui-and-ux.md` (Web Client GUI, Canvas Rendermotor, Dreigliederungs-Dashboards, CSS Grid Layout, Footer-Tasks)
- `docs/requirements-multiplayer-and-sharding.md` (Föderiertes Sektor-Sharding, Multi-Node Cluster, Handover-Protokoll, Shared World)
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
- **[x] Föderiertes Sharding (Sektor-Knoten):** Aufteilung der Weltkarte in eigenständige Chunks (Sektor (0,0) auf `ia3`, Sektor (1,0) auf `ia3-2`, Sektor (0,1) auf `ia3-3`) mit vollautomatischem, toroidalem Handover-Grenzübertritts-Protokoll per HTTP REST API zwischen den Sim-Knoten.
- **[ ] Föderierte Wissensgraphen:** Agenteninteressen und Kooperationsvereinbarungen werden als GraphLang-Kanten zwischen den P2P-Knoten kontinuierlich ausgetauscht.
- **[ ] Dezentrale Brain-Nodes:** Spieler können eigene Python agent-service Instanzen bereitstellen, die die kollektive Berechnung von Agenten-Kognition unterstützen.

### 4. Augmented Reality (AR) & Real-World Geodaten-Integration (In Planung)
- **[ ] Echtzeit-Datenkopplung Augsburg/Bayern:** Anbindung realer Höhendaten (DGM-Raster OpenData Bayern) und OSM-Vektordaten (Gebäude, Straßen) zur Generierung realgetreuer OpenSIM- und Engine-Sektoren.
- **[ ] Geografisches Koordinatensystem:** Mathematische Umrechnung von WGS84 Lat/Lon in 2D-Meter-Simulationsgitter zur exakten Positionierung von Agenten an realen Standorten (z. B. Rathausplatz Augsburg).

### 5. GUI & UX-Feinheiten (Abgeschlossen & Umgesetzt)
- **[ ] AR-Overlay im Web-Client:** Anzeige von Agenten, NPCs und Artefakten auf einer AR-fähigen Karte mit Zoom- und Pan-Funktionalität.
- **[x] Karten-Erstellungszeit:** Erstellungszeitstempel (`createdAt`) wird im Admin-Board inklusive World-Size und Version angezeigt.
- **[x] Spielstand-Speicherung:** Speichern (`/api/control/save-game`) und Laden (`/api/control/load-game`) von Simulationen im Singleplayer-Modus.
- **[x] Regenerate-Bestätigungsdialog:** Sicherheitsabfrage beim Klicken auf "Save & Regenerate Landscape" mit Rückmeldung zum Zurücksetzen der Artefakte.
- **[x] Quadratischer Viewport & Seitliche Legende:** Quadratischer 1:1 Map-Viewport mit vertikaler Legende direkt seitlich daneben (Gruppierung in Orte/Gebäude vs. Bodenbedeckung) und verbreiterter Sidebar. 
- **[x] Menu für die drei gamemanager KI seiten als dropdown "Dreigliederung":** Zusammenfassung der drei Game-Manager KI-Seiten (Geistesleben, Rechtssphäre, Wirtschaftsleben) in einem eleganten Dropdown-Menü in der Header-Navigation.
- **[x] Admin menu mit unterseiten:** Strukturierung des Admin-Bereichs in die Unterseiten "Kartenmanagement & Quellen", "Agentenprofile & Inspektoren" und "Allgemein & Landschaft".
- **[x] Sidebar-Optimierung:** Mitmach-Modus (Human Player) nach unten verschoben, Status-Spalte aus der Active-Agents-Tabelle entfernt und Agenten-Details-Karte direkt rechts daneben in einem Nebeneinander-Layout platziert.
- [ ] Box Agenten-details ist immer sichtbar mit der inneren struktur und dummy einträgen wenn kein agent links ausgewählt ist
- 
### 6. World map & Terrain Generation (Teilweise Abgeschlossen)
- **[x] Siedlungsabstand & Durchmesser:** Siedlungszentren haben strikt ≥ 80 Kacheln toroidale Distanz voneinander und besitzen einen variablen Durchmesser zwischen 4 und 8 Kacheln.
- **[ ] Unendliche Sektoren:** Dynamische Generierung von Sektoren, die nahtlos aneinander anschließen, um eine unendliche Weltkarte zu simulieren.
- **[ ] Import von echten OSM-Daten:** Anbindung von OpenStreetMap Geodaten zur Konvertierung in Terrain-Kacheln.
- **[x] OSM-Vektorkarte vor dem Import ansehen:** Interaktiver 2D-Vektormap- & Maßstab-Inspektor im Menüpunkt "Kartenmanagement & Quellen" zur visuellen Prüfung der WGS84 GPS-Koordinaten, Boundingboxen und Projektion in das 10m-Kachelraster vor dem Import.
- [ ] Realistische Landschafts-Features: Implementierung von Flüssen, Seen, Hügeln und Wäldern basierend auf realen Geodaten. Dass heisst eine gute Auswahl eigener kacheln. Vielleicht kann man gute texturen aus dem Internet laden, zb von osm.org ?
- 