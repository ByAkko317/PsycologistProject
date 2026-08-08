// POST /api/portal/reschedule — paso 10: el cliente mueve su turno de horario.
// Revalida disponibilidad y dispara booking.rescheduled hacia n8n.
import { NextResponse } from "next/server";
import { BookingError, rescheduleBooking } from "@/lib/services/bookings";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { token?: string; startsAt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  try {
    const detail = await rescheduleBooking(
      body.token ?? "",
      body.startsAt ?? ""
    );
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
