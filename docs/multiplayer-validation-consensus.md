# IA3 SimWorld – Sicherheits- & Validierungsarchitektur für Sharding 🛡️

In einem föderierten Multiplayer-System, bei dem verschiedene Spieler eigene Sektor-Knoten hosten, besteht immer die Gefahr von Manipulationen (Cheating):
- Ein böswilliger Host könnte die Vitalwerte von Agenten künstlich auf 100% setzen.
- Ein Host könnte unmögliche Reisegeschwindigkeiten vortäuschen (Teleportation).
- Ein Host könnte unendlich viele Rohstoffe generieren oder Transaktionen fälschen.

Hier sind drei Ansätze, um diese Manipulationen im IA3 SimWorld-System wirksam zu verhindern, inklusive einer konkreten Empfehlung.

---

## 1. Drei vorgeschlagene Sicherheitsarchitekturen

### Option A: Zero-Trust Validation Gate mit HMAC-Verschlüsselung (Empfohlen)
Jeder Sektor-Knoten behandelt eintreffende Daten nach dem Zero-Trust-Prinzip. Übergibt ein Knoten einen Agenten, wird der State nicht blind akzeptiert, sondern durch ein **Validation Gate** geschleust:

1. **Kryptographischer HMAC-Siegel (State Seal):** 
   - Bevor ein Agent an einen anderen Sektor übergeben wird, signiert der Heimatknoten den State mit einem gemeinsamen geheimen Schlüssel (Shared Secret) via SHA-256 HMAC.
   - Unveränderliche Attribute (ID, Rolle, Geburts-Sektor, Name) und die historische Entwicklung werden im Siegel festgeschrieben. Kehrt der Agent zurück, prüft der Heimatknoten das Siegel. Hat der fremde Host den State manipuliert, schlägt die HMAC-Verifizierung fehl.
2. **Determinismus- & Invariantenprüfung (Rule Checking):**
   - Eintreffende Agenten werden auf physikalische Plausibilität geprüft:
     - Ist `Energy` und `Resources` im Bereich `[0, 100]`?
     - Stimmt die Bewegungsgeschwindigkeit (max. 3 Kacheln pro Tick)?
     - Wenn ein Agent nach 10 Ticks zurückkehrt, darf seine Energie maximal um den minimalen/maximalen Verbrauchs-Delta-Wert abweichen.

* **Vorteile:** Extrem performant (Sub-Millisekunden-Bereich), benötigt keine redundante Rechenleistung und verhindert jegliche Manipulation an den Agenten-Kernwerten vollständig.

---

### Option B: Chained Chronicle Ledgers (Kryptographische Hash-Kette)
Jeder Sektor-Knoten führt ein lokales Logbuch (Chronicle Ledger), das nach dem Prinzip einer Blockchain aufgebaut ist:

1. **Chaining:** Jede Aktion des Agenten (Bewegung, Ernte, Tausch) erzeugt einen kryptographischen Block, der mit dem Hash des vorherigen Blocks verkettet ist.
2. **Verifizierung:** Bei einem Sektorübertritt übergibt der Host die gesamte Kette an den Zielhost. Der Zielhost verifiziert die Hash-Verkettung lückenlos.
3. **Auditierbarkeit:** Unstimmigkeiten in der Kette (z. B. gelöschte oder modifizierte historische Einträge) führen zum sofortigen Abbruch der Verbindung und dem Bann des manipulierten Knotens.

* **Vorteile:** 100% lückenlose historische Auditierbarkeit; Manipulationen an der Vergangenheit sind mathematisch unmöglich.
* **Nachteile:** Hoher Speicher- und Netzwerk-Overhead durch das Übertragen ganzer Transaktionsketten bei jedem Grenzübertritt.

---

### Option C: Redundantes Compute-Sharing (Byzantine Fault Tolerance)
Sektor-Berechnungen werden nicht von einem einzelnen Host durchgeführt, sondern von einer **Konsens-Gruppe** (Consensus Group):

1. **Redundanz:** Die Berechnungen für Sektor (1,0) werden parallel von drei unabhängigen Hosts berechnet.
2. **Konsens (PBFT - Practical Byzantine Fault Tolerance):** Nach jedem Tick vergleichen die Hosts die kryptographischen Prüfsummen ihres World-States.
3. **Mehrheitsentscheidung:** Nur wenn sich mindestens zwei der drei Hosts einig sind, gilt der Zustand als verifiziert und wird im Netzwerk propagiert. Ein betrügerischer Host wird einfach überstimmt.

* **Vorteile:** Vollständige und lückenlose Verhinderung von unberechtigter Rohstoffgenerierung oder Geländemanipulation auf dem gehosteten Sektor.
* **Nachteile:** Enormer Netzwerk- und Rechen-Overhead (3-fache Rechenleistung für jeden Sektor erforderlich).

---

## 2. Technische Empfehlung: Hybrid-Ansatz aus Option A & B 🚀

Für das dezentrale IA3 SimWorld MVP schlage ich einen **hochgradig performanten Hybrid-Ansatz** vor, der unschlagbaren Schutz bei minimalem Overhead bietet:

1. **HMAC-Sicherung für Agenten-Eigentum:** Unveränderliche Attribute und der Zeitstempel des letzten Sektorübertritts werden mit einem SHA-256 HMAC-Sicherheits-Token (Siegel) versehen.
2. **Zero-Trust Transfer-Validierung:** Bei jedem Empfang eines Agenten über `/control/handover-agent` führt der Empfänger-Knoten ein Regel-Check-Protokoll aus:
   - **Zeit-Distanz-Check:** `Speed Check` (Verhindert Teleportation/Speed-Hacks).
   - **Wertgrenzen-Check:** Vitalwerte-Gültigkeit (Verhindert Unsterblichkeit/unendlich Ressourcen).
3. **Zentrales oder Föderiertes Bann-Register:** Erkennt ein Knoten einen Manipulationsversuch, sendet er ein Alarm-Event an alle Peer-Knoten, woraufhin der betrügerische Host temporär aus der Föderation ausgeschlossen (gebannt) wird.

---

## 3. Wie möchtest du das umsetzen?

Ich kann die Grundlagen für das **Zero-Trust Validation Gate mit HMAC-Siegel** direkt in unseren Go-Handover-Schnittstellen implementieren.
