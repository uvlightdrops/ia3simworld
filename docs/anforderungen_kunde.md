# Offene Anforderungen (Kunde)

### 1. Ressourcen & Landwirtschaft (Food)
- **Felder anlegen und bebauen:** Agenten sollen in der Lage sein, neue Nutzkulturfelder (`crops`) selbstständig anzulegen und diese aktiv zu bebauen/pflegen.
- **Wildfrüchte verknappen:** Wildbeeren-Vorkommen im Wald sollen wesentlich knapper verteilt und seltener generiert werden, um den Fokus auf gezielte Landwirtschaft zu lenken.

### 2. Landschafts-Generierung (Fluss & Seen)
- **Fluss mit Abzweigung:** Die Weltkarte soll durch einen prozedural generierten, fließenden Hauptstrom mit Abzweigungen (Mündungsarme/Gabelungen) durchzogen werden.
- **Reduzierte Seen:** Die Anzahl isolierter, runder Seen soll verringert werden, um Platz für das Flusssystem zu schaffen.
- **Admin-Page Settings:** Auf der Admin-Einstellungsseite im Frontend sollen Parameter zur Landschaftsgestaltung (Flussbreite, Anzahl Verzweigungen, Seen-Dichte) dynamisch justiert werden können.



##### Multiplayer

Ein weiterer Namespace auf minikube um eine weitere instanz zu betreiben. Für das lokale dev braucht es dann ein weiteres forwarding , alles in scripts doppeln oder neu aufbauen

Die instanzen die verbunden sind spielen auf einer gemeinsamen Welt. Dh, die vorhandene welt der zuerst laufenden instanz wird von der zweiten mit bespielt. Mache dazu geeignete darstellung auf der frontpage sowie settings auf der admin page
