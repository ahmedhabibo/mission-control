"use client";

import { Component, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Arena ErrorBoundary caught:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "2rem",
            background: "#0a0a1a",
            color: "#e2e8f0",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div
            style={{
              fontSize: "3rem",
              marginBottom: "1rem",
              animation: "pulse 1.5s infinite",
            }}
          >
            ⚠️
          </div>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
            Arena Crashed
          </h1>
          <p style={{ color: "#94a3b8", marginBottom: "1.5rem", maxWidth: "500px" }}>
            The 3D scene encountered an error. Check the console for details.
          </p>
          <details
            style={{
              textAlign: "left",
              maxWidth: "600px",
              background: "#1a1a2e",
              padding: "1rem",
              borderRadius: "0.5rem",
              border: "1px solid #334155",
            }}
          >
            <summary style={{ cursor: "pointer", color: "#f59e0b" }}>
              Error Details
            </summary>
            <pre
              style={{
                marginTop: "0.5rem",
                fontSize: "0.75rem",
                overflow: "auto",
                color: "#fca5a5",
              }}
            >
              {this.state.error?.message}
              {this.state.errorInfo?.componentStack
                ? "\n\n" + this.state.errorInfo.componentStack
                : ""}
            </pre>
          </details>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: "1.5rem",
              padding: "0.75rem 1.5rem",
              background: "#6366f1",
              color: "white",
              border: "none",
              borderRadius: "0.5rem",
              fontSize: "1rem",
              cursor: "pointer",
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}