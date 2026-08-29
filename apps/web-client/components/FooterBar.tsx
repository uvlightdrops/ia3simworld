import React from "react";
import { WorldState } from "../types/sim";

type ManagerSettings = {
  ollamaEnabled: boolean;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaMode: string;
  ollamaTimeoutMs: number;
};

export function FooterBar({
  state,
  managerSettings,
}: {
  state: WorldState;
  managerSettings: ManagerSettings;
}) {
  return (
    <footer
      style={{
        marginTop: 12,
        padding: "6px 16px",
        background: "#1e293b",
        borderTop: "1px solid #334155",
        borderRadius: 8,
        fontSize: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        color: "#94a3b8",
        flexShrink: 0
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
        <span style={{ fontWeight: "bold", color: "#38bdf8", display: "flex", alignItems: "center", gap: 6 }}>
          ⚙️ Background Tasks:
        </span>

        <span
          title="Authoritative simulation tick engine loop running in Go world-sim"
          style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "help", background: "#0f172a", padding: "2px 8px", borderRadius: 4, border: "1px solid #334155" }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: state.running ? "#10b981" : "#ef4444" }} />
          <b>Sim Tick Loop:</b> #{state.tick} ({state.running ? "ACTIVE" : "PAUSED"})
        </span>

        <span
          title="Mesa Agent Behavior Logic Engine connected over gRPC on :50051"
          style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "help", background: "#0f172a", padding: "2px 8px", borderRadius: 4, border: "1px solid #334155" }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
          <b>Mesa Agent Service:</b> gRPC :50051 (Online)
        </span>

        <span
          title={`Ollama GameMaster KI Provider: BaseURL=${managerSettings.ollamaBaseUrl}, Model=${managerSettings.ollamaModel}, Mode=${managerSettings.ollamaMode}, Timeout=${managerSettings.ollamaTimeoutMs}ms`}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "help", background: "#0f172a", padding: "2px 8px", borderRadius: 4, border: "1px solid #334155" }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: managerSettings.ollamaEnabled ? "#10b981" : "#f59e0b" }} />
          <b>Ollama KI:</b> {managerSettings.ollamaEnabled ? `${managerSettings.ollamaModel} (${managerSettings.ollamaMode})` : "Disabled (Rule-Based Fallback)"}
        </span>

        <span
          title={`Active federated sector shards in cluster: ${state.discoveredSectors?.join(", ") || "(0,0)"}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "help", background: "#0f172a", padding: "2px 8px", borderRadius: 4, border: "1px solid #334155" }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#38bdf8" }} />
          <b>Federated Shards:</b> {state.discoveredSectors?.length || 1} Sector(s)
        </span>
      </div>

      <div style={{ fontSize: 11, color: "#64748b", flexShrink: 0, paddingLeft: 12 }}>
        IA3 SimWorld v1.0.78
      </div>
    </footer>
  );
}
