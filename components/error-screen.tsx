"use client";

// =============================================================================
// Pantalla de error con retorno automático al inicio.
//
// La idea: que un error nunca deje al usuario en un callejón sin salida. Se
// muestra qué pasó durante 10 segundos y después se vuelve solo a la portada.
//
// Dos cuidados que hacen la diferencia:
//   - La cuenta regresiva se puede cancelar. Si alguien está leyendo el detalle
//     o copiando el código para reportarlo, que la página se le escape de las
//     manos es peor que el error original.
//   - Al detalle técnico solo se le da lugar si existe. En producción Next
//     oculta el mensaje real y deja un `digest`: ese código es justamente lo
//     que sirve para encontrar el error en los logs del servidor.
// =============================================================================

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const SEGUNDOS = 10;

export interface ErrorScreenProps {
  titulo: string;
  descripcion: string;
  /** Mensaje técnico. Solo se muestra si el usuario lo despliega. */
  detalle?: string;
  /** Identificador del error en los logs del servidor. */
  digest?: string;
  /** Si se pasa, aparece un botón para volver a intentar. */
  onReintentar?: () => void;
  /** A dónde volver al terminar la cuenta. */
  destino?: string;
  /** Ya contraído con la preposición: "al inicio", "a tus turnos". */
  destinoLabel?: string;
}

export function ErrorScreen({
  titulo,
  descripcion,
  detalle,
  digest,
  onReintentar,
  destino = "/",
  destinoLabel = "al inicio",
}: ErrorScreenProps) {
  const router = useRouter();
  const [restante, setRestante] = useState(SEGUNDOS);
  const [enPausa, setEnPausa] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (enPausa) return;

    const t = setInterval(() => {
      setRestante((s) => {
        if (s <= 1) {
          clearInterval(t);
          router.push(destino);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(t);
  }, [enPausa, destino, router]);

  const copiar = useCallback(async () => {
    const texto = [titulo, detalle, digest && `digest: ${digest}`]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles: el detalle igual está visible en pantalla.
    }
  }, [titulo, detalle, digest]);

  const progreso = ((SEGUNDOS - restante) / SEGUNDOS) * 100;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <div className="animate-fade-in">
        <span
          className="grid h-12 w-12 place-items-center rounded-xl bg-danger-soft text-danger"
          aria-hidden
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            className="h-6 w-6"
          >
            <path d="M12 9v4M12 17h.01" />
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
        </span>

        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{titulo}</h1>
        <p className="mt-2 text-fg-muted">{descripcion}</p>

        {(detalle || digest) && (
          <details className="mt-5 rounded-xl border border-line bg-surface">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-fg-muted transition hover:text-fg">
              Ver detalle técnico
            </summary>
            <div className="border-t border-line px-4 py-3">
              {detalle && (
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-fg-muted">
                  {detalle}
                </pre>
              )}
              {digest && (
                <p className="mt-2 text-xs text-fg-subtle">
                  Código de referencia:{" "}
                  <code className="rounded bg-surface-2 px-1.5 py-0.5">
                    {digest}
                  </code>
                </p>
              )}
              <button
                type="button"
                onClick={copiar}
                className="mt-3 text-xs font-medium text-brand hover:underline"
              >
                {copiado ? "Copiado" : "Copiar para reportar"}
              </button>
            </div>
          </details>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-2">
          {onReintentar && (
            <button
              type="button"
              onClick={() => {
                setEnPausa(true);
                onReintentar();
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-fg transition hover:brightness-110"
            >
              Reintentar
            </button>
          )}
          <Link
            href={destino}
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium transition hover:bg-surface-2"
          >
            Ir {destinoLabel} ahora
          </Link>
        </div>

        {/* Cuenta regresiva */}
        <div className="mt-7 rounded-xl border border-line bg-surface-2 px-4 py-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-fg-muted">
              {enPausa ? (
                "Redirección cancelada. Podés quedarte el tiempo que necesites."
              ) : (
                <>
                  Volvemos {destinoLabel} en{" "}
                  <span className="tabular font-semibold text-fg">
                    {restante}
                  </span>{" "}
                  {restante === 1 ? "segundo" : "segundos"}
                </>
              )}
            </span>
            {!enPausa && (
              <button
                type="button"
                onClick={() => setEnPausa(true)}
                className="shrink-0 text-xs font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline"
              >
                Cancelar
              </button>
            )}
          </div>

          {!enPausa && (
            <div
              className="mt-2.5 h-1 overflow-hidden rounded-full bg-line"
              role="progressbar"
              aria-valuenow={restante}
              aria-valuemin={0}
              aria-valuemax={SEGUNDOS}
              aria-label="Tiempo restante hasta la redirección"
            >
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-1000 ease-linear"
                style={{ width: `${progreso}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
