import React, { useState } from "react";
import { WorldState, MapSource, ImportedMap, API, getApiBase } from "../types/sim";
import { useI18n } from "../context/I18nContext";

type Props = {
  state: WorldState;
  onRefresh: () => Promise<void>;
};

export function MapManagementBoard({ state, onRefresh }: Props) {
  const { t } = useI18n();

  // New Source Form State
  const [newSrcName, setNewSrcName] = useState("");
  const [newSrcType, setNewSrcType] = useState("osm_overpass");
  const [newSrcUrl, setNewSrcUrl] = useState("");
  const [newSrcDesc, setNewSrcDesc] = useState("");
  const [isSubmittingSource, setIsSubmittingSource] = useState(false);

  // Import Map Form State
  const [selectedPreset, setSelectedPreset] = useState<"augsburg" | "muenchen" | "nuernberg" | "custom">("augsburg");
  const [importMapName, setImportMapName] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState("src-2");
  const [centerLatInput, setCenterLatInput] = useState("48.3689");
  const [centerLonInput, setCenterLonInput] = useState("10.8978");
  const [isImporting, setIsImporting] = useState(false);
  const [importStatusMessage, setImportStatusMessage] = useState<string | null>(null);

  // Inspector Hover / Selection State
  const [hoveredPoi, setHoveredPoi] = useState<{
    name: string;
    lat: number;
    lon: number;
    type: string;
    xTile: number;
    yTile: number;
    dxMeters: number;
    dyMeters: number;
  } | null>(null);

  const sources: MapSource[] = state.mapSources && state.mapSources.length > 0 ? state.mapSources : [
    {
      id: "src-1",
      name: "OpenStreetMap Overpass API",
      type: "osm_overpass",
      url: "https://overpass-api.de/api/interpreter",
      description: "Live OpenStreetMap Vektor-Geodaten Schnittstelle (Global)",
      status: "online",
      createdAt: "2026-08-28"
    },
    {
      id: "src-2",
      name: "Augsburg & Umgebung (OSM Vektorset)",
      type: "geojson_preset",
      url: "preset://augsburg-stadt-schwaben",
      description: "Offizielles Stadtportal & POI Vektordaten-Set Augsburg",
      status: "ready",
      createdAt: "2026-08-28"
    },
    {
      id: "src-3",
      name: "München Altstadt & Isar",
      type: "geojson_preset",
      url: "preset://muenchen-altstadt-isar",
      description: "Historische Altstadt München, Marienplatz & Isarauen",
      status: "ready",
      createdAt: "2026-08-28"
    },
    {
      id: "src-4",
      name: "Nürnberg Kaiserburg & Pegnitz",
      type: "geojson_preset",
      url: "preset://nuernberg-kaiserburg-pegnitz",
      description: "Nürnberg Hauptmarkt, Kaiserburg & Pegnitz-Flusssystem",
      status: "ready",
      createdAt: "2026-08-28"
    }
  ];

  const importedMaps: ImportedMap[] = state.importedMaps && state.importedMaps.length > 0 ? state.importedMaps : [
    {
      id: "map-1",
      name: "Augsburg Kernstadt & Flusssystem",
      sourceId: "src-2",
      sourceName: "Augsburg & Umgebung (OSM Vektorset)",
      centerLat: 48.3689,
      centerLon: 10.8978,
      centerLatLon: state.centerLatLon || "48.3689° N, 10.8978° E (Augsburg)",
      poisCount: 10,
      roadsCount: 8,
      waterCount: 7,
      importedAt: "2026-08-28 12:00",
      isActive: true
    }
  ];

  function getPresetPois(preset: string, cLat: number, cLon: number) {
    if (preset === "muenchen" || (Math.abs(cLat - 48.1371) < 0.05 && Math.abs(cLon - 11.5754) < 0.05)) {
      return [
        { lat: 48.1371, lon: 11.5754, name: "Marienplatz & Stadtmarkt", type: "market", icon: "🛒" },
        { lat: 48.1386, lon: 11.5736, name: "Frauenkirche & Domgericht", type: "court", icon: "⚖️" },
        { lat: 48.1411, lon: 11.5781, name: "Residenz München", type: "court", icon: "🏰" },
        { lat: 48.1351, lon: 11.5761, name: "Viktualienmarkt", type: "market", icon: "🧺" },
        { lat: 48.1500, lon: 11.5900, name: "Englischer Garten Forst", type: "forest", icon: "🌲" },
        { lat: 48.1315, lon: 11.5861, name: "Deutsches Museum Werkstatt", type: "workshop", icon: "🛠️" },
        { lat: 48.1250, lon: 11.5800, name: "Isar-Mühlenbetrieb", type: "mill", icon: "🌾⚙️" },
        { lat: 48.1300, lon: 11.5950, name: "Haidhausen Siedlung", type: "home", icon: "🏡" },
      ];
    } else if (preset === "nuernberg" || (Math.abs(cLat - 49.4578) < 0.05 && Math.abs(cLon - 11.0778) < 0.05)) {
      return [
        { lat: 49.4578, lon: 11.0778, name: "Nürnberg Hauptmarkt", type: "market", icon: "🛒" },
        { lat: 49.4579, lon: 11.0760, name: "Kaiserburg Nürnberg", type: "court", icon: "🏰" },
        { lat: 49.4510, lon: 11.0780, name: "Lorenzkirche Stadtgericht", type: "court", icon: "⚖️" },
        { lat: 49.4470, lon: 11.0810, name: "Handwerkerhof Nürnberg", type: "workshop", icon: "🛠️" },
        { lat: 49.4530, lon: 11.0700, name: "Pegnitz Mühlenbetrieb", type: "mill", icon: "🌾⚙️" },
        { lat: 49.4580, lon: 11.0600, name: "St. Johannis Siedlung", type: "home", icon: "🏡" },
      ];
    } else {
      // Augsburg or default
      return [
        { lat: cLat, lon: cLon, name: "Augsburg Perlach / Zentrum", type: "market", icon: "🛒" },
        { lat: cLat + 0.003, lon: cLon + 0.002, name: "Perlachturm & Rathaus", type: "court", icon: "🏛️" },
        { lat: cLat - 0.003, lon: cLon - 0.002, name: "Oberhausen Handwerk", type: "workshop", icon: "🛠️" },
        { lat: cLat + 0.004, lon: cLon - 0.004, name: "Rotes Tor Wasserwerk", type: "mill", icon: "🌾⚙️" },
        { lat: cLat - 0.004, lon: cLon + 0.004, name: "Fuggerei Siedlung", type: "home", icon: "🏡" },
        { lat: cLat + 0.006, lon: cLon + 0.006, name: "Siebentischwald Forst", type: "forest", icon: "🌲" },
      ];
    }
  }

  function calculateTileProjection(lat: number, lon: number, cLat: number, cLon: number) {
    const metersPerDegree = 111320.0;
    const dyMeters = (lat - cLat) * metersPerDegree;
    const dxMeters = (lon - cLon) * metersPerDegree * Math.cos((cLat * Math.PI) / 180.0);
    const xTile = Math.round(128 + dxMeters / 10.0);
    const yTile = Math.round(128 - dyMeters / 10.0);
    return { xTile, yTile, dxMeters, dyMeters };
  }

  const currentCenterLat = parseFloat(centerLatInput) || 48.3689;
  const currentCenterLon = parseFloat(centerLonInput) || 10.8978;
  const activePois = getPresetPois(selectedPreset, currentCenterLat, currentCenterLon);

  // Sector (2.56 km) & World (25.6 km) Bounding Box Calculation
  const metersPerDeg = 111320.0;
  const latSpanSector = 1280.0 / metersPerDeg; // ~0.0115°
  const lonSpanSector = 1280.0 / (metersPerDeg * Math.cos((currentCenterLat * Math.PI) / 180.0)); // ~0.0172°
  
  const latSpanWorld = 12800.0 / metersPerDeg; // ~0.115°
  const lonSpanWorld = 12800.0 / (metersPerDeg * Math.cos((currentCenterLat * Math.PI) / 180.0)); // ~0.172°

  function handlePresetChange(preset: "augsburg" | "muenchen" | "nuernberg" | "custom") {
    setSelectedPreset(preset);
    if (preset === "augsburg") {
      setCenterLatInput("48.3689");
      setCenterLonInput("10.8978");
      setImportMapName("Augsburg Kernstadt & Schwaben");
      setSelectedSourceId("src-2");
    } else if (preset === "muenchen") {
      setCenterLatInput("48.1371");
      setCenterLonInput("11.5754");
      setImportMapName("München Altstadt & Isar");
      setSelectedSourceId("src-3");
    } else if (preset === "nuernberg") {
      setCenterLatInput("49.4578");
      setCenterLonInput("11.0778");
      setImportMapName("Nürnberg Kaiserburg & Pegnitz");
      setSelectedSourceId("src-4");
    } else {
      setImportMapName("");
      setSelectedSourceId("src-1");
    }
  }

  async function handleAddSource(e: React.FormEvent) {
    e.preventDefault();
    if (!newSrcName.trim() || !newSrcUrl.trim()) return;

    setIsSubmittingSource(true);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/control/map-sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSrcName,
          type: newSrcType,
          url: newSrcUrl,
          description: newSrcDesc,
          status: "ready"
        }),
      });

      if (res.ok) {
        setNewSrcName("");
        setNewSrcUrl("");
        setNewSrcDesc("");
        await onRefresh();
      } else {
        alert("Fehler beim Hinzufügen der Kartenquelle");
      }
    } catch (err) {
      console.error("Failed to add map source", err);
      alert("Fehler bei der Netzwerkanfrage");
    } finally {
      setIsSubmittingSource(false);
    }
  }

  async function handleTriggerImport(lat?: number, lon?: number, name?: string, srcId?: string) {
    setIsImporting(true);
    setImportStatusMessage(null);

    const targetLat = lat ?? (parseFloat(centerLatInput) || 48.3689);
    const targetLon = lon ?? (parseFloat(centerLonInput) || 10.8978);
    const mapTitle = name ?? (importMapName.trim() || `Vektorkarte (${targetLat.toFixed(4)}°, ${targetLon.toFixed(4)}°)`);
    const sourceId = srcId ?? selectedSourceId;

    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/control/import-osm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapName: mapTitle,
          sourceId: sourceId,
          centerLat: targetLat,
          centerLon: targetLon,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setImportStatusMessage(`✅ Map '${mapTitle}' erfolgreich importiert & in Simulation aktiviert!`);
        await onRefresh();
      } else {
        setImportStatusMessage("❌ Fehler beim Karten-Import");
      }
    } catch (err) {
      console.error("Failed to import map", err);
      setImportStatusMessage("❌ Netzwerkanfrage fehlgeschlagen");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", paddingRight: 8, display: "flex", flexDirection: "column", gap: 20 }}>
      
      {/* 🗺️ Header Banner */}
      <div style={{
        background: "linear-gradient(135deg, rgba(14, 116, 144, 0.25) 0%, rgba(30, 41, 59, 0.9) 100%)",
        border: "1px solid #0891b2",
        borderRadius: 12,
        padding: "16px 20px",
        boxShadow: "0 4px 15px rgba(0,0,0,0.3)"
      }}>
        <h2 style={{ margin: "0 0 6px 0", color: "#38bdf8", fontSize: 20, fontWeight: "bold" }}>
          {t.mapManager.title}
        </h2>
        <p style={{ margin: 0, color: "#cbd5e1", fontSize: 13, lineHeight: "1.4" }}>
          {t.mapManager.subtitle}
        </p>
      </div>

      {/* 🔍 FULL-WIDTH OSM VECTOR MAP & SCALE INSPECTOR (WGS84 -> SIM GRID) */}
      <div style={{
        background: "#1e293b",
        border: "1px solid #0284c7",
        borderRadius: 12,
        padding: 18,
        boxShadow: "0 4px 20px rgba(2, 132, 199, 0.15)",
        display: "flex",
        flexDirection: "column",
        gap: 16
      }}>
        <div>
          <h3 style={{ margin: "0 0 4px 0", color: "#38bdf8", fontSize: 17, display: "flex", alignItems: "center", gap: 8 }}>
            {t.mapManager.previewTitle ?? "🔍 OSM Vektorkarte & Maßstab-Inspektor (WGS84 ➔ Sim Grid)"}
          </h3>
          <p style={{ margin: 0, color: "#94a3b8", fontSize: 12 }}>
            {t.mapManager.previewSubtitle ?? "Vorschau des Geodaten-Setups vor dem Import: Mathematische Projektion von GPS-Koordinaten in das 10m-Kachelraster."}
          </p>
        </div>

        {/* 3-Column Inspector Grid: 1. Visual Map 2D Preview | 2. Scale & Bounding Box Math | 3. Active POI Inspector */}
        <div style={{ display: "grid", gridTemplateColumns: "340px 1fr 1fr", gap: 16, alignItems: "start" }}>

          {/* 1. Visual 2D SVG Map Preview */}
          <div style={{
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: 10,
            padding: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}>
            <div style={{ width: "100%", display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8" }}>
              <span>Sector Grid (256×256 Tile)</span>
              <span style={{ color: "#eab308", fontWeight: "bold" }}>Center: ({currentCenterLat.toFixed(4)}°, {currentCenterLon.toFixed(4)}°)</span>
            </div>

            <div style={{ position: "relative", width: 300, height: 300, background: "#155e75", borderRadius: 8, border: "2px solid #334155", overflow: "hidden" }}>
              {/* Grid Lines Overlay */}
              <svg width="300" height="300" style={{ position: "absolute", top: 0, left: 0 }}>
                {/* Sector grid lines (every 64 tiles) */}
                {[0.25, 0.5, 0.75].map((ratio, i) => (
                  <React.Fragment key={i}>
                    <line x1={ratio * 300} y1="0" x2={ratio * 300} y2="300" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                    <line x1="0" y1={ratio * 300} x2="300" y2={ratio * 300} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                  </React.Fragment>
                ))}

                {/* Center Crosshair (Tile 128, 128) */}
                <line x1="150" y1="0" x2="150" y2="300" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" />
                <line x1="0" y1="150" x2="300" y2="150" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" />
                <circle cx="150" cy="150" r="5" fill="#38bdf8" opacity="0.8" />

                {/* Simulated River Vector Path */}
                <path
                  d="M 20,290 Q 140,200 150,150 T 280,10"
                  fill="none"
                  stroke="#0ea5e9"
                  strokeWidth="10"
                  opacity="0.75"
                />

                {/* Simulated Road Cross vectors */}
                <line x1="10" y1="150" x2="290" y2="150" stroke="#64748b" strokeWidth="6" opacity="0.7" />
                <line x1="150" y1="10" x2="150" y2="290" stroke="#64748b" strokeWidth="6" opacity="0.7" />

                {/* Render POI Badges */}
                {activePois.map((poi, idx) => {
                  const proj = calculateTileProjection(poi.lat, poi.lon, currentCenterLat, currentCenterLon);
                  // Map tile (0..256) to SVG coords (0..300)
                  const svgX = Math.max(12, Math.min(288, (proj.xTile / 256) * 300));
                  const svgY = Math.max(12, Math.min(288, (proj.yTile / 256) * 300));
                  const isHovered = hoveredPoi?.name === poi.name;

                  return (
                    <g
                      key={idx}
                      onClick={() => setHoveredPoi({
                        name: poi.name,
                        lat: poi.lat,
                        lon: poi.lon,
                        type: poi.type,
                        xTile: proj.xTile,
                        yTile: proj.yTile,
                        dxMeters: proj.dxMeters,
                        dyMeters: proj.dyMeters
                      })}
                      onMouseEnter={() => setHoveredPoi({
                        name: poi.name,
                        lat: poi.lat,
                        lon: poi.lon,
                        type: poi.type,
                        xTile: proj.xTile,
                        yTile: proj.yTile,
                        dxMeters: proj.dxMeters,
                        dyMeters: proj.dyMeters
                      })}
                      style={{ cursor: "pointer" }}
                    >
                      <circle
                        cx={svgX}
                        cy={svgY}
                        r={isHovered ? 14 : 10}
                        fill={poi.type === "court" ? "#4338ca" : poi.type === "market" ? "#b45309" : poi.type === "mill" ? "#ca8a04" : poi.type === "workshop" ? "#d97706" : poi.type === "home" ? "#7c2d12" : "#115e59"}
                        stroke={isHovered ? "#fef08a" : "#ffffff"}
                        strokeWidth={isHovered ? 3 : 1.5}
                      />
                      <text
                        x={svgX}
                        y={svgY + 4}
                        textAnchor="middle"
                        fontSize="10"
                        fill="#ffffff"
                        style={{ userSelect: "none", pointerEvents: "none" }}
                      >
                        {poi.icon}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <div style={{ fontSize: 10, color: "#64748b", textAlign: "center" }}>
              💡 Klicken / Mauskontakt auf Markierungen zum Inspizieren von WGS84 & Kachel-Daten
            </div>
          </div>

          {/* 2. Mathematical Scale & Bounding Box Card */}
          <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontWeight: "bold", color: "#eab308", fontSize: 13, borderBottom: "1px solid #334155", paddingBottom: 6 }}>
              {t.mapManager.scaleFormulaTitle ?? "📐 Maßstab & Umrechnung (WGS84 ➔ Meter)"}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
              <div style={{ background: "#1e293b", padding: "6px 10px", borderRadius: 6, border: "1px solid #334155" }}>
                🎯 <b>1 Kachel:</b> <span style={{ color: "#10b981" }}>10m × 10m (100 m²)</span>
              </div>
              <div style={{ background: "#1e293b", padding: "6px 10px", borderRadius: 6, border: "1px solid #334155" }}>
                📐 <b>1 Sektor (256×256 Kacheln):</b> <span style={{ color: "#38bdf8" }}>2.56 km × 2.56 km (6.55 km²)</span>
              </div>
              <div style={{ background: "#1e293b", padding: "6px 10px", borderRadius: 6, border: "1px solid #334155" }}>
                🌍 <b>World Grid (2560×2560 Kacheln):</b> <span style={{ color: "#a855f7" }}>25.6 km × 25.6 km (655 km²)</span>
              </div>
            </div>

            <hr style={{ borderColor: "#334155", margin: 0 }} />

            <div>
              <div style={{ fontWeight: "bold", color: "#38bdf8", fontSize: 11, marginBottom: 4 }}>
                📦 {t.mapManager.boundingSector ?? "Sektor Boundingbox (2.56 km × 2.56 km)"}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "#cbd5e1", background: "#1e293b", padding: 8, borderRadius: 6, border: "1px solid #334155" }}>
                Lat: {(currentCenterLat - latSpanSector).toFixed(4)}° N .. {(currentCenterLat + latSpanSector).toFixed(4)}° N<br />
                Lon: {(currentCenterLon - lonSpanSector).toFixed(4)}° E .. {(currentCenterLon + lonSpanSector).toFixed(4)}° E
              </div>
            </div>

            <div>
              <div style={{ fontWeight: "bold", color: "#a855f7", fontSize: 11, marginBottom: 4 }}>
                🌍 {t.mapManager.boundingWorld ?? "Welt-Grid Boundingbox (25.6 km × 25.6 km)"}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "#cbd5e1", background: "#1e293b", padding: 8, borderRadius: 6, border: "1px solid #334155" }}>
                Lat: {(currentCenterLat - latSpanWorld).toFixed(4)}° N .. {(currentCenterLat + latSpanWorld).toFixed(4)}° N<br />
                Lon: {(currentCenterLon - lonSpanWorld).toFixed(4)}° E .. {(currentCenterLon + lonSpanWorld).toFixed(4)}° E
              </div>
            </div>
          </div>

          {/* 3. Active POI & Tile Inspector Card */}
          <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontWeight: "bold", color: "#38bdf8", fontSize: 13, borderBottom: "1px solid #334155", paddingBottom: 6 }}>
              {t.mapManager.poiInspector ?? "📍 Geodaten-POI & Kachelinflektor"}
            </div>

            {hoveredPoi ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
                <div style={{ fontWeight: "bold", color: "#eab308", fontSize: 14 }}>
                  {hoveredPoi.name}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 8px", background: "#1e293b", padding: 10, borderRadius: 6, border: "1px solid #334155" }}>
                  <div>GPS Lat: <b style={{ color: "#38bdf8" }}>{hoveredPoi.lat.toFixed(4)}° N</b></div>
                  <div>GPS Lon: <b style={{ color: "#38bdf8" }}>{hoveredPoi.lon.toFixed(4)}° E</b></div>
                  <div>Sim Tile X: <b style={{ color: "#10b981", fontFamily: "monospace" }}>{hoveredPoi.xTile}</b></div>
                  <div>Sim Tile Y: <b style={{ color: "#10b981", fontFamily: "monospace" }}>{hoveredPoi.yTile}</b></div>
                  <div>Offset ΔX: <b>{hoveredPoi.dxMeters > 0 ? `+${Math.round(hoveredPoi.dxMeters)}m E` : `${Math.round(hoveredPoi.dxMeters)}m W`}</b></div>
                  <div>Offset ΔY: <b>{hoveredPoi.dyMeters > 0 ? `+${Math.round(hoveredPoi.dyMeters)}m N` : `${Math.round(hoveredPoi.dyMeters)}m S`}</b></div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    Terrain Typ: <b style={{ textTransform: "capitalize", color: "#fef08a" }}>{hoveredPoi.type}</b>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    Cluster Shard: <b style={{ color: "#a855f7" }}>ia3-1 (Sektor 0,0)</b>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: "#64748b", fontSize: 12, fontStyle: "italic", textAlign: "center", padding: "30px 10px" }}>
                💡 Bewege die Maus über einen Marker in der 2D-Karte links oder wähle ein Preset aus, um die exakte Projektion zu prüfen.
              </div>
            )}

            <div style={{ marginTop: "auto", background: "rgba(56, 189, 248, 0.1)", border: "1px solid rgba(56, 189, 248, 0.3)", borderRadius: 6, padding: "8px 10px", color: "#38bdf8", fontSize: 11 }}>
              <b>💡 WGS84 Formel:</b><br />
              <code style={{ fontFamily: "monospace", fontSize: 10 }}>
                yMeters = ΔLat × 111320.0<br />
                xMeters = ΔLon × 111320.0 × cos(Lat)
              </code>
            </div>
          </div>

        </div>
      </div>

      {/* Grid Layout: 2 Columns */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* LEFT COLUMN: Map Data Sources & Provider Management */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* 🌐 Registered Map Sources Card */}
          <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 18 }}>
            <h3 style={{ margin: "0 0 12px 0", color: "#38bdf8", fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
              {t.mapManager.sourcesTitle}
            </h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sources.map((src) => (
                <div key={src.id} style={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  padding: "12px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: "bold", color: "#f8fafc", fontSize: 14 }}>
                      {src.name}
                    </span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: "bold",
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: src.status === "online" ? "rgba(16, 185, 129, 0.2)" : "rgba(56, 189, 248, 0.2)",
                      color: src.status === "online" ? "#10b981" : "#38bdf8",
                      border: `1px solid ${src.status === "online" ? "#10b981" : "#38bdf8"}`
                    }}>
                      {src.type.toUpperCase()} • {src.status.toUpperCase()}
                    </span>
                  </div>
                  
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>
                    {src.description}
                  </div>

                  <div style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    🔗 {src.url}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ➕ Add New Map Source Card */}
          <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 18 }}>
            <h3 style={{ margin: "0 0 12px 0", color: "#38bdf8", fontSize: 16 }}>
              {t.mapManager.addSourceTitle}
            </h3>

            <form onSubmit={handleAddSource} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{t.mapManager.name}</label>
                <input
                  type="text"
                  placeholder="z.B. Bayern Atlas / GeoJSON Server"
                  value={newSrcName}
                  onChange={(e) => setNewSrcName(e.target.value)}
                  style={{ width: "100%", background: "#0f172a", color: "#fff", border: "1px solid #334155", borderRadius: 6, padding: "8px 10px", fontSize: 12, boxSizing: "border-box" }}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{t.mapManager.sourceType}</label>
                  <select
                    value={newSrcType}
                    onChange={(e) => setNewSrcType(e.target.value)}
                    style={{ width: "100%", background: "#0f172a", color: "#fff", border: "1px solid #334155", borderRadius: 6, padding: "8px 10px", fontSize: 12 }}
                  >
                    <option value="osm_overpass">OSM Overpass API</option>
                    <option value="geojson_preset">GeoJSON Preset</option>
                    <option value="wfs_vector">WFS / Vector Server</option>
                    <option value="custom_url">Custom HTTP Endpoint</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{t.mapManager.sourceUrl}</label>
                  <input
                    type="text"
                    placeholder="https://..."
                    value={newSrcUrl}
                    onChange={(e) => setNewSrcUrl(e.target.value)}
                    style={{ width: "100%", background: "#0f172a", color: "#fff", border: "1px solid #334155", borderRadius: 6, padding: "8px 10px", fontSize: 12, boxSizing: "border-box" }}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{t.mapManager.description}</label>
                <input
                  type="text"
                  placeholder="Beschreibung der Geodaten-Quelle..."
                  value={newSrcDesc}
                  onChange={(e) => setNewSrcDesc(e.target.value)}
                  style={{ width: "100%", background: "#0f172a", color: "#fff", border: "1px solid #334155", borderRadius: 6, padding: "8px 10px", fontSize: 12, boxSizing: "border-box" }}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingSource}
                style={{
                  background: "#0284c7",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "10px 16px",
                  fontSize: 12,
                  fontWeight: "bold",
                  cursor: isSubmittingSource ? "not-allowed" : "pointer",
                  marginTop: 4
                }}
              >
                {isSubmittingSource ? "Wird gespeichert..." : t.mapManager.addSourceBtn}
              </button>
            </form>
          </div>

        </div>

        {/* RIGHT COLUMN: Imported Maps & Import Trigger Panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* 🗺️ Import New Map Form */}
          <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 18 }}>
            <h3 style={{ margin: "0 0 12px 0", color: "#38bdf8", fontSize: 16 }}>
              {t.mapManager.importMapTitle}
            </h3>

            {importStatusMessage && (
              <div style={{
                background: importStatusMessage.includes("✅") ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                border: `1px solid ${importStatusMessage.includes("✅") ? "#10b981" : "#ef4444"}`,
                color: importStatusMessage.includes("✅") ? "#6ee7b7" : "#fca5a5",
                borderRadius: 6,
                padding: "8px 12px",
                fontSize: 12,
                marginBottom: 12
              }}>
                {importStatusMessage}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              
              {/* Presets Quick Selector */}
              <div>
                <label style={{ display: "block", fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>Schnellauswahl Vorkonfigurierter Geodaten-Sets</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <button
                    onClick={() => handlePresetChange("augsburg")}
                    style={{
                      background: selectedPreset === "augsburg" ? "#0284c7" : "#0f172a",
                      color: "#fff",
                      border: `1px solid ${selectedPreset === "augsburg" ? "#38bdf8" : "#334155"}`,
                      borderRadius: 6,
                      padding: "8px",
                      fontSize: 11,
                      fontWeight: "bold",
                      cursor: "pointer"
                    }}
                  >
                    🏰 Augsburg
                  </button>
                  <button
                    onClick={() => handlePresetChange("muenchen")}
                    style={{
                      background: selectedPreset === "muenchen" ? "#0284c7" : "#0f172a",
                      color: "#fff",
                      border: `1px solid ${selectedPreset === "muenchen" ? "#38bdf8" : "#334155"}`,
                      borderRadius: 6,
                      padding: "8px",
                      fontSize: 11,
                      fontWeight: "bold",
                      cursor: "pointer"
                    }}
                  >
                    🦁 München
                  </button>
                  <button
                    onClick={() => handlePresetChange("nuernberg")}
                    style={{
                      background: selectedPreset === "nuernberg" ? "#0284c7" : "#0f172a",
                      color: "#fff",
                      border: `1px solid ${selectedPreset === "nuernberg" ? "#38bdf8" : "#334155"}`,
                      borderRadius: 6,
                      padding: "8px",
                      fontSize: 11,
                      fontWeight: "bold",
                      cursor: "pointer"
                    }}
                  >
                    👑 Nürnberg
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>Kartenname / Bezeichnung</label>
                <input
                  type="text"
                  placeholder="Kartenbezeichnung..."
                  value={importMapName}
                  onChange={(e) => setImportMapName(e.target.value)}
                  style={{ width: "100%", background: "#0f172a", color: "#fff", border: "1px solid #334155", borderRadius: 6, padding: "8px 10px", fontSize: 12, boxSizing: "border-box" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>Kartenquelle</label>
                  <select
                    value={selectedSourceId}
                    onChange={(e) => setSelectedSourceId(e.target.value)}
                    style={{ width: "100%", background: "#0f172a", color: "#fff", border: "1px solid #334155", borderRadius: 6, padding: "8px 10px", fontSize: 12 }}
                  >
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>Breite (Lat °N)</label>
                  <input
                    type="text"
                    value={centerLatInput}
                    onChange={(e) => setCenterLatInput(e.target.value)}
                    style={{ width: "100%", background: "#0f172a", color: "#fff", border: "1px solid #334155", borderRadius: 6, padding: "8px 10px", fontSize: 12, boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>Länge (Lon °E)</label>
                  <input
                    type="text"
                    value={centerLonInput}
                    onChange={(e) => setCenterLonInput(e.target.value)}
                    style={{ width: "100%", background: "#0f172a", color: "#fff", border: "1px solid #334155", borderRadius: 6, padding: "8px 10px", fontSize: 12, boxSizing: "border-box" }}
                  />
                </div>
              </div>

              <button
                onClick={() => handleTriggerImport()}
                disabled={isImporting}
                style={{
                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: "bold",
                  cursor: isImporting ? "not-allowed" : "pointer",
                  marginTop: 4
                }}
              >
                {isImporting ? "Wird importiert & gebacken..." : t.mapManager.importBtn}
              </button>

            </div>
          </div>

          {/* 📚 Imported Maps History Catalog */}
          <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 18 }}>
            <h3 style={{ margin: "0 0 12px 0", color: "#38bdf8", fontSize: 16 }}>
              {t.mapManager.importedMapsTitle}
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {importedMaps.map((mapItem) => (
                <div
                  key={mapItem.id}
                  style={{
                    background: "#0f172a",
                    border: `1px solid ${mapItem.isActive ? "#10b981" : "#334155"}`,
                    borderRadius: 8,
                    padding: "12px 14px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: "bold", color: "#f8fafc", fontSize: 14 }}>
                        {mapItem.name}
                      </span>
                      {mapItem.isActive && (
                        <span style={{ fontSize: 10, fontWeight: "bold", background: "#10b981", color: "#000", padding: "2px 6px", borderRadius: 4 }}>
                          {t.mapManager.active}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                      📍 {mapItem.centerLatLon} • 🏛️ {mapItem.poisCount} POIs • 🛣️ {mapItem.roadsCount} Straßen • 🌊 {mapItem.waterCount} Gewässer
                    </div>
                    <div style={{ fontSize: 10, color: "#64748b" }}>
                      Quelle: {mapItem.sourceName} • Importiert: {mapItem.importedAt}
                    </div>
                  </div>

                  {!mapItem.isActive && (
                    <button
                      onClick={() => handleTriggerImport(mapItem.centerLat, mapItem.centerLon, mapItem.name, mapItem.sourceId)}
                      disabled={isImporting}
                      style={{
                        background: "#334155",
                        color: "#38bdf8",
                        border: "1px solid #38bdf8",
                        borderRadius: 6,
                        padding: "6px 12px",
                        fontSize: 11,
                        fontWeight: "bold",
                        cursor: isImporting ? "not-allowed" : "pointer"
                      }}
                    >
                      {t.mapManager.loadInSim}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
