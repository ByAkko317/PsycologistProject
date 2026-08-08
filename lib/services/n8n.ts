// =============================================================================
// Emisor de eventos hacia n8n.
//
// La app NO arma mensajes ni conoce WhatsApp/email: solo avisa "paso esto" y
// n8n decide que hacer. Cada evento viaja firmado con HMAC-SHA256.
//
// Contrato de payloads y workflows esperados: n8n/README.md
//
// Regla de oro: un fallo de n8n NUNCA debe romper una reserva. Todos los
// errores se capturan y se loguean; la funcion siempre resuelve.
// =============================================================================

import { createHmac } from "node:crypto";
import { config } from "@/lib/config";
import type { BookingDetail } from "@/lib/types";

export type N8nEvent =
  | "booking.created"
  | "booking.cancelled"
  | "booking.rescheduled"
  | "booking.reminder_24h"
  | "payment.confirmed";

export interface N8nEnvelope<T = unknown> {
  /** Nombre del evento. n8n rutea por este campo. */
  event: N8nEvent;
  /** ISO 8601 del momento en que se emitio. */
  emittedAt: string;
  /** Version del contrato; subir si cambia la forma del payload. */
  version: 1;
  /** Tenant al que pertenece el evento. */
  tenantId: string;
  tenantSlug: string;
  data: T;
}

export interface N8nResult {
  ok: boolean;
  /** "skipped" = no habia URL configurada; no es un error. */
  status: "sent" | "skipped" | "failed";
  detail?: string;
}

/** Firma HMAC-SHA256 del body, tal como la debe validar n8n. */
export function signPayload(body: string, secret = config.n8n.secret): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Envia un evento a n8n. Nunca lanza.
 * Si la URL no esta configurada o N8N_ENABLED=false, loguea y sigue.
 */
export async function emitEvent<T>(
  event: N8nEvent,
  tenant: { id: string; slug: string },
  data: T
): Promise<N8nResult> {
  const url = config.n8n.webhooks[event];

  const envelope: N8nEnvelope<T> = {
    event,
    emittedAt: new Date().toISOString(),
    version: 1,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    data,
  };

  if (!config.n8n.enabled || !url) {
    console.info(
      `[n8n] ${event} sin enviar (${!config.n8n.enabled ? "N8N_ENABLED=false" : "URL no configurada"})`,
      { tenantId: tenant.id }
    );
    return { ok: true, status: "skipped" };
  }

  const body = JSON.stringify(envelope);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Turnos-Event": event,
        "X-Turnos-Signature": signPayload(body),
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const detail = `${res.status} ${await res.text().catch(() => "")}`.trim();
      console.error(`[n8n] ${event} rechazado: ${detail}`);
      return { ok: false, status: "failed", detail };
    }

    console.info(`[n8n] ${event} enviado`, { tenantId: tenant.id });
    return { ok: true, status: "sent" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[n8n] ${event} fallo: ${detail}`);
    return { ok: false, status: "failed", detail };
  }
}

/**
 * Forma canonica de un turno para n8n.
 * Incluye todo lo que un mensaje de WhatsApp/email puede necesitar, para que
 * el workflow no tenga que volver a consultar la base.
 */
export function bookingPayload(detail: BookingDetail) {
  const tz = detail.tenant?.timezone ?? "America/Argentina/Buenos_Aires";
  const appUrl = config.appUrl.replace(/\/$/, "");

  return {
    booking: {
      id: detail.id,
      status: detail.status,
      paymentStatus: detail.paymentStatus,
      startsAt: detail.startsAt,
      endsAt: detail.endsAt,
      amountTotal: detail.amountTotal,
      amountPaid: detail.amountPaid,
      notes: detail.notes ?? "",
      cancellationReason: detail.cancellationReason ?? "",
    },
    /** Fecha y hora ya formateadas en la timezone del negocio. */
    display: {
      timezone: tz,
      date: new Intl.DateTimeFormat("es-AR", {
        timeZone: tz,
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(new Date(detail.startsAt)),
      time: new Intl.DateTimeFormat("es-AR", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(detail.startsAt)),
    },
    client: {
      id: detail.client?.id ?? detail.clientId,
      name: detail.client?.name ?? "",
      email: detail.client?.email ?? "",
      /** En formato internacional, listo para WhatsApp. */
      phone: detail.client?.phone ?? "",
    },
    service: {
      id: detail.service?.id ?? detail.serviceId,
      name: detail.service?.name ?? "",
      durationMinutes: detail.service?.durationMinutes ?? 0,
      price: detail.service?.price ?? 0,
    },
    professional: {
      id: detail.professional?.id ?? detail.professionalId,
      name: detail.professional?.name ?? "",
      email: detail.professional?.email ?? "",
    },
    business: {
      name: detail.tenant?.name ?? "",
      email: detail.tenant?.contactEmail ?? "",
      phone: detail.tenant?.contactPhone ?? "",
      cancellationHours: detail.tenant?.cancellationHours ?? 24,
    },
    links: {
      /** Link de autogestion del cliente (cancelar / reprogramar). */
      manage: `${appUrl}/portal?token=${detail.publicToken}`,
    },
  };
}

export type BookingEventPayload = ReturnType<typeof bookingPayload>;
