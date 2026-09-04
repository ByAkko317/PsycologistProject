"use client";

// Notas clínicas de un paciente: escritura y listado con marca de tiempo.
//
// Las notas son inmutables a propósito: no se editan ni se borran. Una historia
// clínica que se puede reescribir sin dejar rastro no sirve como registro, y en
// salud eso importa más que la comodidad de corregir un typo.

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Alert, Card } from "@/components/ui";
import { crearNota, type NotaState } from "@/app/pacientes/[id]/actions";

const inicial: NotaState = {};

export interface NotaVisible {
  id: string;
  body: string;
  autor: string;
  /** Ya formateada en la zona del negocio. */
  cuando: string;
  /** True si la escribió quien está mirando. */
  esMia: boolean;
}

function Boton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg transition hover:brightness-110 disabled:opacity-50"
    >
      {pending ? "Guardando…" : "Guardar nota"}
    </button>
  );
}

export function Notas({
  clientId,
  notas,
  puedeEscribir,
  ocultas,
  soyAdmin,
}: {
  clientId: string;
  notas: NotaVisible[];
  puedeEscribir: boolean;
  ocultas: number;
  soyAdmin: boolean;
}) {
  const [estado, accion] = useFormState(crearNota, inicial);
  const form = useRef<HTMLFormElement>(null);

  // Limpiar el textarea al guardar. Si no, el texto queda y da la impresión de
  // que no se envió, y termina duplicándose.
  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado.ok]);

  return (
    <div className="space-y-5">
      {puedeEscribir && (
        <Card>
          <form ref={form} action={accion} className="space-y-3">
            <input type="hidden" name="clientId" value={clientId} />

            <div>
              <label htmlFor="nota" className="mb-1.5 block text-sm font-medium">
                Nueva nota
              </label>
              <textarea
                id="nota"
                name="body"
                rows={4}
                required
                minLength={2}
                maxLength={5000}
                placeholder="Evolución, observaciones, acuerdos de la sesión…"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm leading-relaxed text-fg placeholder:text-fg-subtle transition focus:border-brand"
              />
            </div>

            {estado.error && <Alert tone="danger">{estado.error}</Alert>}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-fg-subtle">
                Queda firmada con tu nombre y la fecha. No se puede editar ni
                borrar después.
              </p>
              <Boton />
            </div>
          </form>
        </Card>
      )}

      {ocultas > 0 && (
        <Alert tone="info">
          Hay {ocultas} nota{ocultas === 1 ? "" : "s"} de{" "}
          {ocultas === 1 ? "otro profesional" : "otros profesionales"} que no
          {ocultas === 1 ? " se muestra" : " se muestran"}. Cada profesional lee
          solo las suyas.
        </Alert>
      )}

      {notas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-8 text-center text-sm text-fg-muted">
          {puedeEscribir
            ? "Todavía no hay notas de este paciente."
            : "No hay notas visibles para tu usuario."}
        </p>
      ) : (
        <ol className="space-y-3">
          {notas.map((n) => (
            <li key={n.id}>
              <Card>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">
                    {n.autor}
                    {n.esMia && (
                      <span className="ml-2 rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-normal text-brand">
                        vos
                      </span>
                    )}
                    {soyAdmin && !n.esMia && (
                      <span className="ml-2 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-normal text-fg-muted">
                        otro profesional
                      </span>
                    )}
                  </span>
                  <time className="text-xs text-fg-subtle">{n.cuando}</time>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg-muted">
                  {n.body}
                </p>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
