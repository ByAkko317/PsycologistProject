// Portal del paciente (paso 10 del flujo). Tiene dos vías de acceso:
//
//   1. ?token=…  el link opaco que llega en el mensaje de n8n. Funciona SIN
//      login y da acceso a ESE turno únicamente. Es lo que hace que el link de
//      WhatsApp siga sirviendo.
//   2. sesión de paciente: ve la lista de TODOS sus turnos, y solo los suyos.
//      El filtro es por clientId de la sesión, nunca por un id de la URL.
import Link from "next/link";
import type { Metadata } from "next";
import { AppFooter, AppHeader, Page } from "@/components/app-shell";
import { BrandStyle } from "@/components/brand";
import { LoginForm, LogoutButton } from "@/components/auth-forms";
import { PortalActions } from "@/components/portal-actions";
import { Card, EmptyState, PaymentBadge, StatusBadge } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
import { canSelfManage } from "@/lib/services/bookings";
import { db, expandBookings, getBookingDetail } from "@/lib/services/db";
import { formatMoney, requireTenant } from "@/lib/tenant";
import { formatBookingDate, toDateKey } from "@/lib/utils/dates";
import type { BookingDetail, Tenant } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mis turnos",
  robots: { index: false, follow: false },
};

const VENTANA_DIAS = 21;

function opcionesDeFecha(tenant: Tenant) {
  const hoy = new Date();
  return Array.from({ length: VENTANA_DIAS }, (_, i) => {
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
}

export default async function PortalPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token?.trim();

  // --- Vía 1: link del mensaje -------------------------------------------
  if (token) {
    const booking = await db.getBookingByToken(token);
    if (!booking) return <TokenInvalido />;

    const tenant = await db.getTenant(booking.tenantId);
    if (!tenant) return <TokenInvalido />;

    const detail = await getBookingDetail(tenant.id, booking);

    return (
      <>
        <BrandStyle tenant={tenant} />
        <AppHeader tenant={tenant} subtitle="Gestión de tu turno" />
        <main className="mx-auto max-w-xl space-y-6 px-6 py-10">
          <div>
            <h1 className="text-2xl font-bold">Hola {detail.client?.name}</h1>
            <p className="mt-1 text-fg-muted">
              Este es tu turno en {tenant.name}.
            </p>
          </div>

          <TurnoCard
            detail={detail}
            tenant={tenant}
            token={token}
            dateOptions={opcionesDeFecha(tenant)}
          />

          <div className="rounded-xl border border-dashed bg-surface p-5 text-sm">
            <p className="font-medium">¿Querés ver todos tus turnos juntos?</p>
            <p className="mt-1 text-fg-muted">
              Con una cuenta no dependés del link de cada mensaje.
            </p>
            <Link
              href="/registro"
              className="mt-3 inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg"
            >
              Crear mi cuenta
            </Link>
          </div>

          <Politica tenant={tenant} />
        </main>
      </>
    );
  }

  // --- Vía 2: sesión de paciente -----------------------------------------
  const sesion = getSession();
  const tenant = await requireTenant();

  if (!sesion || sesion.role !== "client" || !sesion.clientId) {
    return <PedirLogin tenant={tenant} conSesionAjena={Boolean(sesion)} />;
  }

  // El filtro por clientId sale de la SESIÓN, no de la URL: es lo que impide
  // que alguien vea los turnos de otro paciente cambiando un parámetro.
  const bookings = await db.listBookings(tenant.id, {
    clientId: sesion.clientId,
  });
  const detalles = await expandBookings(tenant.id, bookings);

  const ahora = Date.now();
  const proximos = detalles
    .filter(
      (b) => new Date(b.startsAt).getTime() >= ahora && b.status !== "cancelled"
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const pasados = detalles
    .filter(
      (b) => new Date(b.startsAt).getTime() < ahora || b.status === "cancelled"
    )
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  const dateOptions = opcionesDeFecha(tenant);

  return (
    <>
      <BrandStyle tenant={tenant} />
      <AppHeader tenant={tenant} subtitle="Mis turnos" />

      <main className="mx-auto max-w-xl space-y-8 px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Hola {sesion.name}</h1>
            <p className="mt-1 text-sm text-fg-muted">{sesion.email}</p>
          </div>
          <LogoutButton />
        </div>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Próximos turnos</h2>
          {proximos.length === 0 ? (
            <EmptyState>
              No tenés turnos agendados.{" "}
              <Link
                href={`/book?tenant=${tenant.slug}`}
                className="text-brand hover:underline"
              >
                Reservá uno
              </Link>
              .
            </EmptyState>
          ) : (
            <div className="space-y-6">
              {proximos.map((b) => (
                <TurnoCard
                  key={b.id}
                  detail={b}
                  tenant={tenant}
                  bookingId={b.id}
                  dateOptions={dateOptions}
                />
              ))}
            </div>
          )}
        </section>

        {pasados.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Historial</h2>
            <Card className="divide-y divide-line p-0">
              {pasados.slice(0, 20).map((b) => (
                <div
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {b.service?.name}
                    </p>
                    <p className="text-xs text-fg-muted">
                      {formatBookingDate(b.startsAt, tenant.timezone)} ·{" "}
                      {b.professional?.name}
                    </p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
              ))}
            </Card>
          </section>
        )}

        <Link
          href={`/book?tenant=${tenant.slug}`}
          className="inline-flex rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-fg"
        >
          Reservar otro turno
        </Link>

        <Politica tenant={tenant} />
      </main>
    </>
  );
}

// --- Piezas ------------------------------------------------------------------

function TurnoCard({
  detail,
  tenant,
  token,
  bookingId,
  dateOptions,
}: {
  detail: BookingDetail;
  tenant: Tenant;
  token?: string;
  bookingId?: string;
  dateOptions: { key: string; label: string }[];
}) {
  const gestionable = canSelfManage(detail, tenant);

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex flex-wrap gap-2">
          <StatusBadge status={detail.status} />
          <PaymentBadge status={detail.paymentStatus} />
        </div>
        <dl className="text-sm">
          <Fila termino="Servicio" valor={detail.service?.name ?? "—"} />
          <Fila termino="Profesional" valor={detail.professional?.name ?? "—"} />
          <Fila
            termino="Cuándo"
            valor={formatBookingDate(detail.startsAt, tenant.timezone)}
          />
          <Fila
            termino="Duración"
            valor={`${detail.service?.durationMinutes ?? 0} min`}
          />
          <Fila termino="Total" valor={formatMoney(detail.amountTotal, tenant)} />
          {detail.amountPaid > 0 && (
            <Fila
              termino="Pagado"
              valor={formatMoney(detail.amountPaid, tenant)}
            />
          )}
        </dl>
      </Card>

      {detail.status === "cancelled" ? (
        <div className="rounded-xl border border-dashed bg-surface p-5 text-sm text-fg-muted">
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
          bookingId={bookingId}
          tenantSlug={tenant.slug}
          serviceId={detail.serviceId}
          professionalId={detail.professionalId}
          cancellationHours={tenant.cancellationHours}
          dateOptions={dateOptions}
          puedeGestionar={gestionable}
        />
      )}
    </div>
  );
}

async function PedirLogin({
  tenant,
  conSesionAjena,
}: {
  tenant: Tenant;
  conSesionAjena: boolean;
}) {
  return (
    <>
      <BrandStyle tenant={tenant} />
      <AppHeader tenant={tenant} subtitle="Mis turnos" />
      <main className="mx-auto max-w-md px-6 py-12">
        <h1 className="text-2xl font-bold">Ver mis turnos</h1>
        <p className="mb-6 mt-2 text-sm text-fg-muted">
          {conSesionAjena
            ? "Estás con un usuario del equipo. Para ver turnos de paciente, entrá con una cuenta de paciente."
            : "Entrá con tu cuenta para ver todos tus turnos juntos."}
        </p>

        {conSesionAjena ? (
          <LogoutButton className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg" />
        ) : (
          <LoginForm next="/portal" />
        )}

        <div className="mt-8 border-t pt-6 text-sm text-fg-muted">
          <p className="font-medium text-fg">
            ¿Tenés el link del mensaje?
          </p>
          <p className="mt-1">
            Ese link entra directo a ese turno, sin cuenta.
          </p>
          <form action="/portal" method="get" className="mt-3 flex gap-2">
            <input
              name="token"
              required
              placeholder="Código del turno"
              className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <button
              type="submit"
              className="rounded-lg border px-4 py-2 text-sm hover:border-brand"
            >
              Buscar
            </button>
          </form>
        </div>
      </main>
    </>
  );
}

async function TokenInvalido() {
  const tenant = await requireTenant();
  return (
    <>
      <BrandStyle tenant={tenant} />
      <AppHeader tenant={tenant} />
      <main className="mx-auto max-w-xl px-6 py-12">
        <h1 className="text-2xl font-bold">No encontramos ese turno</h1>
        <p className="mt-2 text-fg-muted">
          El código puede estar incompleto o el turno pudo haberse eliminado.
          Revisá el link del mensaje de confirmación.
        </p>
        <Link
          href="/portal"
          className="mt-6 inline-block text-sm text-brand hover:underline"
        >
          ← Probar de otra forma
        </Link>
      </main>
    </>
  );
}

function Politica({ tenant }: { tenant: Tenant }) {
  return (
    <p className="border-t pt-6 text-sm text-fg-muted">
      Política del negocio: cambios hasta {tenant.cancellationHours} horas antes
      del turno.
      {tenant.contactPhone && ` Consultas: ${tenant.contactPhone}`}
    </p>
  );
}

function Fila({ termino, valor }: { termino: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2 last:border-0">
      <dt className="text-fg-muted">{termino}</dt>
      <dd className="text-right font-medium">{valor}</dd>
    </div>
  );
}
