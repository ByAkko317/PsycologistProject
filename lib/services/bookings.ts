// =============================================================================
// Casos de uso de turnos.
// Orquesta base de datos + n8n + pagos. Los route handlers solo validan la
// entrada y llaman aca; asi la misma logica sirve para UI, API y cron.
// =============================================================================

import { db, getBookingDetail } from "@/lib/services/db";
import { bookingPayload, emitEvent } from "@/lib/services/n8n";
import { requireTenant } from "@/lib/tenant";
import type { Booking, BookingDetail, Tenant } from "@/lib/types";

export class BookingError extends Error {
  constructor(
    message: string,
    public code:
      | "SLOT_TAKEN"
      | "NOT_FOUND"
      | "TOO_LATE"
      | "INVALID"
      | "ALREADY_CANCELLED",
    public status = 400
  ) {
    super(message);
    this.name = "BookingError";
  }
}

export interface CreateBookingRequest {
  tenantSlug?: string;
  serviceId: string;
  professionalId: string;
  startsAt: string;
  client: { name: string; email?: string; phone?: string };
  notes?: string;
}

export interface CreateBookingResult {
  booking: Booking;
  detail: BookingDetail;
  /** URL del checkout de Mercado Pago, si el servicio pide senia. */
  checkoutUrl: string | null;
  /** Importe a pagar por adelantado. 0 = no requiere pago. */
  depositAmount: number;
}

/** Paso 6 del flujo: crear el turno (y disparar booking.created). */
export async function createBooking(
  input: CreateBookingRequest
): Promise<CreateBookingResult> {
  const tenant = await requireTenant(input.tenantSlug);

  if (!input.client?.name?.trim()) {
    throw new BookingError("Falta el nombre del cliente", "INVALID");
  }
  if (!input.client.email && !input.client.phone) {
    throw new BookingError(
      "Hace falta un email o un telefono de contacto",
      "INVALID"
    );
  }
  if (!input.startsAt || Number.isNaN(Date.parse(input.startsAt))) {
    throw new BookingError("Horario invalido", "INVALID");
  }

  const service = await db.getService(tenant.id, input.serviceId);
  if (!service) throw new BookingError("Servicio inexistente", "NOT_FOUND", 404);

  const professional = await db.getProfessional(
    tenant.id,
    input.professionalId
  );
  if (!professional) {
    throw new BookingError("Profesional inexistente", "NOT_FOUND", 404);
  }
  if (!professional.serviceIds.includes(service.id)) {
    throw new BookingError(
      "Ese profesional no presta el servicio elegido",
      "INVALID"
    );
  }

  const depositAmount = calcDeposit(service.price, service.depositPercent);

  let booking: Booking;
  try {
    booking = await db.createBooking({
      tenantId: tenant.id,
      serviceId: service.id,
      professionalId: professional.id,
      startsAt: input.startsAt,
      client: input.client,
      notes: input.notes,
      requiresPayment: depositAmount > 0,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "SLOT_TAKEN") {
      throw new BookingError(
        "Ese horario se acaba de ocupar. Elegí otro, por favor.",
        "SLOT_TAKEN",
        409
      );
    }
    throw error;
  }

  const detail = await getBookingDetail(tenant.id, booking);

  // Paso 8: avisamos a n8n. Si falla, el turno igual queda creado.
  await emitEvent("booking.created", tenant, {
    ...bookingPayload(detail),
    payment: { required: depositAmount > 0, depositAmount },
  });

  return { booking, detail, checkoutUrl: null, depositAmount };
}

/** Paso 10: cancelar respetando la politica del negocio. */
export async function cancelBooking(
  token: string,
  reason?: string
): Promise<BookingDetail> {
  const { tenant, booking } = await loadByToken(token);

  if (booking.status === "cancelled") {
    throw new BookingError("El turno ya estaba cancelado", "ALREADY_CANCELLED");
  }
  assertWithinPolicy(booking, tenant);

  const updated = await db.updateBooking(tenant.id, booking.id, {
    status: "cancelled",
    cancelledAt: new Date().toISOString(),
    cancellationReason: reason?.slice(0, 500),
  });

  const detail = await getBookingDetail(tenant.id, updated);
  await emitEvent("booking.cancelled", tenant, bookingPayload(detail));
  return detail;
}

/** Paso 10: reprogramar a un horario nuevo del mismo profesional. */
export async function rescheduleBooking(
  token: string,
  newStartsAt: string
): Promise<BookingDetail> {
  const { tenant, booking } = await loadByToken(token);

  if (booking.status === "cancelled") {
    throw new BookingError(
      "No se puede reprogramar un turno cancelado",
      "ALREADY_CANCELLED"
    );
  }
  assertWithinPolicy(booking, tenant);

  if (!newStartsAt || Number.isNaN(Date.parse(newStartsAt))) {
    throw new BookingError("Horario invalido", "INVALID");
  }

  const slots = await db.getAvailability({
    tenantId: tenant.id,
    serviceId: booking.serviceId,
    professionalId: booking.professionalId,
    dateKey: newStartsAt.slice(0, 10),
  });
  const slot = slots.find((s) => s.startsAt === newStartsAt);
  if (!slot || !slot.available) {
    throw new BookingError("Ese horario ya no esta disponible", "SLOT_TAKEN", 409);
  }

  const previousStartsAt = booking.startsAt;
  const updated = await db.updateBooking(tenant.id, booking.id, {
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
  });

  const detail = await getBookingDetail(tenant.id, updated);
  await emitEvent("booking.rescheduled", tenant, {
    ...bookingPayload(detail),
    previousStartsAt,
  });
  return detail;
}

/** Paso 11: el empleado marca el resultado del turno. */
export async function setAttendance(
  tenantSlug: string,
  bookingId: string,
  status: "completed" | "no_show" | "confirmed"
): Promise<Booking> {
  const tenant = await requireTenant(tenantSlug);
  const booking = await db.getBooking(tenant.id, bookingId);
  if (!booking) throw new BookingError("Turno inexistente", "NOT_FOUND", 404);
  return db.updateBooking(tenant.id, bookingId, { status });
}

// --- Helpers -----------------------------------------------------------------

export function calcDeposit(price: number, depositPercent: number): number {
  if (!depositPercent || depositPercent <= 0) return 0;
  return Math.round((price * Math.min(depositPercent, 100)) / 100);
}

async function loadByToken(token: string) {
  if (!token?.trim()) throw new BookingError("Falta el token", "INVALID");

  const booking = await db.getBookingByToken(token.trim());
  if (!booking) throw new BookingError("Turno inexistente", "NOT_FOUND", 404);

  const tenant = await db.getTenant(booking.tenantId);
  if (!tenant) throw new BookingError("Tenant inexistente", "NOT_FOUND", 404);

  return { tenant, booking };
}

/** La politica de cancelacion se expresa en horas de anticipacion. */
function assertWithinPolicy(booking: Booking, tenant: Tenant): void {
  const limite =
    new Date(booking.startsAt).getTime() -
    tenant.cancellationHours * 3_600_000;

  if (Date.now() > limite) {
    throw new BookingError(
      `Los cambios se aceptan hasta ${tenant.cancellationHours} horas antes del turno. ` +
        `Comunicate con ${tenant.name} para reprogramar.`,
      "TOO_LATE",
      409
    );
  }
}

/** True si el turno todavia admite cambios del cliente. */
export function canSelfManage(booking: Booking, tenant: Tenant): boolean {
  if (booking.status === "cancelled") return false;
  return (
    Date.now() <
    new Date(booking.startsAt).getTime() - tenant.cancellationHours * 3_600_000
  );
}
