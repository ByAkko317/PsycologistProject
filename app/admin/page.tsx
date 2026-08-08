// Resumen del negocio: metricas del dia y proximos turnos (paso 11 del flujo).
import Link from "next/link";
import { Card, EmptyState, SectionTitle, Stat, StatusBadge } from "@/components/ui";
import { db, expandBookings } from "@/lib/services/db";
import { formatMoney, requireTenant } from "@/lib/tenant";
import { formatBookingDate, toDateKey } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

export default async function AdminResumen() {
  const tenant = await requireTenant();
  const bookings = await db.listBookings(tenant.id);
  const detalles = await expandBookings(tenant.id, bookings);

  const hoyKey = toDateKey(new Date(), tenant.timezone);
  const ahora = Date.now();

  const deHoy = detalles.filter(
    (b) => toDateKey(b.startsAt, tenant.timezone) === hoyKey
  );
  const proximos = detalles
    .filter(
      (b) =>
        new Date(b.startsAt).getTime() >= ahora &&
        b.status !== "cancelled"
    )
    .slice(0, 8);

  const activos = detalles.filter((b) => b.status !== "cancelled");
  const ingresosPrevistos = activos
    .filter((b) => new Date(b.startsAt).getTime() >= ahora)
    .reduce((acc, b) => acc + b.amountTotal, 0);

  const pendientesDePago = detalles.filter(
    (b) => b.paymentStatus === "pending"
  ).length;

  const cancelados = detalles.filter((b) => b.status === "cancelled").length;
  const tasaCancelacion = detalles.length
    ? Math.round((cancelados / detalles.length) * 100)
    : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Resumen</h1>
        <p className="mt-1 text-sm text-slate-500">
          Todo lo que pasa hoy en {tenant.name}, de un vistazo.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Turnos hoy" value={deHoy.length} />
        <Stat
          label="Próximos turnos"
          value={proximos.length}
          hint="Confirmados y pendientes"
        />
        <Stat
          label="Ingresos previstos"
          value={formatMoney(ingresosPrevistos, tenant)}
          hint="Turnos futuros no cancelados"
        />
        <Stat
          label="Pagos pendientes"
          value={pendientesDePago}
          hint={`Cancelación: ${tasaCancelacion}%`}
        />
      </div>

      <section>
        <SectionTitle hint="Los 8 turnos más cercanos">
          Próximos turnos
        </SectionTitle>

        {proximos.length === 0 ? (
          <EmptyState>
            No hay turnos agendados.{" "}
            <Link href="/book" className="text-brand hover:underline">
              Probá el flujo de reserva
            </Link>
            .
          </EmptyState>
        ) : (
          <Card className="divide-y p-0">
            {proximos.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {b.client?.name ?? "Cliente"}
                  </p>
                  <p className="text-sm text-slate-500">
                    {b.service?.name} · {b.professional?.name}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-600">
                    {formatBookingDate(b.startsAt, tenant.timezone)}
                  </span>
                  <StatusBadge status={b.status} />
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
