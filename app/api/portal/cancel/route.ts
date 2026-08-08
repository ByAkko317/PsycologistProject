// POST /api/portal/cancel — paso 10: el cliente cancela su turno.
// Valida la politica del negocio y dispara booking.cancelled hacia n8n.
import { NextResponse } from "next/server";
import { BookingError, cancelBooking } from "@/lib/services/bookings";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { token?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  try {
    const detail = await cancelBooking(body.token ?? "", body.reason);
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
