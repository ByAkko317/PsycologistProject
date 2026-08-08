// =============================================================================
// Calculo de disponibilidad real (paso 3 del flujo).
// Cruza el horario laboral del negocio/profesional con los turnos ya ocupados.
// Es una funcion pura: la reusan Airtable, Firebase y el proveedor mock.
// =============================================================================

import type {
  AvailabilitySlot,
  Booking,
  Professional,
  Service,
  Tenant,
} from "@/lib/types";
import {
  addMinutesToTime,
  minutesBetween,
  toTimeLabel,
  wallTimeToISO,
  weekdayOf,
} from "@/lib/utils/dates";

/** Estados que efectivamente ocupan el horario. */
const BLOCKING_STATUSES = new Set(["pending_payment", "confirmed", "completed"]);

export interface AvailabilityArgs {
  tenant: Tenant;
  service: Service;
  professional: Professional;
  /** Fecha "YYYY-MM-DD" en la timezone del tenant. */
  dateKey: string;
  /** Turnos ya existentes de ese profesional (cualquier fecha). */
  existingBookings: Booking[];
  /** Instante actual; inyectable para poder testear. */
  now?: Date;
  /** Anticipacion minima para reservar, en minutos. */
  minNoticeMinutes?: number;
}

export function computeAvailability({
  tenant,
  service,
  professional,
  dateKey,
  existingBookings,
  now = new Date(),
  minNoticeMinutes = 60,
}: AvailabilityArgs): AvailabilitySlot[] {
  const weekday = weekdayOf(dateKey);
  const hours = professional.workingHours ?? tenant.businessHours;
  const ranges = hours[weekday] ?? [];
  if (ranges.length === 0) return [];

  const step = tenant.slotIntervalMinutes || 30;
  const duration = service.durationMinutes;

  // Intervalos ocupados de ese profesional, en milisegundos.
  const busy = existingBookings
    .filter(
      (b) =>
        b.professionalId === professional.id && BLOCKING_STATUSES.has(b.status)
    )
    .map((b) => ({
      from: new Date(b.startsAt).getTime(),
      to: new Date(b.endsAt).getTime(),
    }));

  const earliest = now.getTime() + minNoticeMinutes * 60_000;
  const slots: AvailabilitySlot[] = [];

  for (const range of ranges) {
    const span = minutesBetween(range.start, range.end);
    if (span < duration) continue;

    for (let offset = 0; offset + duration <= span; offset += step) {
      const startTime = addMinutesToTime(range.start, offset);
      const endTime = addMinutesToTime(range.start, offset + duration);

      const startsAt = wallTimeToISO(dateKey, startTime, tenant.timezone);
      const endsAt = wallTimeToISO(dateKey, endTime, tenant.timezone);

      const startMs = new Date(startsAt).getTime();
      const endMs = new Date(endsAt).getTime();

      const overlaps = busy.some((b) => startMs < b.to && endMs > b.from);
      const tooSoon = startMs < earliest;

      slots.push({
        startsAt,
        endsAt,
        label: toTimeLabel(startsAt, tenant.timezone),
        available: !overlaps && !tooSoon,
      });
    }
  }

  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/**
 * Verifica que un horario puntual siga libre. Se llama justo antes de crear el
 * turno para evitar que dos clientes reserven el mismo slot en paralelo.
 */
export function isSlotStillFree(
  startsAt: string,
  endsAt: string,
  professionalId: string,
  existingBookings: Booking[]
): boolean {
  const startMs = new Date(startsAt).getTime();
  const endMs = new Date(endsAt).getTime();

  return !existingBookings.some(
    (b) =>
      b.professionalId === professionalId &&
      BLOCKING_STATUSES.has(b.status) &&
      startMs < new Date(b.endsAt).getTime() &&
      endMs > new Date(b.startsAt).getTime()
  );
}
