// Agenda completa del negocio, agrupada por dia y filtrable por profesional.
import Link from "next/link";
import { Card, EmptyState, PaymentBadge, StatusBadge } from "@/components/ui";
import { db, expandBookings } from "@/lib/services/db";
import { formatMoney, requireTenant } from "@/lib/tenant";
import { toDateKey, toTimeLabel } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

export default async function AdminAgenda({
  searchParams,
}: {
  searchParams: { profesional?: string; incluirPasados?: string };
}) {
  const tenant = await requireTenant();
  const [profesionales, bookings] = await Promise.all([
    db.listProfessionals(tenant.id),
    db.listBookings(tenant.id, {
      professionalId: searchParams.profesional || undefined,
    }),
  ]);

  const incluirPasados = searchParams.incluirPasados === "1";
  const corte = Date.now() - 12 * 3_600_000;

  const detalles = (await expandBookings(tenant.id, bookings)).filter(
    (b) => incluirPasados || new Date(b.startsAt).getTime() >= corte
  );

  // Agrupacion por dia en la timezone del negocio.
  const porDia = new Map<string, typeof detalles>();
  for (const b of detalles) {
    const key = toDateKey(b.startsAt, tenant.timezone);
    porDia.set(key, [...(porDia.get(key) ?? []), b]);
  }

  const filtroBase = (params: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    if (params.profesional) qs.set("profesional", params.profesional);
    if (params.incluirPasados) qs.set("incluirPasados", params.incluirPasados);
    const s = qs.toString();
    return s ? `/admin/agenda?${s}` : "/admin/agenda";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agenda</h1>
        <p className="mt-1 text-sm text-slate-500">
          {detalles.length} turno{detalles.length === 1 ? "" : "s"}
          {incluirPasados ? " (incluye pasados)" : " desde hoy"}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip
          href={filtroBase({ incluirPasados: searchParams.incluirPasados })}
          activo={!searchParams.profesional}
        >
          Todos
        </Chip>
        {profesionales.map((p) => (
          <Chip
            key={p.id}
            href={filtroBase({
              profesional: p.id,
              incluirPasados: searchParams.incluirPasados,
            })}
            activo={searchParams.profesional === p.id}
          >
            {p.name}
          </Chip>
        ))}
        <Chip
          href={filtroBase({
            profesional: searchParams.profesional,
            incluirPasados: incluirPasados ? undefined : "1",
          })}
          activo={incluirPasados}
        >
          {incluirPasados ? "Ocultar pasados" : "Ver pasados"}
        </Chip>
      </div>

      {porDia.size === 0 ? (
        <EmptyState>
          No hay turnos para mostrar.{" "}
          <Link href="/book" className="text-brand hover:underline">
            Reservar uno
          </Link>
          .
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {[...porDia.entries()].map(([dia, turnos]) => (
            <section key={dia}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {new Intl.DateTimeFormat("es-AR", {
                  timeZone: "UTC",
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                }).format(new Date(`${dia}T12:00:00Z`))}
              </h2>

              <Card className="divide-y p-0">
                {turnos.map((b) => (
                  <div
                    key={b.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
                  >
                    <span className="w-14 shrink-0 font-mono text-sm text-slate-600">
                      {toTimeLabel(b.startsAt, tenant.timezone)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {b.client?.name ?? "Cliente"}
                      </p>
                      <p className="truncate text-sm text-slate-500">
                        {b.service?.name} · {b.professional?.name}
                      </p>
                    </div>
                    <span className="text-sm text-slate-500">
                      {formatMoney(b.amountTotal, tenant)}
                    </span>
                    <div className="flex gap-2">
                      <PaymentBadge status={b.paymentStatus} />
                      <StatusBadge status={b.status} />
                    </div>
                  </div>
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  href,
  activo,
  children,
}: {
  href: string;
  activo: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-sm transition ${
        activo
          ? "border-brand bg-brand text-brand-fg"
          : "bg-white hover:border-brand"
      }`}
    >
      {children}
    </Link>
  );
}
