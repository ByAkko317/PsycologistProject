// POST /api/portal/cancel — paso 10: el cliente cancela su turno.
// Valida la politica del negocio y dispara booking.cancelled hacia n8n.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import type { BookingAccess } from "@/lib/services/bookings";
import { BookingError, cancelBooking } from "@/lib/services/bookings";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { token?: string; bookingId?: string; reason?: string };
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
    const detail = await cancelBooking(acceso, body.reason);
    return NextResponse.json({ ok: true, status: detail.status });
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("[portal:cancel]", error);
    return NextResponse.json(
      { error: "No se pudo cancelar el turno" },
      { status: 500 }
    );
  }
}

/**
 * Dos formas validas de identificar el turno: el token del mensaje, o una
 * sesion de paciente sobre un turno propio. Nunca solo el bookingId.
 */
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
