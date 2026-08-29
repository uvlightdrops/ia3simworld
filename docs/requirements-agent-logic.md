# Requirements & Spezifikation: Cognitive Agent Logic & Society 🧠

Dieses Dokument spezifiziert die fachlichen und technischen Anforderungen an die Kognition, Verhaltensroutinen, soziale Transmission und Spieler-Interaktion der Agenten in IA3 SimWorld.

---

## 1. Zustandsloses Mesa-Framework (gRPC-Kopplung)

- **Geführte gRPC-Architektur:** Die Verhaltensberechnung ist vom Go-Simulator entkoppelt und wird über gRPC (`sim.proto`) an das Python-Mesa-Framework übergeben.
- **Flüchtige Entscheidungszyklen:** Go serialisiert in jedem Tick den Weltzustand. Python berechnet die Aktionen und meldet Bewegungen/Handlungen zurück. Zustände werden im `status`-Feld der Agenten persistiert.

---

## 2. 24-Stunden-Lebenszyklus & Rollenprofile

- **Diurnaler Rhythmus:** Agenten folgen einem 24-Tick-Tagesablauf (Schlafen bei Erschöpfung in `home`, Arbeiten am Nachmittag, Marktplatz-Handel, Tribunal-Sitzungen am Abend).
- **Verhaltensprofile:**
  - **Scout:** Erkundet weit entfernte Wald- und Wasserbiome.
  - **Builder:** Patrouilliert das Straßennetz und bewirtschaftet Getreidefelder.
  - **Researcher:** Reist zwischen Siedlungen mit stateful 5-Tick-Lernphasen.
  - **Tracker:** Sichert den Kartenperimeter entlang fester Wegpunkte.
  - **Human Player (HPC):** Vom Spieler gesteuerte Figur mit WASD/Pfeiltasten.

---

## 3. Toroidale A*-Wegfindung (High-IQ Navigation)

- **Toroidales A* (Wrap-Around):** Berücksichtigt die Weltgrenzen für nahtlose Wegfindung über die Kartenränder hinweg.
- **Smart Escape Logik:** Eingeschlossene Agenten lösen Blockaden bei Landschaftsänderungen automatisch auf.
- **Energieabhängige Geschwindigkeiten:** Bewegung mit 3, 2 oder 1 Kachel(n) pro Tick basierend auf dem aktuellen Energielevel.

---

## 4. Kognitive Interessen & Soziale Transmission

- **Organische Interessenentwicklung:** Interessen (Philosophie, Kunst, Socializing, Handel) starten bei korrekten Initialwerten.
- **Passiver Verfall & Verstärkung:** Verfall von -1% pro Tick (20% Chance, Floor 10%) gekoppelt mit +2% Verstärkung bei Zielerreichung.
- **Proximity Infection (Lernen):** Bei Anwesenheit nahestehender Agenten (Distanz <= 1.5) werden Interessen übertragen.
- **Existenzsicherung & Hunger:** Grundverbrauch von 2 Einheiten/Tick. Ohne Ernte oder Beeren verlieren hungrige Agenten 3 Energie-Einheiten/Tick.

---

## 5. Spieler-Interaktionen (Interactive Quests) ✅ IMPLEMENTED

### 5.1 Interaktive Anfragen
- ✅ **Interaktive Anfragen:** Human Player und NPCs interagieren bidirektional mit Multiple-Choice-Optionen
- ✅ **Echtzeit-Entscheidungen & Auto-Antworten:** Manuell (Multiple Choice innerhalb von 12 Ticks) oder Auto-Antwort-Modi (Auto-Accept / Auto-Reject)
- ✅ **Tiefere Interaktion:** NPCs fragen an, ob tiefere Interaktion erwünscht ist, bevor weiterführende Quests freigeschaltet werden
- ✅ **Energieabhängige Geschwindigkeiten:** NPCs und HPCs bewegen sich mit 3, 2 oder 1 Kachel(n) pro Tick je nach Energiezustand
- **Implementation:** Human-NPC interaction protocol mit 12-Tick response timeout und energy-scaled movement modifiers

---

## 6. Kollektive Szenarien (Herbst-Festival)

- **Festival-Orchestrierung:** Bei Triggerung unterbrechen alle Agenten ihre Aufgaben, wandern zum Festplatz, schlagen Zelte auf, spielen Musik und feiern am Canvas-Lagerfeuer (+5% Energie/Ressourcen, +3% Philosophie/Kunst).
