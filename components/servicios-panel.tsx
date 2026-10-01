"use client";

// Catálogo de servicios del panel: acordeón para editar, pop-up para crear y
// borrado con confirmación.
//
// El servidor manda los datos ya armados, con la cantidad de turnos de cada
// servicio. Acá solo vive qué está abierto y qué se está borrando.

import { useState } from "react";
import { useFormStatus } from "react-dom";
import {
  eliminarServicio,
  guardarServicio,
  restaurarServicio,
  type ResultadoServicio,
} from "@/app/admin/actions";
import { Modal } from "@/components/modal";
import { Alert, Button, Card, EmptyState, Field, inputClass } from "@/components/ui";
import type { Service } from "@/lib/types";

export interface ServicioVista extends Service {
  /** Turnos que lo referencian. Decide si se borra o se archiva. */
  turnos: number;
}

interface Profesional {
  id: string;
  name: string;
}

type Aviso = { tono: "ok" | "danger"; texto: string };

/**
 * Corre una server action y traduce un error inesperado a un mensaje. Lo que
 * tira el servidor (Airtable caído, un campo que falta) en producción llega
 * sin detalle, así que se manda a mirar la terminal, que es donde está.
 */
async function correr(
  accion: () => Promise<ResultadoServicio>
): Promise<ResultadoServicio> {
  try {
    return await accion();
  } catch {
    return {
      ok: false,
      error: "No se pudo completar. El detalle quedó en la terminal del servidor.",
    };
  }
}

export function ServiciosPanel({
  servicios,
  archivados,
  profesionales,
}: {
  servicios: ServicioVista[];
  archivados: ServicioVista[];
  profesionales: Profesional[];
}) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [creando, setCreando] = useState(false);
  const [borrando, setBorrando] = useState<ServicioVista | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const alternar = (id: string) =>
    setAbiertos((prev) => {
      const sig = new Set(prev);
      if (sig.has(id)) sig.delete(id);
      else sig.add(id);
      return sig;
    });

  const avisar = (r: ResultadoServicio) =>
    setAviso(r.ok ? { tono: "ok", texto: r.mensaje } : { tono: "danger", texto: r.error });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Servicios</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Lo que ve el cliente en el paso 1 de la reserva. La seña define si
            el turno pasa por Mercado Pago.
          </p>
        </div>
        <Button
          onClick={() => {
            setAviso(null);
            setCreando(true);
          }}
          className="w-full sm:w-auto"
        >
          <IconoMas />
          Nuevo servicio
        </Button>
      </div>

      {aviso && (
        <div className="flex items-start gap-2">
          <Alert tone={aviso.tono} className="flex-1">
            {aviso.texto}
          </Alert>
          <button
            type="button"
            onClick={() => setAviso(null)}
            aria-label="Cerrar aviso"
            className="mt-2 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-fg-subtle transition hover:bg-surface-2 hover:text-fg"
          >
            <IconoCerrar />
          </button>
        </div>
      )}

      {servicios.length === 0 ? (
        <EmptyState>
          Todavía no hay servicios. Creá el primero con{" "}
          <span className="font-medium text-fg">Nuevo servicio</span>.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {servicios.map((s) => (
            <ServicioItem
              key={s.id}
              servicio={s}
              profesionales={profesionales}
              abierto={abiertos.has(s.id)}
              onAlternar={() => alternar(s.id)}
              onBorrar={() => {
                setAviso(null);
                setBorrando(s);
              }}
            />
          ))}
        </div>
      )}

      {archivados.length > 0 && (
        <Archivados servicios={archivados} onResultado={avisar} />
      )}

      <Modal
        abierto={creando}
        onCerrar={() => setCreando(false)}
        titulo="Nuevo servicio"
        descripcion="Si lo dejás visible, aparece en el portal apenas lo crees."
        ancho="lg"
      >
        {/* Se monta solo abierto: cada alta arranca con el formulario vacío. */}
        {creando && (
          <ServicioForm
            profesionales={profesionales}
            onCancelar={() => setCreando(false)}
            onGuardado={(r) => {
              setCreando(false);
              avisar(r);
            }}
          />
        )}
      </Modal>

      <ConfirmarBorrado
        servicio={borrando}
        onCerrar={() => setBorrando(null)}
        onHecho={(r) => {
          setBorrando(null);
          avisar(r);
        }}
      />
    </div>
  );
}

// --- Item del acordeón -------------------------------------------------------

function ServicioItem({
  servicio: s,
  profesionales,
  abierto,
  onAlternar,
  onBorrar,
}: {
  servicio: ServicioVista;
  profesionales: Profesional[];
  abierto: boolean;
  onAlternar: () => void;
  onBorrar: () => void;
}) {
  const [resultado, setResultado] = useState<ResultadoServicio | null>(null);
  const panelId = `servicio-${s.id}`;

  // Cambia cuando el servidor devuelve datos nuevos. Como `key` del form, lo
  // vuelve a montar con los valores guardados en vez de los que quedaron
  // escritos en los inputs.
  const version = [
    s.name,
    s.description,
    s.durationMinutes,
    s.price,
    s.depositPercent,
    s.active,
    s.professionalIds.join(","),
  ].join("|");

  return (
    <Card padding={false} className="overflow-hidden">
      <div className="flex items-center gap-1 pr-2 sm:pr-3">
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={abierto}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-left transition hover:bg-surface-2 sm:px-5"
        >
          <span
            className={`flex shrink-0 text-fg-subtle transition-transform ${abierto ? "rotate-90" : ""}`}
            aria-hidden
          >
            <IconoChevron />
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
          {!s.active && (
            <span className="shrink-0 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-fg-muted">
              Oculto
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onBorrar}
          aria-label={`Eliminar ${s.name}`}
          title="Eliminar"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-fg-subtle transition hover:bg-danger-soft hover:text-danger"
        >
          <IconoTacho />
        </button>
      </div>

      {/* `hidden` y no desmontar: si se cierra sin guardar, lo escrito sigue
          ahí al volver a abrir. */}
      <div
        id={panelId}
        hidden={!abierto}
        className="border-t border-line px-4 py-5 sm:px-5"
      >
        <ServicioForm
          key={version}
          servicio={s}
          profesionales={profesionales}
          onBorrar={onBorrar}
          onGuardado={setResultado}
          resultado={resultado}
        />
      </div>
    </Card>
  );
}

// --- Formulario (editar y crear) ---------------------------------------------

function ServicioForm({
  servicio,
  profesionales,
  onGuardado,
  onCancelar,
  onBorrar,
  resultado,
}: {
  /** Sin servicio, es un alta. */
  servicio?: ServicioVista;
  profesionales: Profesional[];
  onGuardado: (r: ResultadoServicio) => void;
  onCancelar?: () => void;
  onBorrar?: () => void;
  resultado?: ResultadoServicio | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const s = servicio;
  const prefijo = s?.id ?? "nuevo";

  return (
    <form
      action={async (fd) => {
        setError(null);
        const r = await correr(() => guardarServicio(fd));
        // En el alta, el error se muestra acá: el pop-up sigue abierto.
        if (!r.ok && !s) setError(r.error);
        else onGuardado(r);
      }}
      className="space-y-4"
    >
      {s && <input type="hidden" name="id" value={s.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" htmlFor={`${prefijo}-name`} required>
          <input
            id={`${prefijo}-name`}
            name="name"
            required
            defaultValue={s?.name ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Duración (min)" htmlFor={`${prefijo}-dur`}>
          <input
            id={`${prefijo}-dur`}
            name="durationMinutes"
            type="number"
            min={5}
            step={5}
            inputMode="numeric"
            defaultValue={String(s?.durationMinutes ?? 50)}
            className={inputClass}
          />
        </Field>
        <Field label="Precio" htmlFor={`${prefijo}-price`}>
          <input
            id={`${prefijo}-price`}
            name="price"
            type="number"
            min={0}
            inputMode="decimal"
            defaultValue={String(s?.price ?? 0)}
            className={inputClass}
          />
        </Field>
        <Field
          label="Seña (%)"
          htmlFor={`${prefijo}-dep`}
          hint="0 = se paga en el consultorio"
        >
          <input
            id={`${prefijo}-dep`}
            name="depositPercent"
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            defaultValue={String(s?.depositPercent ?? 0)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Descripción" htmlFor={`${prefijo}-desc`}>
        <textarea
          id={`${prefijo}-desc`}
          name="description"
          rows={2}
          defaultValue={s?.description ?? ""}
          className={inputClass}
        />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">
          Profesionales habilitados
        </legend>
        {profesionales.length === 0 ? (
          <p className="text-sm text-fg-muted">
            No hay profesionales cargados todavía.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {profesionales.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  name="professionalIds"
                  value={p.id}
                  defaultChecked={s?.professionalIds.includes(p.id) ?? false}
                  className="accent-brand"
                />
                {p.name}
              </label>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-xs text-fg-subtle">
          Sin ninguno, el servicio no se puede reservar.
        </p>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={s?.active ?? true}
          className="accent-brand"
        />
        Visible en el portal de reservas
      </label>

      {error && <Alert tone="danger">{error}</Alert>}
      {resultado && (
        <p
          role="status"
          className={`text-sm ${resultado.ok ? "text-ok" : "text-danger"}`}
        >
          {resultado.ok ? resultado.mensaje : resultado.error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        {onBorrar ? (
          <button
            type="button"
            onClick={onBorrar}
            className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-danger transition hover:bg-danger-soft"
          >
            <IconoTacho />
            Eliminar servicio
          </button>
        ) : (
          <span className="hidden sm:block" />
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {onCancelar && (
            <Button type="button" variante="secondary" onClick={onCancelar}>
              Cancelar
            </Button>
          )}
          <BotonEnviar>{s ? "Guardar cambios" : "Crear servicio"}</BotonEnviar>
        </div>
      </div>
    </form>
  );
}

function BotonEnviar({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando…" : children}
    </Button>
  );
}

// --- Borrado -----------------------------------------------------------------

function ConfirmarBorrado({
  servicio,
  onCerrar,
  onHecho,
}: {
  servicio: ServicioVista | null;
  onCerrar: () => void;
  onHecho: (r: ResultadoServicio) => void;
}) {
  const [pendiente, setPendiente] = useState(false);
  const conTurnos = (servicio?.turnos ?? 0) > 0;

  return (
    <Modal
      abierto={servicio !== null}
      onCerrar={() => !pendiente && onCerrar()}
      titulo="¿Eliminar servicio?"
      ancho="sm"
    >
      {servicio && (
        <div className="space-y-4 text-sm">
          {conTurnos ? (
            <>
              <p>
                <span className="font-medium">{servicio.name}</span> tiene{" "}
                {servicio.turnos} turno{servicio.turnos === 1 ? "" : "s"} en el
                historial.
              </p>
              <p className="text-fg-muted">
                Para que esos turnos no queden sin servicio, no se borra de
                Airtable: se <span className="font-medium text-fg">archiva</span>.
                Desaparece del panel y del portal, y lo podés restaurar desde
                &quot;Archivados&quot;.
              </p>
            </>
          ) : (
            <>
              <p>
                <span className="font-medium">{servicio.name}</span> no tiene
                turnos.
              </p>
              <p className="text-fg-muted">
                Se borra definitivamente, también de Airtable. No se puede
                deshacer.
              </p>
            </>
          )}

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variante="secondary"
              onClick={onCerrar}
              disabled={pendiente}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variante="danger"
              disabled={pendiente}
              onClick={async () => {
                setPendiente(true);
                const r = await correr(() => eliminarServicio(servicio.id));
                setPendiente(false);
                onHecho(r);
              }}
            >
              {pendiente ? "Eliminando…" : conTurnos ? "Archivar" : "Eliminar"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Archivados({
  servicios,
  onResultado,
}: {
  servicios: ServicioVista[];
  onResultado: (r: ResultadoServicio) => void;
}) {
  const [restaurando, setRestaurando] = useState<string | null>(null);

  return (
    <details className="group rounded-xl border border-dashed border-line-strong">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm text-fg-muted sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex transition-transform group-open:rotate-90" aria-hidden>
          <IconoChevron />
        </span>
        Archivados ({servicios.length})
        <span className="ml-auto hidden text-xs text-fg-subtle sm:inline">
          Eliminados con turnos en el historial
        </span>
      </summary>

      <ul className="divide-y divide-line border-t border-line">
        {servicios.map((s) => (
          <li
            key={s.id}
            className="flex items-center gap-3 px-4 py-3 sm:px-5"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{s.name}</span>
              <span className="block text-xs text-fg-subtle">
                {s.turnos} turno{s.turnos === 1 ? "" : "s"}
              </span>
            </span>
            <Button
              type="button"
              variante="secondary"
              tamanio="sm"
              disabled={restaurando !== null}
              onClick={async () => {
                setRestaurando(s.id);
                const r = await correr(() => restaurarServicio(s.id));
                setRestaurando(null);
                onResultado(r);
              }}
            >
              {restaurando === s.id ? "Restaurando…" : "Restaurar"}
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}

// --- Iconos ------------------------------------------------------------------

function Svg({ children, className = "h-4 w-4" }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

const IconoChevron = () => (
  <Svg>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);
const IconoMas = () => (
  <Svg>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
const IconoCerrar = () => (
  <Svg className="h-3.5 w-3.5">
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);
const IconoTacho = () => (
  <Svg>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
  </Svg>
);
