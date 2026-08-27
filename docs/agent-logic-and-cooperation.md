# Agenten-Logik & Kooperations-Datenmodell

Dieses Dokument beschreibt das kognitive Verhaltensmodell, die sozialen Interessen, das Vereinbarungs-Datenmodell (Agreements) sowie den physischen Ressourcenkreislauf der IA3 SimWorld-Plattform.

---

## 1. Kognitives Rollen-Verhalten (Mesa-Framework)

Die Agenten werden über ein Python-Mesa-Modell gesteuert, das deterministische, zustandsgesteuerte Routinen anstelle von zufälliger Bewegung (Random Walk) ausführt. Es existieren vier spezialisierte Rollenprofile:

| Rolle | Verhaltens-Routine |
| :--- | :--- |
| **Scout** | Sucht die Karte gezielt nach weit entfernten Ressourcen (Wald- und Wasser-Kacheln) ab, um sie für die Gemeinschaft zu kartieren. |
| **Builder** | Patrouilliert entlang des Straßennetzes und zwischen den Gehöften, um Instandhaltungsaufgaben zu simulieren. |
| **Researcher** | Reist zwischen den drei Gehöften (`homestead`) hin und her und verbleibt dort für einen kognitiven Zyklus von 5 Ticks im Zustand "Studieren". |
| **Tracker** | Sichert das Territorium, indem er den äußeren Perimeter der 96x96-Karte entlang vordefinierter Wegpunkte patrouilliert. |

---

## 2. Interessen & Soziale Transmission (Interests)

Jeder Agent besitzt ein individuelles Interessenprofil, das aus gemeinsamen und persönlichen Interessen besteht:

- **Struktur:** Jedes Interesse besitzt eine Intensität von **0% bis 100%**.
- **Transmission:** Wenn zwei Agenten mit hohem Interesse an demselben Thema nebeneinander stehen, können sie sich gegenseitig beeinflussen ("anstecken"). Die Intensität überträgt sich, gleicht sich an und wächst.
- **Gemeinschaftseffekt:** Bei hohem gemeinsamen Interesse bleiben die Agenten für eine Weile nebeneinander stehen, um sich auszutauschen.

---

## 3. Kooperations-Vereinbarungen (Agreements)

Agenten können temporäre oder dauerhafte Vereinbarungen treffen, um gemeinsam Aufgaben zu bewältigen:

### Datenmodell (gRPC & JSON)
```protobuf
message Agreement {
  string partner_id = 1;   // ID des Kooperationspartners
  string type       = 2;   // Art der Vereinbarung ("socialize", "mission")
  int32  target_x   = 3;   // Gemeinsames Ziel (X-Koordinate)
  int32  target_y   = 4;   // Gemeinsames Ziel (Y-Koordinate)
  int32  ticks_left = 5;   // Verbleibende Dauer der Vereinbarung
}
```

### Kooperations-Logik
1. **Sozialisieren (Socialize):**
   - **Trigger:** Zwei Agenten mit kompatiblen, hochintensiven Interessen treffen aufeinander.
   - **Aktion:** Sie verweilen für **15 Ticks** direkt nebeneinander, um Wissen auszutauschen.
2. **Gemeinsame Mission (Mission):**
   - **Trigger:** Agenten beschließen, gemeinsam Ressourcen zu erschließen oder Abfall zu entsorgen.
   - **Aktion:** Sie reisen gemeinsam zum nächsten Wald- oder Fels-Knoten, um für **25 Ticks** zu kooperieren.
3. **Siedlungs-Proaktivität:**
   - Wenn sich Agenten innerhalb von 3 Kacheln um ein Gehöft (`home`) treffen, steigt die Wahrscheinlichkeit, eine Vereinbarung zu treffen, von **15% auf 50%**.

---

## 4. Physischer Ressourcenkreislauf & Visualisierung

Die physischen Handlungen der Agenten wirken sich direkt auf die Umwelt aus und werden in Echtzeit visuell auf dem Canvas dargestellt:

- **Beeren-Ressource (`berries`):** 
  - Befinden sich auf Wald-Kacheln (`forest`).
  - Wenn ein Agent Nahrung benötigt, erntet er Beeren (Füllmenge sinkt). 
  - **Visualisierung:** Volle Wälder zeigen rote Beerenpunkte (`🍒`). Geerntete Wälder verwandeln sich visuell in braune Holzstümpfe (`🪵`), bis die Ressourcen nachwachsen (8-Tick-Intervall).
- **Abfall & Entsorgung (`waste_pile`):** 
  - Agenten lagern Abfall bei Aktivität in ihrem Inventar an. 
  - Zur Entsorgung suchen sie Fels-Kacheln (`rock`) auf.
  - **Visualisierung:** Auf den Bergen bilden sich graue Müllhaufen (`🗑️`). Ab einem kritischen Verschmutzungsgrad (>60%) färbt sich der Haufen signalrot mit einem Ausrufezeichen (`!`), um Umweltbelastung visuell darzustellen. Der Müll baut sich biologisch langsam ab.

---

## 5. Tageszeitabhängige soziale Routinen & Zyklus

Die Simulation simuliert einen kontinuierlichen 24-Stunden-Tageszeitenzyklus basierend auf dem Tick-Zähler (`tick % 24`), der vier Phasen aufweist:

1. **Nacht (0-5 / 🌌 Night):** 
   - **Ziel:** Alle Agenten beenden ihre Aktivität und wandern zu ihrem nächsten Gehöft (`home`).
   - **Verhalten:** Sobald sie ein Gehöft erreichen, schlafen sie und regenerieren ihre Energie vollständig auf 100%.
2. **Morgen (6-11 / 🌅 Morning):**
   - **Ziel:** Treffen und Handeln auf dem zentralen Marktplatz (`market`).
   - **Verhalten:** Alle Agenten wandern zum Marktplatz, um Produkte zu tauschen und soziale Interaktionen durchzuführen.
3. **Mittag & Nachmittag (12-17 / ☀️ Afternoon):**
   - **Ziel:** Rollenspezifische Routinen und Arbeitsaufgaben.
   - **Verhalten:** Die Agenten gehen ihren Hauptaufgaben nach (Scout, Builder, Researcher, Tracker) oder führen aktive Kooperationsverträge (Missionen/Socializing) aus.
4. **Abend (18-23 / 🌇 Evening):**
   - **Ziel:** Täglicher Zensus und Rechtsprechung auf dem zentralen Gerichtshof (`court`).
   - **Verhalten:** Alle Agenten begeben sich gemeinsam zum Tribunal, um an der kollektiven Versammlung teilzunehmen.

---

## 6. Ressourcenknappheit & Existenzsicherung

Um die Lebensechtheit und Dramatik der Simulation zu steigern, wurden Ressourcen verknappt und ein biologischer Überlebenskreislauf implementiert:

- **Erhöhter Grundverbrauch:** Der Abbau der lebensnotwendigen Ressourcen (`Resources`) wurde auf **2 Einheiten pro Tick** verdoppelt. Agenten müssen somit häufiger Nahrung und Wasser suchen.
- **Feldfrüchte-Ernte (`crops` / 🌾):** 
  - Neben Seen (`water`) und Beerenwäldern (`forest`) dienen landwirtschaftliche Felder (`crops`) um die Gehöfte herum als wesentliche Nahrungsquelle.
  - Agenten suchen bei Hunger proaktiv den nächstgelegenen Feldfrüchte-Knoten auf und ernten 20 Einheiten.
  - Feldfrüchte wachsen deutlich langsamer nach (+3 Einheiten alle 8 Ticks im Vergleich zu +5 bei Beeren), was die Nahrungsmittelknappheit abbildet.
- **Hunger-Malus auf Ausdauer:** 
  - Wenn die Ressourcen eines Agenten vollständig auf 0 sinken, setzt extremer Hunger ein.
  - Während dieser Phase verliert der Agent zusätzlich **3 Energie-Einheiten pro Tick** (statt regulär 1), was zu schneller Erschöpfung führt und die Notwendigkeit einer proaktiven Versorgung unterstreicht.

---

## 7. Fehlerbehebungen & KI-Erweiterungen (Social Dynamics)

### Interessen-Saturierungs-Bugfix
- **Problem:** Alle Interessen der Agenten stiegen fälschlicherweise rasant auf 100% an. Die Ursache lag in unvollständigen Slices-Kopien (Deep Copy) in Go sowie doppelten Proximity-Zuwächsen (+8% pro Tick).
- **Lösung:**
  - **Sicheres Kopieren:** Ein explizites Deep Copy der Interessen-Slices verhindert unkontrollierte Referenz-Infektionen.
  - **Dämpfung:** Proximity-Infektionen wurden probabilistic gedämpft (15% Chance für Contagion, 10% Chance für Neulernen).
  - **Aktiver Lebenszyklus (Decay & Reinforcement):** Ein passiver Interessenverfall von -1% pro Tick (Chance: 20%, Floor: 10%) sorgt für stete Dynamik. Gleichzeitig fördert die Ausübung von Rollenaufgaben (z. B. "Exploring" für Scouts) das zugehörige Interesse um +2% (aktives Verstärkungslernen).

### Splitscreen Admin-Profiles & Chroniken
- **Konzept:** Ein ausgeklügeltes Profil-Dashboard visualisiert alle NPC-Vitalwerte, Interessenprofile und chronologischen Geschichts-Logs (Chronicle Logs) lückenlos in Echtzeit.
- **Transparenz:** Spieler können jeden Schritt, jedes Gespräch und jede soziale Vereinbarung der KI-Agenten über Ticks hinweg im Splitscreen historisch nachvollziehen.

---

## 8. Kollektive Szenarien (Festival-Modus)

Um zeitweilige, gemeinschaftliche Zivilisationsereignisse abzubilden, besitzt das System eine **Scenario State Machine**, die beispielhaft am *Autumn Solstice Festival* demonstriert wird:

### Die 4 Phasen des Festival-Szenarios

```text
+------------------+     +-------------------+     +------------------+     +-------------------+
|    gathering     | --> |      active       | --> |    dispersing    | --> |     completed     |
| (Anreise-Phase)  |     | (Feier & Kultur)  |     | (Heimreise-Phase)|     | (Berichts-Archiv) |
+------------------+     +-------------------+     +------------------+     +-------------------+
```

1. **Anreise (gathering):**
   - **Verhalten:** Bei Aktivierung packen alle Agenten ihre Vorräte, brechen ihre Alltagsroutinen ab und wandern zu den Festival-Koordinaten weit außerhalb ihrer Städte.
   - **Bedingung:** Die Phase endet, sobald 6 Agenten eingetroffen sind oder ein Timeout von 25 Ticks erreicht ist.
2. **Feier & Kultur (active):**
   - **Verhalten:** Für **24 Ticks** (1 voller Spieltag) scharen sich alle Agenten um ein großes, prasselndes Lagerfeuer.
   - **Kultureller Boost:** Die Werte für *Philosophy*, *Socializing* und *Art* steigen um **+3% pro Tick** an.
   - **Feasting-Vorteil:** Die Agenten teilen Vorräte. Ihre Vitalwerte (Energie & Ressourcen) regenerieren sich kontinuierlich um **+5% pro Tick**.
   - **Visuelles Canvas-Highlight:** Auf der Karte werden ein flackerndes Lagerfeuer mit Glutpartikeln und vier farbenprächtige Zelte gerendert.
3. **Abreise (dispersing):**
   - **Verhalten:** Die Feierlichkeiten enden. Die Agenten packen die Zelte zusammen und treten selbstständig die Heimreise zu ihren jeweiligen Gehöften an.
   - **Bedingung:** Die Phase endet, sobald alle Agenten zu Hause eingetroffen sind oder ein Timeout von 25 Ticks abgelaufen ist.
4. **Abschluss & Bericht (completed):**
   - **Verhalten:** Der Festival-Status erlischt. Es wird ein文明-historischer **Chronicle-Bericht** verfasst und im persistenten Archiv hinterlegt, was eine spürbare Steigerung des kollektiven Stammeszusammenhalts zur Folge hat.

---

## 9. World & Spieler-Interaktion (Interactive Quests & Speeds)

In dieser Phase wurden tiefere Interaktionsmöglichkeiten zwischen menschlichen Spielern (Human Player / HPC) und AI-Agenten (NPCs) sowie adaptive Bewegungskonzepte integriert:

### 1. Spieler-Anfragen & Quests an Agenten
Wenn ein menschlicher Spieler der Simulation beitritt ("Mitmach-Modus") und sich in der Nähe eines Agenten befindet (maximal 25 Tiles Entfernung), kann er über das Sidebar-Details-Panel interaktive Quests und Aufgaben stellen:
- **Ressource liefern (deliver_resources):** Der Agent transportiert eigenständig 20 Rohstoffe zum Spieler (benötigt >=25% NPC-Rohstoffe).
- **Gemeinsam erkunden (explore_together):** Der Agent folgt dem Spieler für eine Weile auf Schritt und Tritt und teilt Geschichten.
- **Weisheit lehren (teach_philosophy):** Der Agent teilt philosophische Erkenntnisse und steigert das Philosophie-Interesse des Spielers um +15% (benötigt >=20% NPC-Philosophie).
- **Feld anlegen (build_crops):** Der Agent wandert zum Spieler und legt ein neues Getreidefeld (`crops`) in dessen direkter Nähe an.

### 2. NPC-Initiierte Anfragen an den Spieler
NPCs können nun auch von sich aus Kontakt mit dem menschlichen Spieler aufnehmen, wenn sich dieser in der Nähe befindet (12 Tiles):
- **Tiefere Interaktion (deep_interaction):** Der Agent fragt höflich: *"Tiefere Interaktion okay?"*. Erst nach Bestätigung schaltet der Spieler das Recht für den NPC frei, weitere thematische Anfragen zu stellen.
- **Philosophieren (socialize):** Der Agent bittet um ein gemeinsames Gespräch über Philosophie, was das philosophische Wissen beider stärkt (+10%).
- **Rohstoff-Geschenk (share_resources):** Der Agent bittet um eine Schenkung von 15 Rohstoffen.
- **Lebensenergie schenken (share_energy):** Der Agent schenkt dem Spieler 15% Energie, falls der Spieler erschöpft aussieht.

### 3. Echtzeit-Entscheidungen & Auto-Antworten
- **Manuelle Beantwortung:** Der Spieler hat **12 Ticks Zeit**, eine eingehende NPC-Anfrage per Multiple-Choice-Popup im Game-Frontend zu beantworten.
- **Auto-Antwort-Modus:** Der Spieler kann in Echtzeit eine Standard-Auto-Antwort konfigurieren:
  - *Manuell:* Anfrage läuft nach 12 Ticks ergebnislos ab.
  - *Auto-Akzeptieren (Ja):* Anfragen werden bei Ablauf automatisch positiv beantwortet.
  - *Auto-Ablehnen (Nein):* Anfragen werden bei Ablauf automatisch höflich abgelehnt.

### 4. Energieabhängige Geschwindigkeiten
Die Fortbewegungsgeschwindigkeit (Schrittweite) von NPCs und HPCs passt sich dynamisch an das aktuelle Energieniveau an:
- **Ausgeruht (Energie >= 75%):** Hohe Geschwindigkeit von **3 Kacheln (Tiles) pro Simulationstick**.
- **Normal (25% <= Energie < 75%):** Moderate Geschwindigkeit von **2 Kacheln (Tiles) pro Simulationstick**.
- **Erschöpft (Energie < 25%):** Langsame Geschwindigkeit von **1 Kachel (Tile) pro Simulationstick**.

---

## 10. AI Game Manager (Soziale Dreigliederung) & Gedankenprotokolle (Reasoning Thoughts)

Um die Steuerung und Lebensechtheit der drei AI Game Manager (Geistesleben, Rechtssphäre, Wirtschaftsleben) transparent und anpassbar zu machen, wurden Admin-Kontrollen und Gedankenprotokolle (Reasoning Thoughts) direkt in das Dashboard integriert:

### 1. Die drei Sphären-Manager (Soziale Dreigliederung)
- **Geistesleben (Kulturelle Sphäre):** Steuert die Platzierung spiritueller Symbole und uralter Relikte (`relics`), die die Interessen der Agenten wecken.
- **Rechtssphäre (Rechtliche/Politische Sphäre):** Überwacht legislative Zyklen und initiiert Systemgesetze wie "Equitable Resource Sharing", "Eco-Conservation" oder "Builder Subsidy".
- **Wirtschaftsleben (Wirtschaftliche/Ressourcen Sphäre):** Reagiert auf Güterknappheiten, steuert klimatische Ereignisse (Dürren, reiche Ernten) und fördert Kooperationen.

### 2. Live Admin-Einstellungen (Sliders & Rates)
Jeder Tab der drei Sphären besitzt nun ein dediziertes Einstellungs-Panel mit Echtzeit-Schiebereglern:
- **Relic Spawn Rate:** Taktung (in Ticks) für die Generierung neuer Geistesleben-Relikte.
- **Artifact Quality Level:** Qualitätsstufe der generierten Artefakte (0% bis 100%).
- **Law Proposal Rate:** Intervall (in Ticks) für Gesetzesvorschläge im Gerichtshof.
- **Economic Event Rate:** Taktung für Wirtschaftsereignisse und Katastrophen.

### 3. KI-Gedankenprotokolle (Reasoning Thoughts)
Die kognitiven Überlegungen der drei Game Manager werden in Echtzeit aus dem Python-Service per gRPC in die Go-Simulation übertragen und über WebSockets an das Frontend gesendet:
- **Visualisierung:** Jedes Sphären-Dashboard enthält einen scrollbaren Gedankenstrom-Panel, der die internen Erwägungen, Entscheidungen und Analysen der jeweiligen KI mit präzisen Zeitstempeln rückwirkend auflistet.
- **Echtzeit-Feedback:** Spieler sehen sofort, warum ein Manager ein Gesetz vorschlägt, ein Event startet oder ein Relikt spawnen lässt.




