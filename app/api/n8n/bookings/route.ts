// =============================================================================
// Endpoint que consume n8n (modelo PULL del recordatorio de 24hs).
//
//   GET  /api/n8n/bookings?tenant=demo&window=24h
//        -> turnos que arrancan dentro de ~24hs y todavia no fueron avisados,
//           con el payload ya armado (mismo contrato que los eventos salientes).
//
//   POST /api/n8n/bookings   { "bookingId": "...", "action": "reminder_sent" }
//        -> marca el turno como avisado para no duplicar el mensaje.
//
// Auth en ambos casos:  Authorization: Bearer <N8N_WEBHOOK_SECRET>
// =============================================================================

import { NextResponse } from "next/server";
import { isAuthorizedN8nRequest } from "@/lib/auth-n8n";
import { db } from "@/lib/services/db";
import { bookingPayload } from "@/lib/services/n8n";
import { findDueReminders, markReminderSent } from "@/lib/services/reminders";
import { resolveTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

function noAutorizado(reason?: string) {
  console.warn(`[n8n:inbound] rechazado: ${reason}`);
  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}

export async function GET(request: Request) {
  const auth = isAuthorizedN8nRequest(request);
  if (!auth.ok) return noAutorizado(auth.reason);

  const { searchParams } = new URL(request.url);
  const tenant = await resolveTenant(searchParams.get("tenant") ?? undefined);
  if (!tenant) {
    return NextResponse.json({ error: "Tenant inexistente" }, { status: 404 });
  }

  const window = searchParams.get("window") ?? "24h";
  const horas = Number(window.replace(/h$/i, "")) || 24;

  const pendientes = await findDueReminders(tenant, horas);

  return NextResponse.json({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    window: `${horas}h`,
    count: pendientes.length,
    bookings: pendientes.map(bookingPayload),
  });
}

export async function POST(request: Request) {
  const auth = isAuthorizedN8nRequest(request);
  if (!auth.ok) return noAutorizado(auth.reason);

  let body: { bookingId?: string; action?: string; tenant?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  if (body.action !== "reminder_sent") {
    return NextResponse.json(
      { error: 'La unica accion soportada es "reminder_sent"' },
      { status: 400 }
    );
  }
  if (!body.bookingId) {
    return NextResponse.json({ error: "Falta bookingId" }, { status: 400 });
  }

  const tenant = await resolveTenant(body.tenant);
  if (!tenant) {
    return NextResponse.json({ error: "Tenant inexistente" }, { status: 404 });
  }

  const booking = await db.getBooking(tenant.id, body.bookingId);
  if (!booking) {
    return NextResponse.json({ error: "Turno inexistente" }, { status: 404 });
  }

  await markReminderSent(tenant.id, booking.id);
  return NextResponse.json({ ok: true, bookingId: booking.id });
}
