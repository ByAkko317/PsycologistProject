// Traduce el modelo de dominio a lo que consumen los componentes cliente.
//
// Existe para que la decision de "que datos cruzan al navegador" este en un
// solo lugar. Sin esto, cada pagina serializa a mano y tarde o temprano una
// manda de mas: por ejemplo el publicToken del turno, que da acceso sin login.

import type { BookingDetail, Tenant } from "@/lib/types";
import type { BookingModalData } from "@/components/booking-modal";
import { toTimeLabel } from "@/lib/utils/dates";

/**
 * Turno listo para el modal.
 *
 * Ojo con lo que NO viaja: publicToken (es una credencial) ni tenantId.
 * El importe se incluye siempre, pero el componente solo lo muestra si la
 * capability lo habilita — y el endpoint tampoco deja cambiarlo sin permiso.
 */
export function paraModal(
  b: BookingDetail,
  tenant: Tenant
): BookingModalData & { hora: string } {
  return {
    id: b.id,
    status: b.status,
    paymentStatus: b.paymentStatus,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    amountTotal: b.amountTotal,
    amountPaid: b.amountPaid,
    notes: b.notes,
    cancellationReason: b.cancellationReason,
    createdAt: b.createdAt,
    paymentId: b.paymentId,
    cliente: {
      id: b.clientId,
      nombre: b.client?.name ?? "Paciente",
      email: b.client?.email,
      telefono: b.client?.phone,
    },
    servicio: {
      nombre: b.service?.name ?? "Servicio",
      duracion: b.service?.durationMinutes ?? 0,
    },
    profesional: { nombre: b.professional?.name ?? "Sin asignar" },
    hora: toTimeLabel(b.startsAt, tenant.timezone),
  };
}

/** Etiqueta de dia, en la zona del negocio. Ej: "lunes, 18 de agosto". */
export function etiquetaDeDia(fecha: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${fecha}T12:00:00Z`));
}
