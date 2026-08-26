// =============================================================================
// Mercado Pago — Checkout Pro (pasos 5 y 7 del flujo).
//
// Sin SDK: la API REST alcanza y evita una dependencia mas.
// En sandbox se usan las credenciales de prueba; no mueve plata real.
//
// Ojo con el webhook: para que Mercado Pago pueda avisarle al sistema, la app
// necesita una URL publica (ngrok en local, o el dominio de Vercel).
// =============================================================================

import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";
import type { Booking, Service, Tenant } from "@/lib/types";

export interface PaymentPreference {
  id: string;
  /** URL del checkout productivo. */
  initPoint: string;
  /** URL del checkout de prueba. */
  sandboxInitPoint: string;
}

export interface PaymentInfo {
  id: string;
  status: "approved" | "pending" | "in_process" | "rejected" | "cancelled" | string;
  statusDetail: string;
  transactionAmount: number;
  /** Nuestro bookingId, que mandamos como external_reference. */
  externalReference: string;
}

/** True si hay credenciales cargadas. Si es false, se saltea todo el cobro. */
export function isPaymentEnabled(): boolean {
  return config.mercadopago.enabled;
}

/**
 * True si estamos en sandbox: credenciales TEST- o simulador local.
 * Se usa para elegir el init_point correcto y para avisar en el panel.
 */
export function isSandbox(): boolean {
  return config.mercadopago.isSandbox;
}

async function mpFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${config.mercadopago.apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.mercadopago.accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `Mercado Pago ${res.status} en ${path}: ${await res.text()}`
    );
  }
  return (await res.json()) as T;
}

/**
 * Paso 5: crea la preferencia de pago de la seña (o del total).
 * external_reference lleva el bookingId, que es lo que despues nos permite
 * atar el pago al turno cuando llega el webhook.
 */
export async function createPaymentPreference(args: {
  booking: Booking;
  service: Service;
  tenant: Tenant;
  amount: number;
  payerEmail?: string;
  payerName?: string;
}): Promise<PaymentPreference> {
  const { booking, service, tenant, amount } = args;
  const appUrl = config.appUrl.replace(/\/$/, "");
  const vuelta = `${appUrl}/book/gracias?token=${booking.publicToken}`;

  const esSeña = amount < service.price;

  const body = {
    items: [
      {
        id: service.id,
        title: esSeña
          ? `Seña — ${service.name} en ${tenant.name}`
          : `${service.name} en ${tenant.name}`,
        description: `Turno del ${booking.startsAt}`,
        quantity: 1,
        unit_price: amount,
        currency_id: tenant.currency || "ARS",
      },
    ],
    payer: {
      name: args.payerName,
      email: args.payerEmail,
    },
    external_reference: booking.id,
    notification_url: `${appUrl}/api/mercadopago/webhook`,
    back_urls: { success: vuelta, pending: vuelta, failure: vuelta },
    auto_return: "approved",
    statement_descriptor: tenant.name.slice(0, 22),
    metadata: {
      booking_id: booking.id,
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
    },
  };

  const pref = await mpFetch<{
    id: string;
    init_point: string;
    sandbox_init_point: string;
  }>("/checkout/preferences", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return {
    id: pref.id,
    initPoint: pref.init_point,
    sandboxInitPoint: pref.sandbox_init_point,
  };
}

/** Consulta el estado real de un pago. Nunca confiar solo en el webhook. */
export async function getPayment(paymentId: string): Promise<PaymentInfo> {
  const p = await mpFetch<{
    id: number;
    status: string;
    status_detail: string;
    transaction_amount: number;
    external_reference: string;
  }>(`/v1/payments/${paymentId}`);

  return {
    id: String(p.id),
    status: p.status,
    statusDetail: p.status_detail,
    transactionAmount: p.transaction_amount,
    externalReference: p.external_reference,
  };
}

/**
 * Valida la firma del webhook (header `x-signature`).
 *
 * Mercado Pago manda:  x-signature: ts=1700000000,v1=<hmac>
 * El manifest a firmar es:  id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 *
 * Si MERCADOPAGO_WEBHOOK_SECRET no esta configurado devuelve `true` con un
 * warning: sirve para probar en local, pero NO debe quedar asi en produccion.
 */
export function verifyWebhookSignature(args: {
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string | null;
}): { valid: boolean; reason?: string } {
  const secret = config.mercadopago.webhookSecret;

  if (!secret) {
    console.warn(
      "[mercadopago] MERCADOPAGO_WEBHOOK_SECRET vacio: la firma del webhook NO se esta validando."
    );
    return { valid: true, reason: "sin-secreto" };
  }
  if (!args.signatureHeader) {
    return { valid: false, reason: "falta el header x-signature" };
  }

  const partes = Object.fromEntries(
    args.signatureHeader.split(",").map((p) => {
      const [k, ...v] = p.trim().split("=");
      return [k, v.join("=")];
    })
  );

  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return { valid: false, reason: "x-signature mal formado" };

  const manifest = `id:${args.dataId ?? ""};request-id:${args.requestId ?? ""};ts:${ts};`;
  const esperado = createHmac("sha256", secret).update(manifest).digest("hex");

  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(v1, "utf8");
  if (a.length !== b.length) return { valid: false, reason: "firma invalida" };

  return timingSafeEqual(a, b)
    ? { valid: true }
    : { valid: false, reason: "firma invalida" };
}
