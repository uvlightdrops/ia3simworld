# Offene & Zukünftige Kundenanforderungen 📋

Dieses Dokument listet ausschließlich die **neuen, offenen oder zukünftigen** funktionalen Anforderungen an die IA3 SimWorld-Plattform. 

Alle erfolgreich umgesetzten Anforderungen wurden systematisch archiviert und in die entsprechenden technischen Dokumente überführt (siehe **ℹ️ About**-Menüpunkt im Game-Frontend oder im Ordner `docs/`):
- `docs/requirements-world-generation.md` (Welt- & Landschaftsgenerierung, Siedlungen, Infrastruktur)
- `docs/requirements-agent-logic.md` (Agenten-Kognition, Spieler-Interaktionen, 24h Rhythmus, toroidales A*)
- `docs/requirements-gui-and-ux.md` (Web Client GUI, Canvas Renderer, Admin-Menüs, UI-Features)
- `docs/requirements-multiplayer-and-sharding.md` (Föderiertes Sektor-Sharding, Multi-Node Cluster, Handover-Protokoll)
- `docs/opensim-interoperability.md` (OpenSIM-PNG-Heightmaps, LSL-Skripte, Koordinatenskalierung)

---

## Offene Entwicklungsziele

### 1. Multiplayer & Dezentrales Sharding (🟡 In Progress)
- **[ ] Föderierte Wissensgraphen:** Agenteninteressen und Kooperationsvereinbarungen werden als GraphLang-Kanten zwischen den P2P-Knoten kontinuierlich ausgetauscht.
- **[ ] Dezentrale Brain-Nodes:** Spieler können eigene Python agent-service Instanzen bereitstellen, die die kollektive Berechnung von Agenten-Kognition unterstützen.
- 
### 2. Augmented Reality (AR) & Real-World Geodaten-Integration (📋 Planned)
- **[ ] Echtzeit-Datenkopplung Augsburg/Bayern:** Anbindung realer Höhendaten (DGM-Raster OpenData Bayern) und OSM-Vektordaten zur Generierung realgetreuer Sektoren.
- **[ ] Geografisches Koordinatensystem:** WGS84 Lat/Lon → 2D Meter-Simulationsgitter Umrechnung zur Positionierung von Agenten an realen Standorten.

### 3a. GUI einfache Erweiterungen (🟡 In Progress)
- [x] Live Event Feed auf eigene Unterseite, im admin menu verlinken, von World map entfernen
- [x] Setting für geschwindigkeit der Simulation soll beim master auf der worldmap seite in die Simulationssteuerung
- 
### 3b. GUI & UX Erweiterungen (📋 Planned)
- **[ ] AR-Overlay im Web-Client:** Anzeige von Agenten, NPCs und Artefakten auf AR-fähiger Karte.
- **[X] Agenten-Details Box Struktur:** Permanente Sichtbarkeit mit Dummy-Einträgen wenn kein Agent ausgewählt.

### 4. World Expansion & Terraforming (📋 Future)
- **[ ] Unendliche Sektoren:** Dynamische Generierung von 256×256 Sektoren, die nahtlos aneinander anschließen.
- **[ ] OSM-Daten-Import:** Anbindung von OpenStreetMap Geodaten zur Konvertierung in Terrain-Kacheln.
- **[ ] Realistische Landschafts-Features:** Flüsse, Seen, Hügel basierend auf echten Geodaten (z.B. Texturen von osm.org).

### 5. Performance & Scalability (🟡 Phase 2-3 Planned)
- **[ ] WebSocket Real-Time Push:** Ersetze HTTP-Polling durch WebSocket für <100ms Latenz.
- **[ ] Spatial Indexing (Quadtree):** Agent-Lookups von O(N) auf O(log N) optimieren.
- **[ ] Terrain Compression:** RLE oder Delta-Encoding für 80-90% Größenreduktion.
- **[ ] Performance Dashboard:** Real-time Metriken (FPS, Latency, Memory, GC Pauses).
- 
### 6. World Generation & Settlement Expansion (📋 Planned)
- [ ] Jeder node spawn fünf eigene Agenten, die damit ihren Heimatsektor zugewiesen bekommen. 
- [ ] Jeder Hauptsektor eines nodes beherbergt einen Court, marketplace und eine spirituelles Gemeindezentrzm und drei ansiedlungen.
- [ ] Jeden Sonntag kommen die Agenten alle zum Gemeindezentrum für drei Stunden.
---

## Implementation Status Summary

| Bereich | Status | Docs |
|---------|--------|------|
| **Agent Logic & Interaktionen** | ✅ Complete | requirements-agent-logic.md |
| **World Generation & Settlements** | ✅ Complete | requirements-world-generation.md |
| **GUI & UX Features** | ✅ Complete | requirements-gui-and-ux.md |
| **Föderiertes Sharding (Basic)** | ✅ Complete | requirements-multiplayer-and-sharding.md |
| **Performance Optimizations (Phase 1-2)** | ✅ Complete | performance-optimizations.md |
| **Multiplayer (Advanced)** | 🟡 In Progress | requirements-multiplayer-and-sharding.md |
| **AR & Real-World Geodaten** | 📋 Planned | - |
| **Unendliche Sektoren** | 📋 Planned | - |
| **WebSocket & Advanced Performance** | 📋 Planned | performance-optimizations.md |