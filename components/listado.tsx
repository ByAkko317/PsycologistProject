"use client";

// Buscador y paginado compartidos por las vistas de turnos y pacientes.
//
// El estado vive en la URL, no en React. Así una búsqueda se puede compartir,
// guardar en favoritos, y volver con "atrás" sin perderla — y el servidor
// renderiza la página ya filtrada, sin un salto visible.

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

/** Reescribe la query string conservando lo que no se toca. */
function useQuery() {
  const pathname = usePathname();
  const params = useSearchParams();

  return useCallback(
    (cambios: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(cambios)) {
        if (v === undefined || v === "" || v === "todos") qs.delete(k);
        else qs.set(k, String(v));
      }
      // Cualquier cambio de filtro vuelve a la primera página: quedarse en la
      // 5 de un resultado que ahora tiene 2 es desorientador.
      if (!("pagina" in cambios)) qs.delete("pagina");
      const s = qs.toString();
      return `${pathname}${s ? `?${s}` : ""}`;
    },
    [params, pathname]
  );
}

export function Buscador({
  placeholder,
  ayuda,
}: {
  placeholder: string;
  ayuda?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const construir = useQuery();
  const [valor, setValor] = useState(params.get("q") ?? "");
  const [pendiente, iniciar] = useTransition();

  // Debounce: buscar en cada tecla dispara un render de servidor por letra.
  useEffect(() => {
    const actual = params.get("q") ?? "";
    if (valor === actual) return;

    const t = setTimeout(() => {
      iniciar(() => router.replace(construir({ q: valor }), { scroll: false }));
    }, 350);
    return () => clearTimeout(t);
  }, [valor, params, router, construir]);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="h-4 w-4"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </span>

      <input
        type="search"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-lg border border-line bg-surface py-2.5 pl-9 pr-9 text-sm text-fg placeholder:text-fg-subtle transition focus:border-brand"
      />

      {valor && (
        <button
          type="button"
          onClick={() => setValor("")}
          aria-label="Limpiar búsqueda"
          className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-fg-subtle transition hover:bg-surface-2 hover:text-fg"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="h-3.5 w-3.5"
            aria-hidden
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}

      {(ayuda || pendiente) && (
        <p className="mt-1.5 text-xs text-fg-subtle">
          {pendiente ? "Buscando…" : ayuda}
        </p>
      )}
    </div>
  );
}

/** Grupo de filtros que se reflejan en la URL. */
export function FiltroChips({
  nombre,
  opciones,
  actual,
}: {
  nombre: string;
  opciones: { value: string; label: string }[];
  actual: string;
}) {
  const construir = useQuery();

  return (
    <div className="flex flex-wrap gap-1.5">
      {opciones.map((o) => {
        const activo = actual === o.value;
        return (
          <Link
            key={o.value}
            href={construir({ [nombre]: o.value })}
            scroll={false}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              activo
                ? "border-brand bg-brand text-brand-fg"
                : "border-line bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Paginado con ventana deslizante, al estilo de un catálogo.
 *
 * Muestra a lo sumo 7 números alrededor de la página actual, con elipsis. Con
 * 200 páginas, listarlas todas no sirve a nadie.
 */
export function Paginado({
  pagina,
  paginas,
  total,
  etiqueta,
}: {
  pagina: number;
  paginas: number;
  total: number;
  etiqueta: string;
}) {
  const construir = useQuery();
  if (paginas <= 1) {
    return (
      <p className="text-sm text-fg-subtle">
        {total} {etiqueta}
        {total === 1 ? "" : "s"}
      </p>
    );
  }

  const numeros: (number | "…")[] = [];
  const ventana = 2;
  for (let i = 1; i <= paginas; i++) {
    const cerca = Math.abs(i - pagina) <= ventana;
    const extremo = i === 1 || i === paginas;
    if (cerca || extremo) numeros.push(i);
    else if (numeros.at(-1) !== "…") numeros.push("…");
  }

  const Flecha = ({
    hacia,
    disabled,
    label,
    children,
  }: {
    hacia: number;
    disabled: boolean;
    label: string;
    children: React.ReactNode;
  }) =>
    disabled ? (
      <span
        aria-hidden
        className="grid h-9 w-9 place-items-center rounded-lg text-fg-subtle opacity-40"
      >
        {children}
      </span>
    ) : (
      <Link
        href={construir({ pagina: hacia })}
        scroll={false}
        aria-label={label}
        className="grid h-9 w-9 place-items-center rounded-lg border border-line text-fg-muted transition hover:bg-surface-2 hover:text-fg"
      >
        {children}
      </Link>
    );

  return (
    <nav
      aria-label="Paginación"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-sm text-fg-subtle">
        {total} {etiqueta}
        {total === 1 ? "" : "s"} · página {pagina} de {paginas}
      </p>

      <div className="flex items-center gap-1">
        <Flecha hacia={pagina - 1} disabled={pagina <= 1} label="Anterior">
          ‹
        </Flecha>

        {numeros.map((n, i) =>
          n === "…" ? (
            <span key={`e${i}`} className="px-1 text-fg-subtle">
              …
            </span>
          ) : (
            <Link
              key={n}
              href={construir({ pagina: n })}
              scroll={false}
              aria-current={n === pagina ? "page" : undefined}
              className={`tabular grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm transition ${
                n === pagina
                  ? "bg-brand font-medium text-brand-fg"
                  : "border border-line text-fg-muted hover:bg-surface-2 hover:text-fg"
              }`}
            >
              {n}
            </Link>
          )
        )}

        <Flecha
          hacia={pagina + 1}
          disabled={pagina >= paginas}
          label="Siguiente"
        >
          ›
        </Flecha>
      </div>
    </nav>
  );
}
