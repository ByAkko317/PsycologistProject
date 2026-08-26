// Agenda del profesional (paso 11 del flujo).
//
// Alcance deliberadamente corto: funciona como parte de trabajo. El profesional
// ve a quién atiende y marca si vino. No ve importes ni estado de pago —saber
// si el paciente pagó puede condicionar el trato y no hace a su tarea— y no
// puede cancelar ni reprogramar, porque eso tiene consecuencias sobre el cobro
// y sobre el paciente: es una decisión de la administración.
//
// El dueño entra a la misma pantalla y ahí sí ve todo, y puede elegir de quién
// es la agenda.
import Link from "next/link";
import type { Metadata } from "next";
import { AppFooter, AppHeader, Page, PageHeader } from "@/components/app-shell";
import { BrandStyle } from "@/components/brand";
import { AttendanceControls } from "@/components/attendance-controls";
import { Alert, Card, EmptyState, PaymentBadge, StatusBadge } from "@/components/ui";
import { requirePageSession } from "@/lib/auth/guards";
import { roleCan } from "@/lib/auth/permissions";
import { db, expandBookings } from "@/lib/services/db";
import { requireTenant } from "@/lib/tenant";
import { toDateKey, toTimeLabel } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mi agenda",
  robots: { index: false, follow: false },
};

export default async function EmployeeAgenda({
  searchParams,
}: {
  searchParams: { profesional?: string; fecha?: string };
}) {
  const sesion = requirePageSession(["employee", "owner"], "/employee/agenda");
  const tenant = await requireTenant();
  const profesionales = await db.listProfessionals(tenant.id);

  const puedeElegirProfesional = roleCan(sesion.role, "bookings:view:all");
  const veImportes = roleCan(sesion.role, "money:view");
  const puedeMarcar = roleCan(sesion.role, "bookings:attendance");

  // El ?profesional= de la URL solo lo obedece quien puede ver todas las
  // agendas. Para un profesional se ignora y siempre se usa el de su sesión.
  const activo = puedeElegirProfesional
    ? (profesionales.find((p) => p.id === searchParams.profesional) ??
      profesionales[0])
    : (profesionales.find((p) => p.id === sesion.professionalId) ?? null);

  const hoyKey = toDateKey(new Date(), tenant.timezone);
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.fecha ?? "")
    ? searchParams.fecha!
    : hoyKey;

  const bookings = activo
    ? await db.listBookings(tenant.id, { professionalId: activo.id })
    : [];

  const detalles = (await expandBookings(tenant.id, bookings))
    .filter((b) => toDateKey(b.startsAt, tenant.timezone) === fecha)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const link = (p: { profesional?: string; fecha?: string }) => {
    const qs = new URLSearchParams();
    if (p.profesional && puedeElegirProfesional)
      qs.set("profesional", p.profesional);
    if (p.fecha) qs.set("fecha", p.fecha);
    const s = qs.toString();
    return s ? `/employee/agenda?${s}` : "/employee/agenda";
  };

  const desplazar = (dias: number) =>
    new Date(new Date(`${fecha}T12:00:00Z`).getTime() + dias * 86_400_000)
      .toISOString()
      .slice(0, 10);

  const atendidos = detalles.filter((b) => b.status === "completed").length;
  const ausentes = detalles.filter((b) => b.status === "no_show").length;
  const pendientes = detalles.filter(
    (b) => b.status === "confirmed" || b.status === "pending_payment"
  ).length;

  const fechaLarga = new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${fecha}T12:00:00Z`));

  return (
    <>
      <BrandStyle tenant={tenant} />
      <AppHeader
        tenant={tenant}
        subtitle="Agenda del profesional"
        backTo={puedeElegirProfesional ? "/admin" : undefined}
        backLabel="Volver al panel"
      />

      <Page>
        <PageHeader
          title={activo?.name ?? "Mi agenda"}
          description={
            puedeElegirProfesional
              ? "Vista del profesional. Desde acá se marca la asistencia del día."
              : "Tus turnos del día. Marcá la asistencia a medida que atendés."
          }
        />

        {puedeElegirProfesional && profesionales.length > 1 && (
          <div className="mb-5 flex flex-wrap gap-2">
            {profesionales.map((p) => (
              <Link
                key={p.id}
                href={link({ profesional: p.id, fecha })}
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                  activo?.id === p.id
                    ? "border-brand bg-brand text-brand-fg"
                    : "border-line bg-surface hover:bg-surface-2"
                }`}
              >
                {p.name}
              </Link>
            ))}
          </div>
        )}

        {/* Navegación por día */}
        <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-card">
          <Link
            href={link({ profesional: activo?.id, fecha: desplazar(-1) })}
            className="rounded-lg px-3 py-1.5 text-sm text-fg-muted transition hover:bg-surface-2 hover:text-fg"
            aria-label="Día anterior"
          >
            ←<span className="ml-1.5 hidden sm:inline">Anterior</span>
          </Link>

          <div className="text-center">
            <p className="font-medium capitalize">{fechaLarga}</p>
            {fecha !== hoyKey && (
              <Link
                href={link({ profesional: activo?.id, fecha: hoyKey })}
                className="text-xs text-brand hover:underline"
              >
                Volver a hoy
              </Link>
            )}
          </div>

          <Link
            href={link({ profesional: activo?.id, fecha: desplazar(1) })}
            className="rounded-lg px-3 py-1.5 text-sm text-fg-muted transition hover:bg-surface-2 hover:text-fg"
            aria-label="Día siguiente"
          >
            <span className="mr-1.5 hidden sm:inline">Siguiente</span>→
          </Link>
        </div>

        {detalles.length > 0 && (
          <p className="mb-4 text-sm text-fg-muted">
            <span className="tabular font-medium text-fg">{detalles.length}</span>{" "}
            turno{detalles.length === 1 ? "" : "s"} · {pendientes} por atender ·{" "}
            {atendidos} atendido{atendidos === 1 ? "" : "s"} · {ausentes} ausente
            {ausentes === 1 ? "" : "s"}
          </p>
        )}

        {!activo ? (
          <EmptyState>
            {puedeElegirProfesional ? (
              "Todavía no hay profesionales cargados."
            ) : (
              <>
                Tu usuario no está vinculado a una ficha de profesional. Pedile a
                la administración que lo asocie desde{" "}
                <span className="font-medium">Equipo</span>.
              </>
            )}
          </EmptyState>
        ) : detalles.length === 0 ? (
          <EmptyState>No hay turnos agendados para este día.</EmptyState>
        ) : (
          <Card padding={false} className="divide-y divide-line">
            {detalles.map((b) => (
              <article
                key={b.id}
                className="flex flex-wrap items-start gap-x-4 gap-y-3 p-4 sm:p-5"
              >
                <span className="tabular w-14 shrink-0 pt-0.5 text-sm font-medium text-fg-muted">
                  {toTimeLabel(b.startsAt, tenant.timezone)}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {b.client?.name ?? "Paciente"}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-fg-muted">
                    {b.service?.name} · {b.service?.durationMinutes} min
                  </p>
                  {b.client?.phone && (
                    <a
                      href={`tel:${b.client.phone}`}
                      className="mt-1 inline-block text-xs text-fg-subtle hover:text-brand"
                    >
                      {b.client.phone}
                    </a>
                  )}
                  {b.notes && (
                    <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-xs leading-relaxed text-fg-muted">
                      {b.notes}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {/* El estado del pago solo para quien administra */}
                    {veImportes && <PaymentBadge status={b.paymentStatus} />}
                    <StatusBadge status={b.status} />
                  </div>
                  {puedeMarcar && (
                    <AttendanceControls bookingId={b.id} status={b.status} />
                  )}
                </div>
              </article>
            ))}
          </Card>
        )}

        {!puedeElegirProfesional && detalles.length > 0 && (
          <Alert tone="info" className="mt-6">
            Para cancelar o reprogramar un turno, hablá con la administración.
            Desde acá solo se registra la asistencia.
          </Alert>
        )}
      </Page>

      <AppFooter tenant={tenant} />
    </>
  );
}
