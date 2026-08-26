// Paso 1 a 6 del flujo: portal publico de reservas.
// Server component: carga catalogo y marca; el wizard corre en el cliente.
import Link from "next/link";
import { AppFooter, AppHeader, Page } from "@/components/app-shell";
import { BrandStyle } from "@/components/brand";
import { BookingWizard } from "@/components/booking-wizard";
import { db } from "@/lib/services/db";
import { requireTenant } from "@/lib/tenant";
import { toDateKey, weekdayOf } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

/** Cuantos dias hacia adelante se ofrecen en el selector. */
const VENTANA_DIAS = 21;

export default async function BookPage({
  searchParams,
}: {
  searchParams: { tenant?: string };
}) {
  const tenant = await requireTenant(searchParams.tenant);

  const [services, professionals] = await Promise.all([
    db.listServices(tenant.id, { activeOnly: true }),
    db.listProfessionals(tenant.id),
  ]);

  // Dias que al menos alguien atiende: horario del negocio + horarios propios.
  const diasHabiles = new Set<number>(
    Object.entries(tenant.businessHours)
      .filter(([, ranges]) => (ranges ?? []).length > 0)
      .map(([weekday]) => Number(weekday))
  );
  for (const p of professionals) {
    for (const [weekday, ranges] of Object.entries(p.workingHours ?? {})) {
      if ((ranges ?? []).length > 0) diasHabiles.add(Number(weekday));
    }
  }

  const hoy = new Date();
  const dateOptions = Array.from({ length: VENTANA_DIAS }, (_, i) => {
    const key = toDateKey(new Date(hoy.getTime() + i * 86_400_000), tenant.timezone);
    return {
      key,
      weekday: weekdayOf(key),
      label: new Intl.DateTimeFormat("es-AR", {
        timeZone: "UTC",
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(new Date(`${key}T12:00:00Z`)),
    };
  }).filter((d) => diasHabiles.has(d.weekday));

  return (
    <>
      <BrandStyle tenant={tenant} />
      <AppHeader tenant={tenant} subtitle="Reservá tu turno online" />

      <main className="mx-auto max-w-2xl px-6 py-10">
        <BookingWizard
          tenant={{
            id: tenant.id,
            slug: tenant.slug,
            name: tenant.name,
            currency: tenant.currency,
            timezone: tenant.timezone,
            cancellationHours: tenant.cancellationHours,
          }}
          services={services}
          professionals={professionals}
          dateOptions={dateOptions}
        />

        <p className="mt-10 border-t pt-6 text-sm text-fg-muted">
          ¿Ya tenés un turno?{" "}
          <Link href="/portal" className="text-brand hover:underline">
            Gestionalo acá
          </Link>
        </p>
      </main>
    </>
  );
}
