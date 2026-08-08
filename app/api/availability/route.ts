// GET /api/availability?tenant=demo&serviceId=..&professionalId=..&date=YYYY-MM-DD
// Paso 3 del flujo: horarios realmente disponibles, calculados en el servidor.
import { NextResponse } from "next/server";
import { db } from "@/lib/services/db";
import { resolveTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const serviceId = searchParams.get("serviceId");
  const professionalId = searchParams.get("professionalId");
  const dateKey = searchParams.get("date");

  if (!serviceId || !professionalId || !dateKey) {
    return NextResponse.json(
      { error: "Faltan parametros: serviceId, professionalId y date" },
      { status: 400 }
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return NextResponse.json(
      { error: "El parametro date debe tener formato YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const tenant = await resolveTenant(searchParams.get("tenant") ?? undefined);
  if (!tenant) {
    return NextResponse.json({ error: "Tenant inexistente" }, { status: 404 });
  }

  try {
    const slots = await db.getAvailability({
      tenantId: tenant.id,
      serviceId,
      professionalId,
      dateKey,
    });
    return NextResponse.json({ dateKey, slots });
  } catch (error) {
    console.error("[availability]", error);
    return NextResponse.json(
      { error: "No se pudo calcular la disponibilidad" },
      { status: 500 }
    );
  }
}
