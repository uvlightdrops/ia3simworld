import React from "react";

export function AboutModal({
  aboutSubTab,
  setAboutSubTab,
}: {
  aboutSubTab: string;
  setAboutSubTab: (subTab: string) => void;
}) {
  return (
    <div style={{ flex: 1, overflowY: "auto", paddingRight: 4, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ background: "#1e293b", padding: 20, borderRadius: 12, border: "1px solid #334155" }}>
        <h3 style={{ margin: "0 0 10px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          ℹ️ IA3 SimWorld – Technical Documentation Center
        </h3>
        <p style={{ margin: 0, fontSize: 13, color: "#cbd5e1", lineHeight: "1.5" }}>
          Welcome to the simulation knowledge center. All system designs, social models, multi-node multiplayer protocols, and virtual reality bridges are cataloged below. Select a handbook section to browse the active system specs.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 24, flex: 1, minHeight: 0 }}>
        {/* Sidebar selection for sub-document */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { id: "architecture", label: "🗺️ System & World Specs" },
            { id: "agent-logic", label: "🧠 Agent Logic & Society" },
            { id: "opensim", label: "🕶️ OpenSIM Integration" },
            { id: "ar-realworld", label: "📱 AR & Real-World Specs" },
            { id: "economy-taxonomy", label: "🌾 Economy & Goods Taxonomy" },
            { id: "backlog", label: "📋 Open Backlog Tasks" }
          ].map((doc) => {
            const isSel = aboutSubTab === doc.id;
            return (
              <button
                key={doc.id}
                onClick={() => setAboutSubTab(doc.id)}
                style={{
                  background: isSel ? "#38bdf8" : "#1e293b",
                  color: isSel ? "#0f172a" : "#cbd5e1",
                  border: isSel ? "none" : "1px solid #334155",
                  borderRadius: 8,
                  padding: "12px 16px",
                  textAlign: "left",
                  fontWeight: "bold",
                  fontSize: 13,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  boxShadow: isSel ? "0 4px 12px rgba(56, 189, 248, 0.25)" : "none"
                }}
              >
                {doc.label}
              </button>
            );
          })}
        </div>

        {/* Document Reader Area */}
        <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12, padding: 24, overflowY: "auto", maxHeight: "calc(100vh - 280px)" }}>
          {aboutSubTab === "architecture" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <h4 style={{ margin: 0, color: "#38bdf8", fontSize: 20, borderBottom: "1px solid #1e293b", paddingBottom: 8 }}>
                🗺️ System Architecture & Infinite World Specs
              </h4>
              <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: "1.6", display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ background: "#1e293b", borderLeft: "4px solid #38bdf8", padding: 12, borderRadius: 6 }}>
                  <b>Startwelt-Dimensionen:</b> Die Simulation erzeugt beim Initialisieren ein komplettes OpenSIM-kompatibles Gebiet der Größe <b>256x256 Tiles (65.536 Kacheln)</b>. Das gesamte Gelände wird über mathematisches fraktales Rauschen (FBM) erzeugt.
                </div>
                
                <p style={{ margin: 0 }}>
                  <b>1. Fluss- & Landschaftsmodell:</b> Ein mäandernder Hauptstrom der Breite 4 fließt von oben nach unten. Zur Seite spaltet sich ein Gabelarm ab. Isolierte Seen wurden auf ein Minimum reduziert, um zusammenhängendes Bauland zu schaffen.
                </p>

                <p style={{ margin: 0 }}>
                  <b>2. Infrastruktur & A*-Navigation:</b> Marktplätze und das Tribunal (Courtroom) werden mit einem Abstands-Constraint von mindestens 10 Tiles zueinander und zu den 3 Siedlungszentren prozedural platziert. Die Navigation erfolgt toroidal über alle vier Weltenränder mittels hocheffizientem A*-Suchpfad.
                </p>

                <p style={{ margin: 0 }}>
                  <b>3. Unendliche Weltexpansion (Seamless Sharding):</b> Bei Bewegung an den Randgrenzen werden automatisch angrenzende 256x256-Sektoren generiert und über das Multi-Node-Multiplayer-System synchronisiert. Die Entdeckungen werden von den Agenten im Tribunal-Register exekutiv eingepflegt.
                </p>

                <p style={{ margin: 0 }}>
                  <b>4. Shared World Multiplayer:</b> Durch Verbindung zweier Port-Forward-Instanzen auf Minikube (:13000 und :13001) spiegelt der Client-Knoten den Zustand des Master-Simulators im Shared-World-Modus. Zu Sicherheitszwecken werden Steuerungselemente auf Sekundär-Knoten ausgeblendet.
                </p>
              </div>
            </div>
          )}

          {aboutSubTab === "agent-logic" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <h4 style={{ margin: 0, color: "#38bdf8", fontSize: 20, borderBottom: "1px solid #1e293b", paddingBottom: 8 }}>
                🧠 Kognitive Agentenlogik & Soziales Drei-Gliederungsmodell
              </h4>
              <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: "1.6", display: "flex", flexDirection: "column", gap: 14 }}>
                <p style={{ margin: 0 }}>
                  <b>1. Kognitives Verhalten (Mesa-Framework):</b> Die Agenten sind mit deterministischen, stateful Verhaltensprofilen (Scout, Builder, Researcher, Tracker) über gRPC an das Python-Mesa-Modell gekoppelt. Sie agieren nach einem 24-Stunden-Zyklus (Schlafen, Handeln auf dem Marktplatz, Erfüllung von Missionen und Tribunal-Abendsitzungen).
                </p>

                <p style={{ margin: 0 }}>
                  <b>2. Interessen-Bugfix & Lebenszyklus:</b> Alle Interessen starten bei korrekten Initialwerten und entwickeln sich organisch. Ein passiver Verfall von -1% pro Tick (20% Chance, Floor 10%) interagiert mit aktivem Verstärkungslernen (+2% bei Aufgabenerfüllung) und probabilistischer sozialer Transmission (Contagion/Lernen bei Proximity).
                </p>

                <p style={{ margin: 0 }}>
                  <b>3. Existenzsicherung & Hunger:</b> Der Grundverbrauch liegt bei 2 Einheiten pro Tick. Ohne Feldfrüchte-Ernte (crops) oder Beeren erleiden Agenten Hunger-Malus und verlieren 3 Energie-Einheiten pro Tick, was schnelle Erschöpfung bewirkt.
                </p>

                <p style={{ margin: 0 }}>
                  <b>4. Kollektives Festival-Szenario:</b> Das Herbst-Festival veranlasst alle AI-Agenten zum Abbruch ihrer Aufgaben, um am fernen Festplatz Zelte aufzuschlagen, Musik zu spielen und am flackernden Canvas-Lagerfeuer zu schmausen (+5% Energie/Ressourcen und +3% Philosophie/Socializing/Art pro Tick). Nach 24h wandern sie heim und verfassen den civilizationsgeschichtlichen Chronicle Report.
                </p>
              </div>
            </div>
          )}

          {aboutSubTab === "opensim" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <h4 style={{ margin: 0, color: "#38bdf8", fontSize: 20, borderBottom: "1px solid #1e293b", paddingBottom: 8 }}>
                🕶️ OpenSIM 3D-Protokoll-Interoperabilität & LSL-Brücke
              </h4>
              <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: "1.6", display: "flex", flexDirection: "column", gap: 14 }}>
                <p style={{ margin: 0 }}>
                  <b>1. PNG-Gelände-Heightmap:</b> Eine standardisierte Grayscale-Heightmap (256x256 8-Bit) wird über <code>/state/opensim/png</code> bereitgestellt. Sie entspricht exakt dem OpenSim-Terraingitter und erlaubt direkten Import in Inworld-Regionen.
                </p>

                <p style={{ margin: 0 }}>
                  <b>2. JSON-LSL-Schnittstelle:</b> Unter <code>/state/opensim/json</code> liefert das API-Gateway ein speicheroptimiertes Daten-Array aller Agenten-Koordinaten und World-Objekte skaliert auf OpenSIM-Metermessungen (256m x 256m).
                </p>

                <p style={{ margin: 0, fontWeight: "bold", color: "#eab308" }}>
                  Referenz-LSL-Skript zur Replikation in OpenSim (Linden Scripting Language):
                </p>
                
                <pre style={{ background: "#1e293b", padding: 12, borderRadius: 6, fontSize: 11, fontFamily: "monospace", overflowX: "auto", border: "1px solid #334155", color: "#10b981" }}>
{`default {
    state_entry() {
        llSetTimerEvent(5.0); // Poll simulator every 5s
    }
    timer() {
        llHTTPRequest("http://YOUR_GATEWAY_URL/api/state/opensim/json", [], "");
    }
    http_response(key id, integer status, list meta, string body) {
        if (status == 200) {
            list parsed = llJson2List(body);
            // Rezzes or updates dynamic agents in the 3D grid
        }
    }
}`}
                </pre>
              </div>
            </div>
          )}

          {aboutSubTab === "ar-realworld" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <h4 style={{ margin: 0, color: "#38bdf8", fontSize: 20, borderBottom: "1px solid #1e293b", paddingBottom: 8 }}>
                📱 Augmented Reality (AR) & Realwelt-Anbindung (Augsburg/Bayern)
              </h4>
              <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: "1.6", display: "flex", flexDirection: "column", gap: 14 }}>
                <p style={{ margin: 0 }}>
                  <b>1. Realwelt-Geodaten:</b> Durch Einlesen hochauflösender DGM-Geländehöhendaten der Bayerischen Vermessungsverwaltung (OpenData Bayern) lässt sich das exakte Terrain von Augsburg prozedural in unsere 256x256-Sektoren gießen.
                </p>
                <p style={{ margin: 0 }}>
                  <b>2. OpenStreetMap Vektor-Schnittstelle:</b> Eine geplante Go-Parsing-Pipeline auf Basis von <code>github.com/qedus/osmpbf</code> liest Gebäude, Straßen und Landmarken (z. B. Rathausplatz Augsburg) direkt ein, um sie als Navigationsnetz für die Agenten und reale 3D-Kollisionsobjekte abzubilden.
                </p>
                <p style={{ margin: 0 }}>
                  <b>3. WGS84 Koordinatentransformation:</b> Umrechnung von Längen- und Breitengraden (Lat/Lon) in das lokale 2D-Meter-Gitter der Engine (EPSG:3857/Web Mercator oder UTM Zone 32N), sodass Agentenbewegungen zentimetergenau mit echten Geokoordinaten korrelieren.
                </p>
                <p style={{ margin: 0 }}>
                  <b>4. Live-Sensoren & Wetter-Sychronisation:</b> Einbindung von Live-APIs zur Synchronisation des echten Wetters in Augsburg sowie Pegelstände von Lech und Wertach, um Dürren oder reiche Ernten in Echtzeit in der Dreigliederungssimulation widerzuspiegeln.
                </p>
              </div>
            </div>
          )}

          {aboutSubTab === "economy-taxonomy" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <h4 style={{ margin: 0, color: "#38bdf8", fontSize: 20, borderBottom: "1px solid #1e293b", paddingBottom: 8 }}>
                🌾 Wirtschaftsleben: Produktionsketten & Güter-Taxonomie (Eco-Standards)
              </h4>
              <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: "1.6", display: "flex", flexDirection: "column", gap: 14 }}>
                <p style={{ margin: 0 }}>
                  Die Spiel-Wirtschaft orientiert sich an etablierten Multi-User-Standards (wie <i>Eco</i> oder <i>Eve Online</i>) und adaptiert diese an die Prinzipien der <b>Sozialen Dreigliederung</b>:
                </p>
                <div style={{ background: "#1e293b", padding: 14, borderRadius: 8, border: "1px solid #334155" }}>
                  <strong style={{ color: "#38bdf8", display: "block", marginBottom: 6 }}>1. Taxonomie-Klassen:</strong>
                  <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
                    <li><b>ROHSTOFF (Tier 0):</b> Naturressourcen wie Holz, Weizen, Stein und Wasser.</li>
                    <li><b>VERARBEITET (Tier 1 & 2):</b> Veredelte Güter wie Mehl, Brot, Holzbohlen und Werkzeuge.</li>
                    <li><b>KULTURGUT (Immateriell):</b> Rezepte, Baupläne und Bücher. Freie Güter des Geisteslebens, die sich bei Vervielfältigung nicht abnutzen oder entziehen.</li>
                    <li><b>ABFALL:</b> Kompost und Müll, der bei Herstellung/Konsum entsteht (Kreislauf-Prinzip).</li>
                  </ul>
                </div>

                <div style={{ borderTop: "1px solid #1e293b", paddingTop: 10 }}>
                  <strong style={{ color: "#38bdf8", display: "block", marginBottom: 6 }}>2. Produktions-Rezepturen (Recipe Graph):</strong>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #334155", color: "#94a3b8" }}>
                        <th style={{ padding: 6 }}>Rezept</th>
                        <th style={{ padding: 6 }}>Input-Stoffe</th>
                        <th style={{ padding: 6 }}>Output-Güter</th>
                        <th style={{ padding: 6 }}>Arbeit (Ticks)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: "1px solid #1e293b" }}>
                        <td style={{ padding: 6, fontWeight: "bold" }}>Weizen mahlen</td>
                        <td style={{ padding: 6 }}>2 Weizen</td>
                        <td style={{ padding: 6 }}>1 Mehl + 0.2 Kompost</td>
                        <td style={{ padding: 6 }}>4 Ticks</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid #1e293b" }}>
                        <td style={{ padding: 6, fontWeight: "bold" }}>Brot backen</td>
                        <td style={{ padding: 6 }}>1 Mehl + 1 Wasser</td>
                        <td style={{ padding: 6 }}>2 Brot + 0.1 Kompost</td>
                        <td style={{ padding: 6 }}>6 Ticks</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid #1e293b" }}>
                        <td style={{ padding: 6, fontWeight: "bold" }}>Holz sägen</td>
                        <td style={{ padding: 6 }}>1 Holz</td>
                        <td style={{ padding: 6 }}>3 Holzbohlen + 0.3 Kompost</td>
                        <td style={{ padding: 6 }}>3 Ticks</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid #1e293b" }}>
                        <td style={{ padding: 6, fontWeight: "bold" }}>Schmieden</td>
                        <td style={{ padding: 6 }}>2 Stein + 1 Holzbohle</td>
                        <td style={{ padding: 6 }}>1 Werkzeug</td>
                        <td style={{ padding: 6 }}>8 Ticks</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {aboutSubTab === "backlog" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <h4 style={{ margin: 0, color: "#38bdf8", fontSize: 20, borderBottom: "1px solid #1e293b", paddingBottom: 8 }}>
                📋 Offenes Kunden-Backlog (Anforderungen)
              </h4>
              <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: "1.6", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ padding: 10, background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: 6 }}>
                  <b>[✓] Interaktive Anfragen (Phase A):</b> Spieler können Agenten ansprechen und interaktive Aufgaben/Quests stellen (Ressource liefern, gemeinsam erkunden, Weisheit lehren, Feld anlegen).
                </div>
                <div style={{ padding: 10, background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: 6 }}>
                  <b>[✓] Energieabhängige Geschwindigkeiten:</b> Agenten und Spieler bewegen sich pro Tick 1, 2 oder 3 Tiles weit, gesteuert über ihr aktuelles Energielevel.
                </div>
                <div style={{ padding: 10, background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: 6 }}>
                  <b>[✓] Föderiertes Sharding (Sektor-Knoten):</b> Weltkarte in Chunks aufgeteilt (Sektor 0,0 auf ia3, Sektor 1,0 auf ia3-2, Sektor 0,1 auf ia3-3) mit vollautomatischem toroidalen Handover-Grenzübertritts-Protokoll per REST API.
                </div>
                <div style={{ padding: 10, background: "rgba(234, 179, 8, 0.1)", border: "1px solid rgba(234, 179, 8, 0.3)", borderRadius: 6 }}>
                  <b>[ ] Föderierte Wissensgraphen:</b> Kontinuierlicher dezentraler Austausch von Agenteninteressen als semantische GraphLang-Kanten.
                </div>
                <div style={{ padding: 10, background: "rgba(234, 179, 8, 0.1)", border: "1px solid rgba(234, 179, 8, 0.3)", borderRadius: 6 }}>
                  <b>[ ] Dezentrale Brain-Nodes:</b> Bereitstellen dezentraler Python agent-service Instanzen zur Kognitionsberechnung.
                </div>
                <div style={{ padding: 10, background: "rgba(234, 179, 8, 0.1)", border: "1px solid rgba(234, 179, 8, 0.3)", borderRadius: 6 }}>
                  <b>[ ] AR & Realwelt-Anbindung (Augsburg/Bayern):</b> Mathematische WGS84-Transformation, osmpbf-Parsing von Augsburg-Gebäuden und Live-Wetter/Sensorkopplung.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
