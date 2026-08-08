// Agenda del profesional: sus turnos del dia y marcado de asistencia (paso 11).
import Link from "next/link";
import type { Metadata } from "next";
import { BrandHeader, BrandStyle } from "@/components/brand";
import { AttendanceControls } from "@/components/attendance-controls";
import { LogoutButton } from "@/components/auth-forms";
import { Card, EmptyState, PaymentBadge, StatusBadge } from "@/components/ui";
import { requirePageSession } from "@/lib/auth/guards";
import { db, expandBookings } from "@/lib/services/db";
import { requireTenant } from "@/lib/tenant";
import { toDateKey, toTimeLabel } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mi agenda · Turnos",
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

  // El duenio puede mirar la agenda de cualquiera; el profesional, solo la
  // suya. El ?profesional= de la URL se ignora para el rol employee.
  const puedeElegir = sesion.role === "owner";
  const activo = puedeElegir
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

  const detalles = (await expandBookings(tenant.id, bookings)).filter(
    (b) => toDateKey(b.startsAt, tenant.timezone) === fecha
  );

  const link = (params: { profesional?: string; fecha?: string }) => {
    const qs = new URLSearchParams();
    if (params.profesional) qs.set("profesional", params.profesional);
    if (params.fecha) qs.set("fecha", params.fecha);
    return `/employee/agenda?${qs.toString()}`;
  };

  const desplazar = (dias: number) =>
    new Date(new Date(`${fecha}T12:00:00Z`).getTime() + dias * 86_400_000)
      .toISOString()
      .slice(0, 10);

  const atendidos = detalles.filter((b) => b.status === "completed").length;
  const ausentes = detalles.filter((b) => b.status === "no_show").length;

  return (
    <>
      <BrandStyle tenant={tenant} />
      <BrandHeader tenant={tenant} subtitle="Agenda del profesional" />

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {puedeElegir ? (
            <div className="flex flex-wrap gap-2">
              {profesionales.map((p) => (
                <Link
                  key={p.id}
                  href={link({ profesional: p.id, fecha })}
                  className={`rounded-full border px-3 py-1 text-sm transition ${
                    activo?.id === p.id
                      ? "border-brand bg-brand text-brand-fg"
                      : "bg-white hover:border-brand"
                  }`}
                >
                  {p.name}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm font-medium">{sesion.name}</p>
          )}

          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="truncate">{sesion.email}</span>
            <LogoutButton className="text-xs text-slate-500 hover:text-slate-900" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Link
            href={link({ profesional: activo?.id, fecha: desplazar(-1) })}
            className="rounded-lg border bg-white px-3 py-1.5 text-sm hover:border-brand"
          >
            ← Día anterior
          </Link>

          <div className="text-center">
            <p className="font-semibold">
              {new Intl.DateTimeFormat("es-AR", {
                timeZone: "UTC",
                weekday: "long",
                day: "numeric",
                month: "long",
              }).format(new Date(`${fecha}T12:00:00Z`))}
            </p>
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
            className="rounded-lg border bg-white px-3 py-1.5 text-sm hover:border-brand"
          >
            Día siguiente →
          </Link>
        </div>

        {detalles.length > 0 && (
          <p className="text-sm text-slate-500">
            {detalles.length} turno{detalles.length === 1 ? "" : "s"} ·{" "}
            {atendidos} atendido{atendidos === 1 ? "" : "s"} · {ausentes}{" "}
            ausente{ausentes === 1 ? "" : "s"}
          </p>
        )}

        {!activo ? (
          <EmptyState>
            {puedeElegir
              ? "No hay profesionales cargados."
              : "Tu usuario todavía no está vinculado a una ficha de profesional. Pedile a la administración que lo asocie."}
          </EmptyState>
        ) : detalles.length === 0 ? (
          <EmptyState>
            {activo.name} no tiene turnos ese día.
          </EmptyState>
        ) : (
          <Card className="divide-y p-0">
            {detalles.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4"
              >
                <span className="w-14 shrink-0 font-mono text-sm text-slate-600">
                  {toTimeLabel(b.startsAt, tenant.timezone)}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {b.client?.name ?? "Cliente"}
                  </p>
                  <p className="truncate text-sm text-slate-500">
                    {b.service?.name} · {b.service?.durationMinutes} min
                  </p>
                  {b.client?.phone && (
                    <p className="text-xs text-slate-400">{b.client.phone}</p>
                  )}
                  {b.notes && (
                    <p className="mt-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
                      {b.notes}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className="flex gap-2">
                    <PaymentBadge status={b.paymentStatus} />
                    <StatusBadge status={b.status} />
                  </div>
                  <AttendanceControls
                    bookingId={b.id}
                    tenantSlug={tenant.slug}
                    status={b.status}
                  />
                </div>
              </div>
            ))}
          </Card>
        )}
      </main>
    </>
  );
}
