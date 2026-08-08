// PATCH /api/bookings/:id — paso 11: el empleado marca el resultado del turno.
import { NextResponse } from "next/server";
import { BookingError, setAttendance } from "@/lib/services/bookings";

export const dynamic = "force-dynamic";

const PERMITIDOS = ["completed", "no_show", "confirmed"] as const;
type Permitido = (typeof PERMITIDOS)[number];

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  let body: { status?: string; tenant?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const status = body.status as Permitido;
  if (!PERMITIDOS.includes(status)) {
    return NextResponse.json(
      { error: `status debe ser uno de: ${PERMITIDOS.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const booking = await setAttendance(body.tenant ?? "", params.id, status);
    return NextResponse.json({ id: booking.id, status: booking.status });
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("[bookings:patch]", error);
    return NextResponse.json(
      { error: "No se pudo actualizar el turno" },
      { status: 500 }
    );
  }
}
