"use client";

// Listado de turnos que abre el modal de detalle al hacer clic en una fila.
//
// El servidor arma los datos ya filtrados por rol y los serializa acá. Este
// componente existe solo para manejar qué turno está abierto: es el mínimo de
// interactividad necesario para que la fila sea clickeable.

import { useState } from "react";
import { Card, EmptyState, PaymentBadge, StatusBadge } from "@/components/ui";
import {
  BookingModal,
  type BookingModalData,
  type BookingModalPerms,
} from "@/components/booking-modal";

export interface DiaDeTurnos {
  fecha: string;
  /** Ya formateada en la zona del negocio. */
  etiqueta: string;
  turnos: (BookingModalData & { hora: string })[];
}

export function AgendaLista({
  dias,
  perms,
  timezone,
  moneda,
  vacio,
}: {
  dias: DiaDeTurnos[];
  perms: BookingModalPerms;
  timezone: string;
  moneda: string;
  vacio: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState<BookingModalData | null>(null);

  if (dias.length === 0) return <EmptyState>{vacio}</EmptyState>;

  return (
    <>
      <div className="space-y-6">
        {dias.map((dia) => (
          <section key={dia.fecha}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              {dia.etiqueta}
            </h2>

            <Card padding={false} className="divide-y divide-line">
              {dia.turnos.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setAbierto(t)}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 text-left transition hover:bg-surface-2 sm:px-5"
                >
                  <span className="tabular w-14 shrink-0 text-sm font-medium text-fg-muted">
                    {t.hora}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {t.cliente.nombre}
                    </span>
                    <span className="block truncate text-sm text-fg-muted">
                      {t.servicio.nombre}
                      {perms.verImportes && ` · ${t.profesional.nombre}`}
                    </span>
                  </span>

                  <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    {perms.verImportes && (
                      <PaymentBadge status={t.paymentStatus} />
                    )}
                    <StatusBadge status={t.status} />
                  </span>

                  <span className="text-fg-subtle" aria-hidden>
                    ›
                  </span>
                </button>
              ))}
            </Card>
          </section>
        ))}
      </div>

      <BookingModal
        turno={abierto}
        perms={perms}
        timezone={timezone}
        moneda={moneda}
        onCerrar={() => setAbierto(null)}
      />
    </>
  );
}
