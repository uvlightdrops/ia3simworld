# Requirements & Spezifikation: World & Terrain Generation 🗺️

Dieses Dokument spezifiziert die fachlichen und technischen Anforderungen an die Landschaftsgenerierung, das Sektorensystem und die Umweltdynamik der IA3 SimWorld-Plattform.

---

## 1. Startwelt & Dimensionen

- **OpenSIM-Standard (256x256):** Die Simulation erzeugt beim Initialisieren ein OpenSIM-kompatibles Gebiet der Größe **256x256 Tiles (65.536 Kacheln)**.
- **Kachelelemente & Biome:**
  - `grass` 🍀 (Grasland für Bewegung und Ackerbau)
  - `water` 💧 (Flüsse und Seen; unpassierbar)
  - `forest` 🌲 (Wälder zur Beeren- und Holzgewinnung)
  - `rock` ⛰️ (Berge/Felsen; unpassierbar & Abfalllagerung)
  - `home` 🏡 (Siedlungszentren für Schlaf und Erholung)
  - `road` 🛣️ (Wege zur beschleunigten Kollisionsfreien Wegfindung)
  - `court` ⚖️ (Tribunal / Gerichtshof)
  - `market` 🛒 (Handelsmarktplatz)
  - `crops` 🌾 (Kultivierte Weizenfelder)

---

## 2. Prozeduraler Geländegenerator (Noise & Flussmodell)

- **2D-Value-Noise mit FBM:** Ein mathematischer 2D-Value-Noise-Generator mit Kosinus-Interpolation und fraktalen Oktaven erzeugt organische Höhenprofile und Biome.
- **Mäanderndes Flussmodell:**
  - Ein Hauptstrom der Breite 4 fließt von oben nach unten durch den Sektor.
  - Eine Flussgabelung spaltet sich prozedural ab.
  - Isolierte, störende Seen wurden verringert, um mehr zusammenhängendes Bauland zu schaffen.
- **Infrastruktur-Abstands-Constraints:**
  - Marktplatz (`market`) und Gerichtshof (`court`) werden mit einem Abstand von **mindestens 10 Tiles** zueinander und zu den Siedlungszentren (`home`) platziert.
- **Prozedurales Straßennetz:** Siedlungszentren sind über automatische A*-Pfade mit Wegen (`road`) verbunden.

---

## 3. Dynamische Ressourcen & Ökologie

- **Feldbestellung (`crops`):** Builder-Agenten legen bei Bedarf Weizenfelder an und kultivieren diese.
- **Nachwachsende Ressourcen:** Waldbeeren-Vorkommen verbrauchen sich bei Konsum und regenerieren nach festen Ticks.
- **Biologischer Müllabbau:** An Felsen abgelagerter Abfall (`waste_pile`) baut sich biologisch ab.
- **Echtzeit-Parameteranpassung:** Schieberegler im Admin-Dashboard steuern Flussbreite, Seen-Dichte und Beeren-Dichte im laufenden Betrieb.

---

## 4. Unendliches Weltexpansion-System (Seamless Sharding)

- **Dynamische Sektor-Generierung:** Bei Bewegung an den Weltgrenzen werden angrenzende 256x256-Sektoren generiert und nahtlos angesetzt.
- **Explorations-Register:** Neu entdeckte Sektoren werden im Katasteramt des Gerichtshofs registriert und im Cluster synchronisiert.

---

## 6. Siedlungen & Infrastruktur ✅ IMPLEMENTED

- ✅ **Siedlungsabstand & Durchmesser:** Siedlungszentren haben mindestens **80 Tiles toroidale Distanz** voneinander mit variablem Durchmesser zwischen 4-8 Tiles
- ✅ **18 Gebäudetypen:** home, farm, mill, forge, pottery, quarry, workshop, market, court, storehouse, temple, graveyard, mine, bridge, monument, shrine, well, crops
- ✅ **OSM-Karteniinspektor:** Interaktiver 2D-Vektormap-Inspektor mit WGS84 → 10m Grid Projektion, Boundingbox-Rechner für Sektoren und Geodatenquellen-Verwaltung

---

## 5. Realwelt-Geodaten & AR-Integration (Augsburg / Bayern)

- **OpenData Bayern DGM-Import:** Höhendaten der Vermessungsverwaltung Bayern werden prozedural in 256x256-Sektoren übertragen.
- **OpenStreetMap Vektordaten:** OSMPBF-Parsing für Gebäude, Straßen und Landmarken (z. B. Rathausplatz Augsburg).
- **WGS84 Koordinaten-Transformation:** Mathematische Umrechnung von WGS84 Lat/Lon in das lokale 2D-Meter-Simulationsgitter.
