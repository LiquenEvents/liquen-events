"use client";

import { useEffect } from "react";

/**
 * Global error boundary — catches failures in the root layout itself, which
 * the per-segment error.tsx cannot. It must render its own <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Structured client-side report; in production this is a JSON line.
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="pt-PT">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f0f0d",
          color: "#e8e6e0",
          fontFamily: "-apple-system, Segoe UI, Roboto, Arial, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 460, textAlign: "center" }}>
          <p style={{ letterSpacing: "0.4em", textTransform: "uppercase", fontSize: 10, opacity: 0.4 }}>
            Erro
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: "16px 0" }}>
            Algo correu mal.
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.7, opacity: 0.55, marginBottom: 28 }}>
            Pedimos desculpa pelo incómodo. Tente novamente — se o problema
            persistir, contacte-nos diretamente.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "14px 32px",
              background: "#4a7c59",
              color: "#f5f3ee",
              border: "none",
              borderRadius: 3,
              fontSize: 13,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
