// PATCH /api/bookings/:id — paso 11: el empleado marca el resultado del turno.
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/guards";
import { roleCan } from "@/lib/auth/permissions";
import { BookingError, setAttendance } from "@/lib/services/bookings";
import { db } from "@/lib/services/db";

export const dynamic = "force-dynamic";

const PERMITIDOS = ["completed", "no_show", "confirmed"] as const;
type Permitido = (typeof PERMITIDOS)[number];

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  // Antes esto era publico: cualquiera podia marcar turnos como "asistio".
  const sesion = requireApiSession(["owner", "employee"]);
  if (sesion instanceof NextResponse) return sesion;

  // La capability es la fuente de verdad, no el rol: si mañana se saca
  // "bookings:attendance" de employee, este endpoint se cierra solo.
  if (!roleCan(sesion.role, "bookings:attendance")) {
    return NextResponse.json(
      { error: "Tu usuario no puede marcar asistencia", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

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
    // Un profesional solo toca SUS turnos; el dueño, cualquiera del tenant.
    if (sesion.role === "employee") {
      const booking = await db.getBooking(sesion.tenantId, params.id);
      if (!booking) {
        return NextResponse.json({ error: "Turno inexistente" }, { status: 404 });
      }
      if (booking.professionalId !== sesion.professionalId) {
        return NextResponse.json(
          { error: "Ese turno no es de tu agenda", code: "FORBIDDEN" },
          { status: 403 }
        );
      }
    }

    const booking = await setAttendance(sesion.tenantId, params.id, status);
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
