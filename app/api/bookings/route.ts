// POST /api/bookings — crea un turno (paso 6) y dispara booking.created (paso 8).
import { NextResponse } from "next/server";
import { BookingError, createBooking } from "@/lib/services/bookings";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  try {
    const result = await createBooking({
      tenantSlug: body.tenant as string | undefined,
      serviceId: String(body.serviceId ?? ""),
      professionalId: String(body.professionalId ?? ""),
      startsAt: String(body.startsAt ?? ""),
      notes: body.notes ? String(body.notes) : undefined,
      client: {
        name: String((body.client as any)?.name ?? "").trim(),
        email: (body.client as any)?.email
          ? String((body.client as any).email).trim()
          : undefined,
        phone: (body.client as any)?.phone
          ? String((body.client as any).phone).trim()
          : undefined,
      },
    });

    return NextResponse.json(
      {
        bookingId: result.booking.id,
        status: result.booking.status,
        token: result.booking.publicToken,
        depositAmount: result.depositAmount,
        checkoutUrl: result.checkoutUrl,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("[bookings]", error);
    return NextResponse.json(
      { error: "No se pudo crear el turno" },
      { status: 500 }
    );
  }
}
