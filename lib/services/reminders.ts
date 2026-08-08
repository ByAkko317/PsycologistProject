// =============================================================================
// Recordatorio de 24hs (paso 9 del flujo).
//
// Se soportan los dos modelos de disparo; el equipo elige uno:
//
//   A) PULL  — un Cron dentro de n8n consulta GET /api/n8n/bookings?window=24h
//              y despues marca cada turno con action=reminder_sent.
//              Es el modelo del workflow 05-reminder-24h.json.
//
//   B) PUSH  — un cron de la app (Vercel Cron) llama a /api/cron/reminders y
//              la app emite booking.reminder_24h hacia n8n, uno por turno.
//              Es el modelo que describe el PDF.
//
// Los dos usan la misma ventana y el mismo campo reminderSentAt, asi que no se
// pisan: si un turno ya fue avisado, el otro camino lo saltea.
// =============================================================================

import { db, expandBookings } from "@/lib/services/db";
import { bookingPayload, emitEvent } from "@/lib/services/n8n";
import type { BookingDetail, Tenant } from "@/lib/types";

/**
 * Turnos que ya entraron en la ventana de aviso y todavia no fueron avisados.
 *
 * Se usa una ventana de ANTICIPACION (`startsAt <= ahora + windowHours`), no
 * una centrada en las 24hs. La diferencia importa: con una ventana centrada, si
 * el cron pierde una corrida el recordatorio no sale nunca. Asi, el turno queda
 * elegible hasta que efectivamente se avisa, y `reminderSentAt` garantiza que
 * se mande una sola vez.
 *
 * `minLeadHours` evita mandar un "recordatorio" de algo que empieza en 20
 * minutos: por debajo de ese umbral el aviso ya no aporta y puede confundir.
 */
export async function findDueReminders(
  tenant: Tenant,
  windowHours = 24,
  minLeadHours = 2,
  now: Date = new Date()
): Promise<BookingDetail[]> {
  const desde = now.getTime() + minLeadHours * 3_600_000;
  const hasta = now.getTime() + windowHours * 3_600_000;

  const bookings = await db.listBookings(tenant.id, {
    status: ["confirmed", "pending_payment"],
  });

  const enVentana = bookings.filter((b) => {
    const t = new Date(b.startsAt).getTime();
    return t >= desde && t <= hasta && !b.reminderSentAt;
  });

  return expandBookings(tenant.id, enVentana);
}

/** Marca el turno como avisado. Idempotente. */
export async function markReminderSent(tenantId: string, bookingId: string) {
  return db.updateBooking(tenantId, bookingId, {
    reminderSentAt: new Date().toISOString(),
  });
}

/**
 * Modelo PUSH: emite booking.reminder_24h por cada turno pendiente de todos
 * los tenants y los marca como avisados.
 */
export async function dispatchReminders(now: Date = new Date()): Promise<{
  tenants: number;
  sent: number;
  failed: number;
  bookingIds: string[];
}> {
  const tenants = await db.listTenants();
  const bookingIds: string[] = [];
  let sent = 0;
  let failed = 0;

  for (const tenant of tenants) {
    const pendientes = await findDueReminders(tenant, 24, 2, now);

    for (const detail of pendientes) {
      const resultado = await emitEvent(
        "booking.reminder_24h",
        tenant,
        bookingPayload(detail)
      );

      if (resultado.ok) {
        // "skipped" tambien marca: si no hay URL configurada no tiene sentido
        // reintentar en la proxima corrida.
        await markReminderSent(tenant.id, detail.id);
        bookingIds.push(detail.id);
        sent++;
      } else {
        failed++;
      }
    }
  }

  return { tenants: tenants.length, sent, failed, bookingIds };
}
