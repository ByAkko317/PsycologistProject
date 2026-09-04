// Agenda del profesional (paso 11 del flujo).
//
// Misma pieza de listado y mismo modal que usa la administración, pero con
// menos capabilities: ve su día y marca asistencia. No ve importes ni estado
// de pago —saber si el paciente pagó puede condicionar el trato y no hace a su
// tarea— y no cancela ni reprograma, porque eso tiene consecuencias sobre el
// cobro y sobre la otra persona.
import Link from "next/link";
import type { Metadata } from "next";
import { AppFooter, AppHeader, Page, PageHeader } from "@/components/app-shell";
import { AgendaLista } from "@/components/agenda-lista";
import { BrandStyle } from "@/components/brand";
import { Buscador } from "@/components/listado";
import { Alert } from "@/components/ui";
import { requirePageSession } from "@/lib/auth/guards";
import { roleCan } from "@/lib/auth/permissions";
import { buscarTurnos } from "@/lib/services/agenda";
import { etiquetaDeDia, paraModal } from "@/lib/services/serializar";
import { requireTenant } from "@/lib/tenant";
import { toDateKey } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mi agenda",
  robots: { index: false, follow: false },
};

export default async function EmployeeAgenda({
  searchParams,
}: {
  searchParams: { fecha?: string; q?: string };
}) {
  const sesion = requirePageSession(["employee", "owner"], "/employee/agenda");
  const tenant = await requireTenant();

  const hoyKey = toDateKey(new Date(), tenant.timezone);
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.fecha ?? "")
    ? searchParams.fecha!
    : hoyKey;

  // Con búsqueda activa se mira toda la agenda, no solo el día: si alguien
  // busca un paciente, quiere encontrarlo esté donde esté.
  const buscando = Boolean(searchParams.q?.trim());

  const resultado = await buscarTurnos({
    tenant,
    sesion,
    q: searchParams.q,
    fecha: buscando ? undefined : fecha,
    rango: buscando ? "todos" : undefined,
  });

  const perms = {
    asistencia: roleCan(sesion.role, "bookings:attendance"),
    pagos: roleCan(sesion.role, "payments:manage"),
    verImportes: roleCan(sesion.role, "money:view"),
    verPaciente: roleCan(sesion.role, "clients:view:attended"),
  };

  const dias = resultado.dias.map((d) => ({
    fecha: d.fecha,
    etiqueta: etiquetaDeDia(d.fecha),
    turnos: d.turnos.map((t) => paraModal(t, tenant)),
  }));

  const todos = dias.flatMap((d) => d.turnos);
  const atendidos = todos.filter((t) => t.status === "completed").length;
  const ausentes = todos.filter((t) => t.status === "no_show").length;
  const pendientes = todos.filter(
    (t) => t.status === "confirmed" || t.status === "pending_payment"
  ).length;

  const link = (f: string) => `/employee/agenda?fecha=${f}`;
  const desplazar = (dias: number) =>
    new Date(new Date(`${fecha}T12:00:00Z`).getTime() + dias * 86_400_000)
      .toISOString()
      .slice(0, 10);

  const sinFicha = sesion.role === "employee" && !sesion.professionalId;

  return (
    <>
      <BrandStyle tenant={tenant} />
      <AppHeader
        tenant={tenant}
        subtitle="Agenda del profesional"
        backTo={sesion.role === "owner" ? "/admin" : undefined}
        backLabel="Volver al panel"
      />

      <Page>
        <PageHeader
          title="Mi agenda"
          description="Tocá un turno para ver el detalle y registrar la asistencia."
        />

        {sinFicha ? (
          <Alert tone="warn">
            Tu usuario no está vinculado a una ficha de profesional, así que no
            hay agenda para mostrar. Pedile a la administración que lo asocie
            desde <span className="font-medium">Equipo</span>.
          </Alert>
        ) : (
          <>
            <div className="mb-4">
              <Buscador
                placeholder="Buscar un paciente o servicio en toda mi agenda…"
                ayuda={
                  buscando
                    ? "Buscando en todas las fechas, no solo en este día."
                    : undefined
                }
              />
            </div>

            {!buscando && (
              <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-card">
                <Link
                  href={link(desplazar(-1))}
                  className="rounded-lg px-3 py-1.5 text-sm text-fg-muted transition hover:bg-surface-2 hover:text-fg"
                  aria-label="Día anterior"
                >
                  ←<span className="ml-1.5 hidden sm:inline">Anterior</span>
                </Link>

                <div className="text-center">
                  <p className="font-medium capitalize">
                    {etiquetaDeDia(fecha)}
                  </p>
                  {fecha !== hoyKey && (
                    <Link
                      href={link(hoyKey)}
                      className="text-xs text-brand hover:underline"
                    >
                      Volver a hoy
                    </Link>
                  )}
                </div>

                <Link
                  href={link(desplazar(1))}
                  className="rounded-lg px-3 py-1.5 text-sm text-fg-muted transition hover:bg-surface-2 hover:text-fg"
                  aria-label="Día siguiente"
                >
                  <span className="mr-1.5 hidden sm:inline">Siguiente</span>→
                </Link>
              </div>
            )}

            {todos.length > 0 && !buscando && (
              <p className="mb-4 text-sm text-fg-muted">
                <span className="tabular font-medium text-fg">
                  {todos.length}
                </span>{" "}
                turno{todos.length === 1 ? "" : "s"} · {pendientes} por atender ·{" "}
                {atendidos} atendido{atendidos === 1 ? "" : "s"} · {ausentes}{" "}
                ausente{ausentes === 1 ? "" : "s"}
              </p>
            )}

            <AgendaLista
              dias={dias}
              perms={perms}
              timezone={tenant.timezone}
              moneda={tenant.currency}
              vacio={
                buscando
                  ? `Ningún turno tuyo coincide con "${searchParams.q}".`
                  : "No tenés turnos agendados para este día."
              }
            />

            {!buscando && todos.length > 0 && (
              <Alert tone="info" className="mt-6">
                Para cancelar o reprogramar un turno, hablá con la
                administración. Desde acá se registra la asistencia y se dejan
                notas del paciente.
              </Alert>
            )}
          </>
        )}
      </Page>

      <AppFooter tenant={tenant} />
    </>
  );
}
