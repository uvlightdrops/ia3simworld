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

