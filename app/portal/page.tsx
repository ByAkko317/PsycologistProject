// Portal de autogestion del cliente (paso 10 del flujo).
// El acceso es por token opaco, no por login: el link llega en el mensaje que
// envia n8n. Sin token valido no se muestra ningun dato.
import Link from "next/link";
import type { Metadata } from "next";
import { BrandHeader, BrandStyle } from "@/components/brand";
import { PortalActions } from "@/components/portal-actions";
import { Card, PaymentBadge, StatusBadge } from "@/components/ui";
import { canSelfManage } from "@/lib/services/bookings";
import { db, getBookingDetail } from "@/lib/services/db";
import { formatMoney, requireTenant } from "@/lib/tenant";
import { formatBookingDate, toDateKey } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mi turno",
  robots: { index: false, follow: false },
};

const VENTANA_DIAS = 21;

export default async function PortalPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token?.trim();

  if (!token) return <BuscadorDeTurno />;

  const booking = await db.getBookingByToken(token);
  if (!booking) return <TokenInvalido />;

  const tenant = await db.getTenant(booking.tenantId);
  if (!tenant) return <TokenInvalido />;

  const detail = await getBookingDetail(tenant.id, booking);
  const gestionable = canSelfManage(booking, tenant);

  const hoy = new Date();
  const dateOptions = Array.from({ length: VENTANA_DIAS }, (_, i) => {
    const key = toDateKey(
      new Date(hoy.getTime() + i * 86_400_000),
      tenant.timezone
    );
    return {
      key,
      label: new Intl.DateTimeFormat("es-AR", {
        timeZone: "UTC",
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(new Date(`${key}T12:00:00Z`)),
    };
  });

  return (
    <>
      <BrandStyle tenant={tenant} />
      <BrandHeader tenant={tenant} subtitle="Gestión de tu turno" />

      <main className="mx-auto max-w-xl space-y-6 px-6 py-10">
        <div>
          <h1 className="text-2xl font-bold">Hola {detail.client?.name}</h1>
          <p className="mt-1 text-slate-600">
            Este es tu turno en {tenant.name}.
          </p>
        </div>

        <Card>
          <div className="mb-3 flex flex-wrap gap-2">
            <StatusBadge status={detail.status} />
            <PaymentBadge status={detail.paymentStatus} />
          </div>
          <dl className="text-sm">
            <Fila termino="Servicio" valor={detail.service?.name ?? "—"} />
            <Fila
              termino="Profesional"
              valor={detail.professional?.name ?? "—"}
            />
            <Fila
              termino="Cuándo"
              valor={formatBookingDate(detail.startsAt, tenant.timezone)}
            />
            <Fila
              termino="Duración"
              valor={`${detail.service?.durationMinutes ?? 0} min`}
            />
            <Fila
              termino="Total"
              valor={formatMoney(detail.amountTotal, tenant)}
            />
            {detail.amountPaid > 0 && (
              <Fila
                termino="Pagado"
                valor={formatMoney(detail.amountPaid, tenant)}
              />
            )}
          </dl>
        </Card>

        {detail.status === "cancelled" ? (
          <div className="rounded-xl border border-dashed bg-white p-5 text-sm text-slate-600">
            Este turno está cancelado.{" "}
            <Link
              href={`/book?tenant=${tenant.slug}`}
              className="text-brand hover:underline"
            >
              Reservá uno nuevo
            </Link>
            .
          </div>
        ) : (
          <PortalActions
            token={token}
            tenantSlug={tenant.slug}
            serviceId={detail.serviceId}
            professionalId={detail.professionalId}
            cancellationHours={tenant.cancellationHours}
            dateOptions={dateOptions}
            puedeGestionar={gestionable}
          />
        )}

        <p className="border-t pt-6 text-sm text-slate-500">
          Política del negocio: cambios hasta {tenant.cancellationHours} horas
          antes del turno.
          {tenant.contactPhone && ` Consultas: ${tenant.contactPhone}`}
        </p>
      </main>
    </>
  );
}

// --- Estados sin turno cargado ----------------------------------------------

async function BuscadorDeTurno() {
  const tenant = await requireTenant();
  return (
    <>
      <BrandStyle tenant={tenant} />
      <BrandHeader tenant={tenant} subtitle="Gestión de turnos" />
      <main className="mx-auto max-w-xl px-6 py-12">
        <h1 className="text-2xl font-bold">Buscá tu turno</h1>
        <p className="mt-2 text-slate-600">
          El link para gestionar tu turno llega en el mensaje de confirmación.
          Si lo tenés a mano, pegá el código acá.
        </p>

        <form action="/portal" method="get" className="mt-6 flex gap-2">
          <input
            name="token"
            required
            placeholder="Código del turno"
            className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg"
          >
            Buscar
          </button>
        </form>

        <Link
          href={`/book?tenant=${tenant.slug}`}
          className="mt-8 inline-block text-sm text-brand hover:underline"
        >
          ← Reservar un turno nuevo
        </Link>
      </main>
    </>
  );
}

async function TokenInvalido() {
  const tenant = await requireTenant();
  return (
    <>
      <BrandStyle tenant={tenant} />
      <BrandHeader tenant={tenant} />
      <main className="mx-auto max-w-xl px-6 py-12">
        <h1 className="text-2xl font-bold">No encontramos ese turno</h1>
        <p className="mt-2 text-slate-600">
          El código puede estar incompleto o el turno pudo haberse eliminado.
          Revisá el link del mensaje de confirmación.
        </p>
        <Link
          href="/portal"
          className="mt-6 inline-block text-sm text-brand hover:underline"
        >
          ← Probar con otro código
        </Link>
      </main>
    </>
  );
}

function Fila({ termino, valor }: { termino: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2 last:border-0">
      <dt className="text-slate-500">{termino}</dt>
      <dd className="text-right font-medium">{valor}</dd>
    </div>
  );
}
