"use client";

// =============================================================================
// Modo claro / oscuro.
//
// La elección se guarda en localStorage. Si nunca eligió nada, se sigue la
// preferencia del sistema operativo y se acompañan sus cambios en vivo.
// =============================================================================

import { useEffect, useState } from "react";

const CLAVE = "turnos-theme";

type Tema = "light" | "dark";

/** Lee el tema efectivo del DOM, que es lo que ya aplicó ThemeScript. */
function temaActual(): Tema {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  // Arranca en null para no renderizar un icono que después cambia: durante el
  // SSR no sabemos qué tema tiene el usuario, y adivinar produce un parpadeo.
  const [tema, setTema] = useState<Tema | null>(null);

  useEffect(() => {
    setTema(temaActual());

    // Si el usuario no eligió explícitamente, seguimos al sistema en vivo.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const alCambiar = (e: MediaQueryListEvent) => {
      if (localStorage.getItem(CLAVE)) return;
      const nuevo: Tema = e.matches ? "dark" : "light";
      document.documentElement.classList.toggle("dark", nuevo === "dark");
      setTema(nuevo);
    };
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, []);

  function alternar() {
    const nuevo: Tema = temaActual() === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", nuevo === "dark");
    try {
      localStorage.setItem(CLAVE, nuevo);
    } catch {
      // Modo incógnito con storage bloqueado: el tema igual cambia, solo que
      // no se recuerda. No es motivo para romper nada.
    }
    setTema(nuevo);
  }

  const esOscuro = tema === "dark";

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={esOscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={esOscuro ? "Modo claro" : "Modo oscuro"}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-fg-muted transition hover:bg-surface-2 hover:text-fg ${className}`}
    >
      {/* Reserva el espacio antes de saber el tema, para que el header no salte */}
      {tema === null ? (
        <span className="h-4 w-4" />
      ) : esOscuro ? (
        <SolIcon />
      ) : (
        <LunaIcon />
      )}
    </button>
  );
}

/**
 * Aplica el tema ANTES del primer pintado.
 *
 * Va inline en el <head>: si esperáramos a que hidrate React, el usuario con
 * modo oscuro vería un fogonazo blanco en cada carga. Es la única razón por la
 * que este script existe.
 */
export function ThemeScript() {
  const codigo = `
(function () {
  try {
    var guardado = localStorage.getItem("${CLAVE}");
    var oscuro = guardado
      ? guardado === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (oscuro) document.documentElement.classList.add("dark");
  } catch (e) {
    /* storage bloqueado: se queda en claro */
  }
})();`;

  return (
    <script
      dangerouslySetInnerHTML={{ __html: codigo }}
      suppressHydrationWarning
    />
  );
}

function SolIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      className="h-4 w-4"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function LunaIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
