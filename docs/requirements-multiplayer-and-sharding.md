# Requirements & Spezifikation: Multiplayer & Dezentrales Sharding 🌍

Dieses Dokument spezifiziert die fachlichen und technischen Anforderungen an das Multi-Node-Multiplayer-System, die föderierte Sektor-Verteilung und das Cluster-Handover.

---

## 1. Föderiertes Sektor-Sharding (Multi-Node Cluster)

- **Sektor-Aufteilung:** Aufteilung der unendlichen Weltkarte in eigenständige Chunks:
  - Sektor (0,0) läuft auf Knoten `ia3` (Port :13000 / :18080)
  - Sektor (1,0) läuft auf Knoten `ia3-2` (Port :13001 / :18081)
  - Sektor (0,1) läuft auf Knoten `ia3-3` (Port :13002 / :18082)
- **Toroidaler Handover-Grenzübertritt:** Überqueren Agenten oder Spieler die Randgrenzen eines Sektors, wird das serialisierte Zustandsobjekt automatisch per HTTP REST API an den Ziel-Simulationsknoten übergeben.

---

## 2. Shared World Multiplayer Mode & Sicherheit

- **Dezentrale Spiegelung:** Sekundäre Knoten verbinden sich mit dem Master-Gateway und spiegeln den Zustand in Echtzeit im Client.
- **Sicherheits-Schutz:** Steuerungselemente (Start, Pause, Regenerate, Szenario-Trigger) sind auf Observer-Knoten gesperrt.

---

## 3. Föderierte Wissensgraphen & Brain-Nodes (Roadmap)

- **Dezentraler Wissensaustausch:** Kontinuierlicher Austausch von Agenteninteressen als semantische GraphLang-Kanten zwischen P2P-Knoten.
- **Dezentrale Brain-Nodes:** Möglichkeit für Spieler, eigene Python-`agent-service`-Instanzen zur Kognitionsberechnung im Cluster bereitzustellen.
