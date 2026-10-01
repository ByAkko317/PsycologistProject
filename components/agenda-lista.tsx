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
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-surface-2 sm:gap-4 sm:px-5"
                >
                  <span className="tabular w-12 shrink-0 self-start pt-0.5 text-sm font-medium text-fg-muted sm:w-14 sm:self-center sm:pt-0">
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
                    {/* En mobile los estados van abajo: al lado le quitaban
                        todo el ancho al nombre del paciente. */}
                    <span className="mt-1.5 flex flex-wrap gap-1.5 sm:hidden">
                      <Estados turno={t} verImportes={perms.verImportes} />
                    </span>
                  </span>

                  <span className="hidden shrink-0 flex-wrap justify-end gap-1.5 sm:flex">
                    <Estados turno={t} verImportes={perms.verImportes} />
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

function Estados({
  turno,
  verImportes,
}: {
  turno: BookingModalData;
  verImportes: boolean;
}) {
  return (
    <>
      {verImportes && <PaymentBadge status={turno.paymentStatus} />}
      <StatusBadge status={turno.status} />
    </>
  );
}
