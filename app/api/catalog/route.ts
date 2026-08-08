// GET /api/catalog?tenant=demo
// Catalogo publico: marca, servicios activos y profesionales habilitados.
// Lo consume el script de auditoria y sirve para embeber la reserva en otro
// sitio sin duplicar la logica de la capa de datos.
import { NextResponse } from "next/server";
import { db } from "@/lib/services/db";
import { resolveTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenant = await resolveTenant(searchParams.get("tenant") ?? undefined);

  if (!tenant) {
    return NextResponse.json({ error: "Tenant inexistente" }, { status: 404 });
  }

  const [services, professionals] = await Promise.all([
    db.listServices(tenant.id, { activeOnly: true }),
    db.listProfessionals(tenant.id),
  ]);

  return NextResponse.json({
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      brandColor: tenant.brandColor,
      logoUrl: tenant.logoUrl ?? null,
      timezone: tenant.timezone,
      currency: tenant.currency,
      cancellationHours: tenant.cancellationHours,
      businessHours: tenant.businessHours,
    },
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description ?? null,
      durationMinutes: s.durationMinutes,
      price: s.price,
      depositPercent: s.depositPercent,
      professionalIds: s.professionalIds,
    })),
    professionals: professionals.map((p) => ({
      id: p.id,
      name: p.name,
      serviceIds: p.serviceIds,
      hasCustomHours: Boolean(p.workingHours),
    })),
  });
}
