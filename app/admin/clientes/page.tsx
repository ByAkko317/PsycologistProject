// CRM basico: cada cliente con su historial de turnos y gasto acumulado.
import { Card, EmptyState, SectionTitle, StatusBadge } from "@/components/ui";
import { db } from "@/lib/services/db";
import { formatMoney, requireTenant } from "@/lib/tenant";
import { formatBookingDate } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

export default async function AdminClientes() {
  const tenant = await requireTenant();
  const [clientes, bookings, servicios] = await Promise.all([
    db.listClients(tenant.id),
    db.listBookings(tenant.id),
    db.listServices(tenant.id),
  ]);

  const servicioPorId = new Map(servicios.map((s) => [s.id, s]));

  const filas = clientes
    .map((c) => {
      const suyos = bookings.filter((b) => b.clientId === c.id);
      const activos = suyos.filter((b) => b.status !== "cancelled");
      return {
        cliente: c,
        total: suyos.length,
        gastado: activos.reduce((acc, b) => acc + b.amountPaid, 0),
        ultimo: suyos.at(-1),
      };
    })
    .sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Clientes</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {clientes.length} cliente{clientes.length === 1 ? "" : "s"} en la base.
          Se crean solos al reservar.
        </p>
      </div>

      {filas.length === 0 ? (
        <EmptyState>Todavía no hay clientes registrados.</EmptyState>
      ) : (
        <Card className="divide-y divide-line p-0">
          {filas.map(({ cliente, total, gastado, ultimo }) => (
            <div key={cliente.id} className="px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{cliente.name}</p>
                <span className="text-sm text-fg-muted">
                  {total} turno{total === 1 ? "" : "s"} ·{" "}
                  {formatMoney(gastado, tenant)} cobrado
                </span>
              </div>
              <p className="mt-0.5 text-sm text-fg-muted">
                {[cliente.email, cliente.phone].filter(Boolean).join(" · ") ||
                  "Sin datos de contacto"}
              </p>
              {ultimo && (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                  <span className="text-fg-subtle">Último:</span>
                  {servicioPorId.get(ultimo.serviceId)?.name ?? "Servicio"} ·{" "}
                  {formatBookingDate(ultimo.startsAt, tenant.timezone)}
                  <StatusBadge status={ultimo.status} />
                </p>
              )}
              {cliente.notes && (
                <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-sm text-fg-muted">
                  {cliente.notes}
                </p>
              )}
            </div>
          ))}
        </Card>
      )}

      <section>
        <SectionTitle hint="Los datos que n8n usa para armar los mensajes">
          Cómo se alimenta este listado
        </SectionTitle>
        <Card className="text-sm text-fg-muted">
          Cada reserva hace un <code>upsert</code> del cliente por email o
          teléfono, así que un mismo paciente no se duplica aunque reserve
          varias veces. Ese mismo registro es el que viaja en el payload de{" "}
          <code>booking.created</code> hacia n8n.
        </Card>
      </section>
    </div>
  );
}
