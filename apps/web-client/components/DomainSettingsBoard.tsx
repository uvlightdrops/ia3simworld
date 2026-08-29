import React, { useEffect, useState } from "react";
import { API, DomainMode, DomainSettings } from "../types/sim";

const DEFAULT_SETTINGS: DomainSettings = {
  economy: { mode: "full", quotaPerWindow: 20, windowSize: 100 },
  court: { mode: "full", quotaPerWindow: 10, windowSize: 100 },
  geistesleben: { mode: "full", quotaPerWindow: 10, windowSize: 100 },
};

type DomainKey = "economy" | "court" | "geistesleben";

const DOMAIN_LABELS: Record<DomainKey, { label: string; icon: string; description: string }> = {
  economy: {
    label: "Wirtschaft",
    icon: "⚙️",
    description: "Produktionsgebäude, Handel, Logistik (Mühle, Schmiede, Steinbruch, …)",
  },
  court: {
    label: "Recht / Court",
    icon: "⚖️",
    description: "Tribunalentscheidungen, Gesetze, Bodennutzungspolitik",
  },
  geistesleben: {
    label: "Geistesleben",
    icon: "🎨",
    description: "Artefakte, Relikte, kulturelle Ereignisse, KI-Gedanken (Ollama)",
  },
};

const MODE_LABELS: Record<DomainMode, { label: string; color: string; title: string }> = {
  off: { label: "Aus", color: "#dc2626", title: "Bereich vollständig deaktiviert" },
  restricted: { label: "Eingeschränkt", color: "#d97706", title: "Nur Kernaktionen + Quota/Budget" },
  full: { label: "Voll", color: "#16a34a", title: "Kein Limit, volle Aktivität" },
};

export function DomainSettingsBoard() {
  const [settings, setSettings] = useState<DomainSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/control/domain-settings`)
      .then((r) => r.json())
      .then((data: DomainSettings) => {
        setSettings(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const save = async (next: DomainSettings) => {
    try {
      const res = await fetch(`${API}/api/control/domain-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (res.ok) {
        const saved: DomainSettings = await res.json();
        setSettings(saved);
        setStatus("✅ Einstellungen gespeichert");
      } else {
        setStatus("❌ Fehler beim Speichern");
      }
    } catch {
      setStatus("❌ Serverfehler");
    }
    setTimeout(() => setStatus(null), 2500);
  };

  const setMode = (domain: DomainKey, mode: DomainMode) => {
    const next: DomainSettings = {
      ...settings,
      [domain]: { ...settings[domain], mode },
    };
    setSettings(next);
    save(next);
  };

  const setQuota = (domain: DomainKey, quotaPerWindow: number) => {
    setSettings((prev) => ({
      ...prev,
      [domain]: { ...prev[domain], quotaPerWindow },
    }));
  };

  const setWindow = (domain: DomainKey, windowSize: number) => {
    setSettings((prev) => ({
      ...prev,
      [domain]: { ...prev[domain], windowSize },
    }));
  };

  const saveQuota = (domain: DomainKey) => {
    save(settings);
  };

  if (loading) {
    return <div style={{ color: "#94a3b8", padding: 16 }}>Lade Domain-Einstellungen…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 4 }}>
        Steuere Aktivitätsstufen der drei sozialen Bereiche, um Server-Ressourcen zu schonen.
      </div>

      {(["economy", "court", "geistesleben"] as DomainKey[]).map((domain) => {
        const cfg = settings[domain];
        const meta = DOMAIN_LABELS[domain];
        const isRestricted = cfg.mode === "restricted";

        return (
          <div
            key={domain}
            style={{
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 8,
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20 }}>{meta.icon}</span>
              <div>
                <div style={{ color: "#f1f5f9", fontWeight: 600, fontSize: 15 }}>{meta.label}</div>
                <div style={{ color: "#64748b", fontSize: 12 }}>{meta.description}</div>
              </div>
              <div
                style={{
                  marginLeft: "auto",
                  background: MODE_LABELS[cfg.mode].color + "22",
                  border: `1px solid ${MODE_LABELS[cfg.mode].color}`,
                  color: MODE_LABELS[cfg.mode].color,
                  borderRadius: 6,
                  padding: "2px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {MODE_LABELS[cfg.mode].label}
              </div>
            </div>

            {/* Mode Selector */}
            <div style={{ display: "flex", gap: 6 }}>
              {(["off", "restricted", "full"] as DomainMode[]).map((mode) => {
                const active = cfg.mode === mode;
                return (
                  <button
                    key={mode}
                    title={MODE_LABELS[mode].title}
                    onClick={() => setMode(domain, mode)}
                    style={{
                      flex: 1,
                      padding: "6px 4px",
                      borderRadius: 6,
                      border: active
                        ? `2px solid ${MODE_LABELS[mode].color}`
                        : "2px solid #334155",
                      background: active ? MODE_LABELS[mode].color + "33" : "#0f172a",
                      color: active ? MODE_LABELS[mode].color : "#64748b",
                      fontWeight: active ? 700 : 400,
                      fontSize: 13,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {MODE_LABELS[mode].label}
                  </button>
                );
              })}
            </div>

            {/* Quota settings (only shown in restricted mode) */}
            {isRestricted && (
              <div
                style={{
                  background: "#0f172a",
                  borderRadius: 6,
                  padding: "10px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ color: "#d97706", fontSize: 12, fontWeight: 600 }}>
                  ⚙️ Budget-Konfiguration (Eingeschränkter Modus)
                </div>

                {/* Quota slider */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: "#94a3b8", fontSize: 12 }}>Max. Aktionen pro Fenster</span>
                    <span style={{ color: "#f1f5f9", fontSize: 12, fontWeight: 600 }}>
                      {cfg.quotaPerWindow}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={cfg.quotaPerWindow}
                    onChange={(e) => setQuota(domain, parseInt(e.target.value))}
                    onMouseUp={() => saveQuota(domain)}
                    onTouchEnd={() => saveQuota(domain)}
                    style={{ width: "100%", accentColor: "#d97706" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#475569", fontSize: 11 }}>1 (minimal)</span>
                    <span style={{ color: "#475569", fontSize: 11 }}>100 (maximal)</span>
                  </div>
                </div>

                {/* Window size slider */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: "#94a3b8", fontSize: 12 }}>Fenstergröße (Ticks)</span>
                    <span style={{ color: "#f1f5f9", fontSize: 12, fontWeight: 600 }}>
                      {cfg.windowSize} Ticks
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={500}
                    step={10}
                    value={cfg.windowSize}
                    onChange={(e) => setWindow(domain, parseInt(e.target.value))}
                    onMouseUp={() => saveQuota(domain)}
                    onTouchEnd={() => saveQuota(domain)}
                    style={{ width: "100%", accentColor: "#d97706" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#475569", fontSize: 11 }}>10 Ticks</span>
                    <span style={{ color: "#475569", fontSize: 11 }}>500 Ticks</span>
                  </div>
                </div>

                <div style={{ color: "#64748b", fontSize: 11 }}>
                  Erlaubt maximal <strong style={{ color: "#d97706" }}>{cfg.quotaPerWindow}</strong> Aktionen
                  pro <strong style={{ color: "#d97706" }}>{cfg.windowSize}</strong> Ticks-Fenster.
                  Im eingeschränkten Modus werden außerdem optionale Aktionen (z.&thinsp;B. Schmiede, Töpferei)
                  deaktiviert; nur Kernaktionen (Mühle, Lager) bleiben aktiv.
                </div>
              </div>
            )}
          </div>
        );
      })}

      {status && (
        <div
          style={{
            textAlign: "center",
            color: status.startsWith("✅") ? "#22c55e" : "#ef4444",
            fontSize: 13,
            fontWeight: 600,
            padding: "6px 0",
          }}
        >
          {status}
        </div>
      )}
    </div>
  );
}
