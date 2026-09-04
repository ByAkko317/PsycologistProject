// PATCH /api/bookings/:id — acciones sobre un turno desde el panel.
//
// Dos niveles, gobernados por capabilities, no por rol:
//   bookings:attendance -> marcar asistio / ausente / reabrir
//   payments:manage     -> corregir a mano el estado del pago
//
// Lo segundo existe porque la realidad se desincroniza: el paciente paga en
// efectivo, o Mercado Pago acredita tarde. La administracion necesita poder
// dejar el registro fiel sin entrar a la base de datos.
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/guards";
import { roleCan } from "@/lib/auth/permissions";
import { BookingError, setAttendance } from "@/lib/services/bookings";
import { verTurno } from "@/lib/services/agenda";
import { db } from "@/lib/services/db";
import { requireTenant } from "@/lib/tenant";
import type { PaymentStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const ASISTENCIA = ["completed", "no_show", "confirmed"] as const;
const PAGOS = [
  "not_required",
  "pending",
  "paid",
  "refunded",
  "failed",
] as const;

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const sesion = requireApiSession(["owner", "employee"]);
  if (sesion instanceof NextResponse) return sesion;

  let body: {
    status?: string;
    paymentStatus?: string;
    amountPaid?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const tenant = await requireTenant();

  // El alcance se resuelve una sola vez: verTurno devuelve null si el turno no
  // le corresponde a esta sesion. Un 404 y no un 403, para no confirmar que
  // existe.
  const turno = await verTurno(tenant, sesion, params.id);
  if (!turno) {
    return NextResponse.json({ error: "Turno inexistente" }, { status: 404 });
  }

  type EstadoAsistencia = (typeof ASISTENCIA)[number];

  const cambios: {
    status?: EstadoAsistencia;
    paymentStatus?: PaymentStatus;
    amountPaid?: number;
  } = {};

  // --- Asistencia ---
  if (body.status !== undefined) {
    if (!ASISTENCIA.includes(body.status as (typeof ASISTENCIA)[number])) {
      return NextResponse.json(
        { error: `status debe ser uno de: ${ASISTENCIA.join(", ")}` },
        { status: 400 }
      );
    }
    if (!roleCan(sesion.role, "bookings:attendance")) {
      return NextResponse.json(
        { error: "Tu usuario no puede marcar asistencia", code: "FORBIDDEN" },
        { status: 403 }
      );
    }
    cambios.status = body.status as EstadoAsistencia;
  }

  // --- Estado del pago ---
  if (body.paymentStatus !== undefined || body.amountPaid !== undefined) {
    if (!roleCan(sesion.role, "payments:manage")) {
      return NextResponse.json(
        {
          error: "Solo la administracion puede corregir el estado del pago",
          code: "FORBIDDEN",
        },
        { status: 403 }
      );
    }

    if (body.paymentStatus !== undefined) {
      if (!PAGOS.includes(body.paymentStatus as (typeof PAGOS)[number])) {
        return NextResponse.json(
          { error: `paymentStatus debe ser uno de: ${PAGOS.join(", ")}` },
          { status: 400 }
        );
      }
      cambios.paymentStatus = body.paymentStatus as PaymentStatus;
    }

    if (body.amountPaid !== undefined) {
      const monto = Number(body.amountPaid);
      if (!Number.isFinite(monto) || monto < 0) {
        return NextResponse.json(
          { error: "amountPaid tiene que ser un numero positivo" },
          { status: 400 }
        );
      }
      if (monto > turno.amountTotal) {
        return NextResponse.json(
          { error: "El monto cobrado no puede superar el total del turno" },
          { status: 400 }
        );
      }
      cambios.amountPaid = monto;
    }
  }

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "No mandaste ningun cambio" }, { status: 400 });
  }

  try {
    // La asistencia pasa por el caso de uso; el resto se escribe directo.
    if (cambios.status && Object.keys(cambios).length === 1) {
      const b = await setAttendance(tenant.id, params.id, cambios.status);
      return NextResponse.json({ id: b.id, status: b.status });
    }

    const actualizado = await db.updateBooking(tenant.id, params.id, cambios);
    return NextResponse.json({
      id: actualizado.id,
      status: actualizado.status,
      paymentStatus: actualizado.paymentStatus,
      amountPaid: actualizado.amountPaid,
    });
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
