// POST /api/portal/reschedule — paso 10: el cliente mueve su turno de horario.
// Revalida disponibilidad y dispara booking.rescheduled hacia n8n.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import type { BookingAccess } from "@/lib/services/bookings";
import { BookingError, rescheduleBooking } from "@/lib/services/bookings";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { token?: string; bookingId?: string; startsAt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const acceso = resolverAcceso(body);
  if (!acceso) {
    return NextResponse.json(
      { error: "Necesitás el link del turno o iniciar sesión" },
      { status: 401 }
    );
  }

  try {
    const detail = await rescheduleBooking(acceso, body.startsAt ?? "");
    return NextResponse.json({
      ok: true,
      startsAt: detail.startsAt,
      endsAt: detail.endsAt,
    });
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("[portal:reschedule]", error);
    return NextResponse.json(
      { error: "No se pudo reprogramar el turno" },
      { status: 500 }
    );
  }
}

function resolverAcceso(body: {
  token?: string;
  bookingId?: string;
}): BookingAccess | null {
  if (body.token?.trim()) return { token: body.token.trim() };

  const sesion = getSession();
  if (sesion?.role === "client" && sesion.clientId && body.bookingId) {
    return { bookingId: body.bookingId, clientId: sesion.clientId };
  }
  return null;
}
