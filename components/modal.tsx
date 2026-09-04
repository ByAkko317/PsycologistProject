"use client";

// Diálogo modal accesible, sin librerías.
//
// Usa el elemento nativo <dialog>, que resuelve gratis tres cosas que a mano
// salen mal: el foco queda atrapado adentro, Escape cierra, y el fondo queda
// inerte para lectores de pantalla.

import { useEffect, useRef } from "react";

export function Modal({
  abierto,
  onCerrar,
  titulo,
  descripcion,
  children,
  ancho = "md",
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
  ancho?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;

    if (abierto && !d.open) {
      d.showModal();
      // El scroll del fondo se bloquea a mano: <dialog> no lo hace solo.
      document.body.style.overflow = "hidden";
    } else if (!abierto && d.open) {
      d.close();
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [abierto]);

  // Escape dispara el evento `cancel` del <dialog>; hay que avisarle al padre
  // para que su estado no quede diciendo que sigue abierto.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const alCancelar = (e: Event) => {
      e.preventDefault();
      onCerrar();
    };
    d.addEventListener("cancel", alCancelar);
    return () => d.removeEventListener("cancel", alCancelar);
  }, [onCerrar]);

  const max = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" }[ancho];

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-titulo"
      className={`w-[calc(100vw-2rem)] ${max} rounded-2xl border border-line bg-surface p-0 text-fg shadow-pop backdrop:bg-black/40 backdrop:backdrop-blur-sm`}
      // Click en el fondo cierra. Se compara el target con el propio dialog
      // porque el contenido está dentro de un hijo.
      onClick={(e) => {
        if (e.target === ref.current) onCerrar();
      }}
    >
      <div className="max-h-[85vh] overflow-y-auto">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-surface/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <h2 id="modal-titulo" className="font-semibold tracking-tight">
              {titulo}
            </h2>
            {descripcion && (
              <p className="mt-0.5 text-sm text-fg-muted">{descripcion}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg-muted transition hover:bg-surface-2 hover:text-fg"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="h-4 w-4"
              aria-hidden
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="px-5 py-5">{children}</div>
      </div>
    </dialog>
  );
}
