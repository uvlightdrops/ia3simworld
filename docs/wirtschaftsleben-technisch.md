Kann ich für Simulation die komplexen Wirtschaftsabläufe von anderen Projekten oder Open Simulator abkupfern? Gibt es hier Taxonomien von Gütern, die miteinander in Zusammenhang stehen und so fort?

Ja, absolut! Du musst das Rad im Spieldesign nicht neu erfinden. Das Ausleihen und Adaptieren von etablierten Systemen ist in der Spielebranche und bei Simulationen der absoluten Standard.Sowohl im OpenSimulator/Second-Life-Ökosystem als auch in Indie-Simulationsspielen (wie Eco oder Eve Online) und Wirtschaftssimulationen gibt es hervorragende Vorlagen für Produktionsketten, Güter-Taxonomien und Rezept-Graphen.Hier ist eine Übersicht über existierende Taxonomien, wie du diese Systeme anknüpfst und wie du sie auf die Soziale Dreigliederung anpasst.1. Bekannte Vorlagen & Taxonomien für GüterWenn du Güter-Hierarchien und Wirtschaftskreisläufe abbilden willst, kannst du dich an folgenden Standards orientieren:A. Die „Eco“-Spiele-Taxonomie (Strange Loop Games)In Eco (einem MMO für nachhaltiges Wirtschaften) existiert eine exzellente, hierarchische Güter-Struktur, die als Directed Acyclic Graph (DAG) aufgebaut ist:Rohstoffe (Tier 0): Holz, Stein, Eisenersz, Wasser, Pflanzensamen.Verarbeitete Güter (Tier 1): Baustämme, Ziegel, Barren, Nahrungsmittel.Komplexe Güter (Tier 2): Werkzeuge, Transportmittel, Maschinen.Infrastruktur/Kultur (Tier 3): Bücher, Gesetzestafeln, Messgeräte.B. UNSPSC & GS1 (Reale Güter-Taxonomien)Wenn du eine wissenschaftliche oder hochrealistische Basis suchst:UNSPSC (United Nations Standard Products and Services Code): Eine weltweite Taxonomie, die Güter in Segment $\rightarrow$ Familie $\rightarrow$ Klasse $\rightarrow$ Einzelgut einteilt.Für Simulationen reicht meist ein dreistufiger Baum (Kategorie $\rightarrow$ Unterkategorie $\rightarrow$ Item).2. Datenmodell: Ein Go-Rezept-Graph (Production Graph)Um Güterverknüpfungen in Go performant abzubilden, eignet sich eine Graph-Struktur. Güter entstehen nicht aus dem Nichts, sondern durch Umwandlung von Input-Gütern unter Aufwand von Arbeitskraft/Energie.Gopackage main

// Güter-Kategorie
type GutKategorie string

const (
	Rohstoff     GutKategorie = "ROHSTOFF"
	Verarbeitet  GutKategorie = "VERARBEITET"
	Kulturgut    GutKategorie = "KULTURGUT" // Wichtig für Geistesleben!
	Entsorgung   GutKategorie = "ABFALL"
)

// Definition eines Gut-Typs in der Taxonomie
type GutTyp struct {
	ID          string
	Name        string
	Kategorie   GutKategorie
	Haltbarkeit float64 // Zerfällt das Gut mit der Zeit?
	AbfallRate  float64 // Wie viel Müll erzeugt die Nutzung?
}

// Rezept: Beschreibt, wie Güter ineinander umgewandelt werden
type Rezept struct {
	ID           string
	Name         string
	Input        map[string]float64 // z.B. {"Holz": 2.0, "Eisen": 1.0}
	Output       map[string]float64 // z.B. {"Stuhl": 1.0, "Sägemehl": 0.5}
	ArbeitsZeit  float64            // Dauer in Ticks
}
3. Anpassung an die Soziale DreigliederungKlassische Wirtschaftssimulationen (wie Anno oder OpenTTD) behandeln Güter rein profit- oder konsumorientiert. Wenn du die Soziale Dreigliederung integrierst, erweitert sich die Taxonomie um ganz bestimmte Rollen:1. Wirtschaftsleben (Assoziatives Matching & Entsorgung)Kreislaufwirtschaft: Jedes produzierte Gut hinterlässt bei Konsum oder Herstellung ein Abfallprodukt (z. B. $1\text{ Weizen} \rightarrow 1\text{ Brot} + 0.1\text{ Bio-Müll}$).Brüderlicher Tausch: Die Wertbemessung/Preise entstehen nicht durch Spekulation, sondern durch ein Matching von Bedarf (Bedürfnis des Nutzers) und Herstellungskosten (Arbeitszeit + verbrauchte Rohstoffe).2. Rechtsleben (Nutzungsrechte & Vereinbarungen)In einfachen Simulationen "gehört" ein Gut einfach einer Figur.In der Dreigliederung unterscheidest du zwischen Eigentum (wer verwaltet es) und Nutzungsrecht:Ein Agent stellt ein Werkzeug her, übergibt aber das Nutzungsrecht per Vereinbarung an einen anderen Agenten.Bricht die Haltbarkeit des Werkzeugs ein, muss der Entsorgungs-Constraint greifen.3. Geistesleben (Freie Kulturgüter & Fähigkeiten)Güter beschränken sich nicht auf materielle Dinge. Güter wie „Wissen“, „Rezept-Baupläne“ oder „Kunstwerke“ sind immateriell.Constraint: Immaterielle Geistesgüter verbrauchen sich nicht bei Nutzung! Wenn Agent A ein Rezept an Agent B weitergibt (Ansteckung/Lernen), behält Agent A das Rezept trotzdem.Fazit & VorgehenDu musst das System nicht komplett selbst erforschen:Nimm dir die Güter-Liste aus Eco oder eine einfache Minecraft/Anno-Rohstoffkette als Vorlage.Erstelle eine JSON-Datei mit 10–15 Basis-Gütern und 5–10 Rezepten.Binde das in deinen Go-Code über die oben gezeigten GutTyp- und Rezept-Structs ein.