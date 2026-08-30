/**
 * Error Boundary für die Web UI
 * Zeigt Service-Fehler an statt zu crashen
 */

import React, { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  serviceStatus: {
    apiGateway: "connected" | "disconnected" | "checking";
    worldSim: "connected" | "disconnected" | "checking";
  };
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      serviceStatus: {
        apiGateway: "checking",
        worldSim: "checking",
      },
    };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    // Log to console for debugging
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  componentDidMount() {
    this.checkServiceStatus();
    // Check every 5 seconds
    const interval = setInterval(() => this.checkServiceStatus(), 5000);
    return () => clearInterval(interval);
  }

  checkServiceStatus = async () => {
    const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:17080";

    // Check API Gateway
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${API}/api/healthz`, { signal: controller.signal });
      clearTimeout(timeoutId);
      this.setState((prev) => ({
        serviceStatus: {
          ...prev.serviceStatus,
          apiGateway: res.ok ? "connected" : "disconnected",
        },
      }));
    } catch {
      this.setState((prev) => ({
        serviceStatus: {
          ...prev.serviceStatus,
          apiGateway: "disconnected",
        },
      }));
    }

    // Check World-Sim (via API gateway)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${API}/api/state`, { signal: controller.signal });
      clearTimeout(timeoutId);
      this.setState((prev) => ({
        serviceStatus: {
          ...prev.serviceStatus,
          worldSim: res.ok ? "connected" : "disconnected",
        },
      }));
    } catch {
      this.setState((prev) => ({
        serviceStatus: {
          ...prev.serviceStatus,
          worldSim: "disconnected",
        },
      }));
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.errorContainer}>
          <div style={styles.errorBox}>
            <h2>⚠️ Application Error</h2>
            <p>Something went wrong. Try refreshing the page.</p>
            {this.state.error && (
              <details style={{ marginTop: "20px" }}>
                <summary>Error Details</summary>
                <pre style={styles.errorDetails}>
                  {this.state.error.toString()}
                  {"\n\n"}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
            <button
              onClick={() => window.location.reload()}
              style={styles.button}
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return (
      <>
        <ServiceStatusBar status={this.state.serviceStatus} />
        {this.props.children}
      </>
    );
  }
}

/**
 * Service Status Bar - shows at top of UI if any service is down
 */
function ServiceStatusBar(props: {
  status: {
    apiGateway: "connected" | "disconnected" | "checking";
    worldSim: "connected" | "disconnected" | "checking";
  };
}) {
  const isOK =
    props.status.apiGateway === "connected" &&
    props.status.worldSim === "connected";

  if (isOK) {
    return null; // No status bar needed
  }

  return (
    <div
      style={{
        ...styles.statusBar,
        backgroundColor:
          props.status.apiGateway === "disconnected"
            ? "#f44336"
            : "#ff9800",
      }}
    >
      <div style={styles.statusContent}>
        <span style={{ fontWeight: "bold" }}>⚠️ Service Status</span>
        <span style={{ marginLeft: "20px" }}>
          API Gateway:{" "}
          <StatusDot status={props.status.apiGateway} />
        </span>
        <span style={{ marginLeft: "20px" }}>
          World Sim:{" "}
          <StatusDot status={props.status.worldSim} />
        </span>
        <span style={{ marginLeft: "auto", fontSize: "0.85em" }}>
          Retrying in 5 seconds...
        </span>
      </div>
    </div>
  );
}

function StatusDot(props: {
  status: "connected" | "disconnected" | "checking";
}) {
  const colors = {
    connected: "#4caf50",
    disconnected: "#f44336",
    checking: "#ff9800",
  };

  const labels = {
    connected: "✓",
    disconnected: "✗",
    checking: "⟳",
  };

  return (
    <span
      title={props.status}
      style={{
        display: "inline-block",
        width: "12px",
        height: "12px",
        borderRadius: "50%",
        backgroundColor: colors[props.status],
        marginLeft: "5px",
      }}
    >
      {labels[props.status]}
    </span>
  );
}

const styles = {
  errorContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    backgroundColor: "#f5f5f5",
  } as React.CSSProperties,
  errorBox: {
    backgroundColor: "white",
    padding: "40px",
    borderRadius: "8px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
    maxWidth: "600px",
    textAlign: "center" as const,
  },
  errorDetails: {
    backgroundColor: "#f5f5f5",
    padding: "15px",
    borderRadius: "4px",
    overflow: "auto",
    maxHeight: "300px",
    textAlign: "left" as const,
    fontSize: "12px",
    fontFamily: "monospace",
  },
  button: {
    marginTop: "20px",
    padding: "10px 20px",
    backgroundColor: "#2196F3",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "16px",
  },
  statusBar: {
    padding: "12px 20px",
    color: "white",
    boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
    position: "sticky" as const,
    top: 0,
    zIndex: 1000,
  },
  statusContent: {
    display: "flex",
    alignItems: "center",
    fontSize: "14px",
  },
};
