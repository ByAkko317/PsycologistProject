"use client";

// Ultima red de seguridad: se usa cuando el error ocurre en el layout raiz, es
// decir cuando ni siquiera app/error.tsx puede montarse. Por eso este archivo
// tiene que renderizar <html> y <body> propios, y no puede depender de los
// estilos de la app: si globals.css es lo que fallo, Tailwind no esta cargado.
// De ahi que todo vaya en estilos inline.

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app:global-error]", error);
  }, [error]);

  useEffect(() => {
    const t = setTimeout(() => {
      window.location.href = "/";
    }, 10_000);
    return () => clearTimeout(t);
  }, []);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: "#f8fafc",
          color: "#0f172a",
        }}
      >
        <div style={{ maxWidth: 460 }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px", fontWeight: 600 }}>
            La aplicación no pudo cargar
          </h1>
          <p style={{ margin: "0 0 20px", color: "#475569", lineHeight: 1.6 }}>
            Ocurrió un error inesperado. Te llevamos al inicio en unos segundos.
          </p>
          {error.digest && (
            <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 20px" }}>
              Código de referencia: <code>{error.digest}</code>
            </p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={reset}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: 0,
                background: "#4f46e5",
                color: "#fff",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>
            <a
              href="/"
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                background: "#fff",
                color: "#0f172a",
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Ir al inicio
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
