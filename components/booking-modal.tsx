"use client";

// =============================================================================
// Modal de detalle de turno.
//
// Concentra todo lo que antes obligaba a ir a Airtable: ver el turno completo y
// cambiar su estado. Lo usan el profesional y la administración, con distintas
// acciones según sus capabilities.
//
// Las capabilities llegan como props desde el servidor. Este componente NO
// decide permisos: solo dibuja lo que le habilitan, y el endpoint vuelve a
// verificar. Esconder un botón no es una medida de seguridad.
// =============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Modal } from "@/components/modal";
import { Alert, Row, StatusBadge, PaymentBadge } from "@/components/ui";
import type { BookingStatus, PaymentStatus } from "@/lib/types";

export interface BookingModalData {
  id: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  startsAt: string;
  endsAt: string;
  amountTotal: number;
  amountPaid: number;
  notes?: string;
  cancellationReason?: string;
  createdAt: string;
  paymentId?: string;
  cliente: { id: string; nombre: string; email?: string; telefono?: string };
  servicio: { nombre: string; duracion: number };
  profesional: { nombre: string };
}

export interface BookingModalPerms {
  asistencia: boolean;
  pagos: boolean;
  verImportes: boolean;
  verPaciente: boolean;
}

const ASISTENCIA: { value: BookingStatus; label: string }[] = [
  { value: "confirmed", label: "Confirmado" },
  { value: "completed", label: "Asistió" },
  { value: "no_show", label: "Ausente" },
];

const PAGOS: { value: PaymentStatus; label: string }[] = [
  { value: "not_required", label: "Sin seña" },
  { value: "pending", label: "Pendiente" },
  { value: "paid", label: "Pagado" },
  { value: "refunded", label: "Reintegrado" },
  { value: "failed", label: "Fallido" },
];

export function BookingModal({
  turno,
  perms,
  timezone,
  moneda,
  onCerrar,
}: {
  turno: BookingModalData | null;
  perms: BookingModalPerms;
  timezone: string;
  moneda: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [montoCobrado, setMontoCobrado] = useState<string>("");

  if (!turno) return null;

  const money = (n: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: moneda || "ARS",
      maximumFractionDigits: 0,
    }).format(n);

  const fechaLarga = new Intl.DateTimeFormat("es-AR", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(turno.startsAt));

  async function aplicar(cambios: Record<string, unknown>, etiqueta: string) {
    setGuardando(etiqueta);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(`/api/bookings/${turno!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambios),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo actualizar");

      setOk("Cambio guardado.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setGuardando(null);
    }
  }

  const cancelado = turno.status === "cancelled";

  return (
    <Modal
      abierto={Boolean(turno)}
      onCerrar={onCerrar}
      titulo={turno.cliente.nombre}
      descripcion={`${turno.servicio.nombre} · ${fechaLarga}`}
      ancho="md"
    >
      <div className="space-y-5">
        {error && <Alert tone="danger">{error}</Alert>}
        {ok && <Alert tone="ok">{ok}</Alert>}

        {/* --- Estado actual --- */}
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={turno.status} />
          {perms.verImportes && <PaymentBadge status={turno.paymentStatus} />}
        </div>

        {/* --- Datos --- */}
        <dl className="text-sm">
          <Row term="Profesional">{turno.profesional.nombre}</Row>
          <Row term="Duración">{turno.servicio.duracion} min</Row>

          {turno.cliente.email && (
            <Row term="Email">
              <a
                href={`mailto:${turno.cliente.email}`}
                className="text-brand hover:underline"
              >
                {turno.cliente.email}
              </a>
            </Row>
          )}
          {turno.cliente.telefono && (
            <Row term="Teléfono">
              <a
                href={`tel:${turno.cliente.telefono}`}
                className="text-brand hover:underline"
              >
                {turno.cliente.telefono}
              </a>
            </Row>
          )}

          {perms.verImportes && (
            <>
              <Row term="Total">{money(turno.amountTotal)}</Row>
              <Row term="Cobrado" emphasis={turno.amountPaid > 0}>
                {money(turno.amountPaid)}
              </Row>
              {turno.paymentId && (
                <Row term="Pago">
                  <code className="text-xs text-fg-muted">
                    {turno.paymentId}
                  </code>
                </Row>
              )}
            </>
          )}
        </dl>

        {turno.notes && (
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">
              Comentario del paciente
            </p>
            <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-sm leading-relaxed text-fg-muted">
              {turno.notes}
            </p>
          </div>
        )}

        {cancelado && turno.cancellationReason && (
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">
              Motivo de cancelación
            </p>
            <p className="rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger">
              {turno.cancellationReason}
            </p>
          </div>
        )}

        {/* --- Asistencia --- */}
        {perms.asistencia && !cancelado && (
          <section className="border-t border-line pt-5">
            <p className="mb-2.5 text-sm font-medium">Asistencia</p>
            <div className="flex flex-wrap gap-2">
              {ASISTENCIA.map((o) => {
                const activo = turno.status === o.value;
                return (
                  <button
                    key={o.value}
                    onClick={() => aplicar({ status: o.value }, o.value)}
                    disabled={guardando !== null || activo}
                    aria-pressed={activo}
                    className={`rounded-lg border px-3.5 py-2 text-sm font-medium transition disabled:cursor-default ${
                      activo
                        ? "border-brand bg-brand text-brand-fg"
                        : "border-line hover:border-line-strong hover:bg-surface-2 disabled:opacity-50"
                    }`}
                  >
                    {guardando === o.value ? "…" : o.label}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* --- Pago: solo administración --- */}
        {perms.pagos && (
          <section className="border-t border-line pt-5">
            <p className="text-sm font-medium">Estado del pago</p>
            <p className="mb-2.5 mt-0.5 text-xs text-fg-subtle">
              Corregilo a mano cuando la realidad no coincida: cobro en
              efectivo, acreditación demorada, reintegro.
            </p>
            <div className="flex flex-wrap gap-2">
              {PAGOS.map((o) => {
                const activo = turno.paymentStatus === o.value;
                return (
                  <button
                    key={o.value}
                    onClick={() =>
                      aplicar(
                        {
                          paymentStatus: o.value,
                          // Marcar "pagado" sin importe deja el registro a
                          // medias: se completa con el total del turno.
                          ...(o.value === "paid" && turno.amountPaid === 0
                            ? { amountPaid: turno.amountTotal }
                            : {}),
                        },
                        `pago-${o.value}`
                      )
                    }
                    disabled={guardando !== null || activo}
                    aria-pressed={activo}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition disabled:cursor-default ${
                      activo
                        ? "border-brand bg-brand text-brand-fg"
                        : "border-line hover:border-line-strong hover:bg-surface-2 disabled:opacity-50"
                    }`}
                  >
                    {guardando === `pago-${o.value}` ? "…" : o.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="min-w-[10rem] flex-1">
                <label
                  htmlFor="monto-cobrado"
                  className="mb-1 block text-xs font-medium text-fg-muted"
                >
                  Monto cobrado
                </label>
                <input
                  id="monto-cobrado"
                  type="number"
                  min={0}
                  max={turno.amountTotal}
                  placeholder={String(turno.amountPaid)}
                  value={montoCobrado}
                  onChange={(e) => setMontoCobrado(e.target.value)}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                />
              </div>
              <button
                onClick={() =>
                  aplicar({ amountPaid: Number(montoCobrado) }, "monto")
                }
                disabled={guardando !== null || montoCobrado === ""}
                className="rounded-lg border border-line px-3 py-2 text-sm font-medium transition hover:bg-surface-2 disabled:opacity-40"
              >
                {guardando === "monto" ? "…" : "Guardar"}
              </button>
            </div>
          </section>
        )}

        {/* --- Salidas --- */}
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5 text-sm">
          {perms.verPaciente && (
            <Link
              href={`/pacientes/${turno.cliente.id}`}
              className="font-medium text-brand hover:underline"
            >
              Ver ficha del paciente →
            </Link>
          )}
          <span className="ml-auto text-xs text-fg-subtle">
            Reservado el{" "}
            {new Intl.DateTimeFormat("es-AR", {
              timeZone: timezone,
              day: "numeric",
              month: "short",
              year: "numeric",
            }).format(new Date(turno.createdAt))}
          </span>
        </div>
      </div>
    </Modal>
  );
}
