// Dashboard del administrador: métricas del negocio + trabajo del día.
import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import {
  BarRow,
  Card,
  EmptyState,
  PaymentBadge,
  SectionTitle,
  Stat,
  StatusBadge,
} from "@/components/ui";
import { getAnalytics } from "@/lib/services/analytics";
import { formatMoney, requireTenant } from "@/lib/tenant";
import { formatBookingDate, toTimeLabel } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

const VENTANAS = [7, 30, 90];

export default async function AdminResumen({
  searchParams,
}: {
  searchParams: { dias?: string };
}) {
  const tenant = await requireTenant();
  const dias = VENTANAS.includes(Number(searchParams.dias))
    ? Number(searchParams.dias)
    : 30;

  const a = await getAnalytics(tenant, dias);
  const maxDia = Math.max(...a.porDia.map((d) => d.total), 1);
  const maxServicio = Math.max(...a.porServicio.map((s) => s.total), 1);
  const maxProf = Math.max(...a.porProfesional.map((p) => p.total), 1);

  const pct = (v: number | null) =>
    v === null ? "—" : `${Math.round(v)}%`;

  return (
    <>
      <PageHeader
        title="Resumen"
        description={`Últimos ${dias} días en ${tenant.name}.`}
        actions={
          <div className="flex rounded-lg border border-line bg-surface p-0.5">
            {VENTANAS.map((d) => (
              <Link
                key={d}
                href={`/admin?dias=${d}`}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  d === dias
                    ? "bg-brand text-brand-fg"
                    : "text-fg-muted hover:text-fg"
                }`}
              >
                {d}d
              </Link>
            ))}
          </div>
        }
      />

      {/* --- Métricas principales --- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Turnos"
          value={a.turnos.valor}
          trend={a.turnos.tendencia}
          hint={`vs. ${dias} días previos`}
        />
        <Stat
          label="Cobrado"
          value={formatMoney(a.ingresos.valor, tenant)}
          trend={a.ingresos.tendencia}
          hint="Señas y pagos acreditados"
        />
        <Stat
          label="Pacientes nuevos"
          value={a.pacientesNuevos.valor}
          trend={a.pacientesNuevos.tendencia}
          hint="Primera reserva en el período"
        />
        <Stat
          label="Asistencia"
          value={pct(a.tasaAsistencia)}
          hint={
            a.tasaCancelacion !== null
              ? `${pct(a.tasaCancelacion)} de cancelación`
              : "Sin turnos cerrados aún"
          }
        />
      </div>

      {/* --- Turnos por día --- */}
      <section className="mt-8">
        <SectionTitle hint="Cada barra es un día; la altura, la cantidad de turnos.">
          Actividad
        </SectionTitle>
        <Card>
          {a.porDia.every((d) => d.total === 0) ? (
            <p className="py-6 text-center text-sm text-fg-muted">
              Todavía no hay turnos en este período.
            </p>
          ) : (
            <div
              className="flex h-36 items-end gap-1"
              role="img"
              aria-label={`Turnos por día en los últimos ${dias} días`}
            >
              {a.porDia.map((d) => (
                <div
                  key={d.fecha}
                  className="group relative flex-1"
                  style={{ minWidth: 3 }}
                >
                  <div
                    className="w-full rounded-t bg-brand/75 transition group-hover:bg-brand"
                    style={{
                      height: `${Math.max((d.total / maxDia) * 100, d.total > 0 ? 6 : 2)}%`,
                    }}
                  />
                  <span className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-overlay px-2 py-1 text-xs shadow-pop group-hover:block">
                    {d.etiqueta}: {d.total}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 flex justify-between text-xs text-fg-subtle">
            <span>{a.porDia[0]?.etiqueta}</span>
            <span>{a.porDia.at(-1)?.etiqueta}</span>
          </div>
        </Card>
      </section>

      {/* --- Rankings --- */}
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <section>
          <SectionTitle>Servicios más pedidos</SectionTitle>
          <Card>
            {a.porServicio.length === 0 ? (
              <p className="py-4 text-sm text-fg-muted">Sin datos aún.</p>
            ) : (
              a.porServicio
                .slice(0, 6)
                .map((s) => (
                  <BarRow
                    key={s.nombre}
                    label={s.nombre}
                    value={s.total}
                    max={maxServicio}
                    detail={`${s.total} · ${formatMoney(s.ingresos, tenant)}`}
                  />
                ))
            )}
          </Card>
        </section>

        <section>
          <SectionTitle>Carga por profesional</SectionTitle>
          <Card>
            {a.porProfesional.length === 0 ? (
              <p className="py-4 text-sm text-fg-muted">Sin datos aún.</p>
            ) : (
              a.porProfesional.map((p) => (
                <BarRow
                  key={p.nombre}
                  label={p.nombre}
                  value={p.total}
                  max={maxProf}
                  detail={
                    p.asistencia !== null
                      ? `${p.total} · ${Math.round(p.asistencia)}% asistencia`
                      : `${p.total} turnos`
                  }
                />
              ))
            )}
          </Card>
        </section>
      </div>

      {/* --- Hoy --- */}
      <section className="mt-8">
        <SectionTitle
          hint={
            a.pendientesDePago > 0
              ? `${a.pendientesDePago} turno(s) esperando el pago de la seña.`
              : undefined
          }
        >
          Hoy
        </SectionTitle>
        {a.hoy.length === 0 ? (
          <EmptyState>No hay turnos agendados para hoy.</EmptyState>
        ) : (
          <Card padding={false} className="divide-y divide-line">
            {a.hoy.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5"
              >
                <span className="tabular w-14 shrink-0 text-sm font-medium text-fg-muted">
                  {toTimeLabel(b.startsAt, tenant.timezone)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{b.client?.name}</p>
                  <p className="truncate text-sm text-fg-muted">
                    {b.service?.name} · {b.professional?.name}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <PaymentBadge status={b.paymentStatus} />
                  <StatusBadge status={b.status} />
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* --- Próximos --- */}
      <section className="mt-8">
        <SectionTitle hint="Los 8 turnos más cercanos.">
          Lo que viene
        </SectionTitle>
        {a.proximos.length === 0 ? (
          <EmptyState>
            No hay turnos futuros.{" "}
            <Link href="/book" className="text-brand hover:underline">
              Probá el flujo de reserva
            </Link>
            .
          </EmptyState>
        ) : (
          <Card padding={false} className="divide-y divide-line">
            {a.proximos.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{b.client?.name}</p>
                  <p className="truncate text-sm text-fg-muted">
                    {b.service?.name} · {b.professional?.name}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-fg-muted">
                    {formatBookingDate(b.startsAt, tenant.timezone)}
                  </span>
                  <StatusBadge status={b.status} />
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </>
  );
}
