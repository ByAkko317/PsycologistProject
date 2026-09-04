// Ficha del paciente: datos, historial de turnos y notas clínicas.
//
// Es la pantalla que da sentido a la vista de pacientes: el seguimiento. El
// profesional entra desde su agenda, ve qué pasó en los turnos anteriores y
// deja la nota de la sesión.
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AppFooter, AppHeader, Page, PageHeader } from "@/components/app-shell";
import { AgendaLista } from "@/components/agenda-lista";
import { BrandStyle } from "@/components/brand";
import { Notas, type NotaVisible } from "@/components/notas";
import { Card, SectionTitle, Stat } from "@/components/ui";
import { requirePageSession } from "@/lib/auth/guards";
import { roleCan } from "@/lib/auth/permissions";
import { verPaciente } from "@/lib/services/patients";
import { etiquetaDeDia, paraModal } from "@/lib/services/serializar";
import { formatMoney, requireTenant } from "@/lib/tenant";
import { toDateKey } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ficha del paciente",
  robots: { index: false, follow: false },
};

export default async function FichaPaciente({
  params,
}: {
  params: { id: string };
}) {
  const sesion = requirePageSession(
    ["owner", "employee"],
    `/pacientes/${params.id}`
  );
  const tenant = await requireTenant();

  const detalle = await verPaciente(tenant, sesion, params.id);

  // verPaciente devuelve null tanto si el paciente no existe como si está
  // fuera del alcance del rol. Los dos casos terminan en 404: un 403
  // confirmaría que ese paciente existe en el consultorio.
  if (!detalle) notFound();

  const { client, turnos, notas, notasOcultas, puedeEscribirNota, veImportes } =
    detalle;

  const ahora = Date.now();
  const activos = turnos.filter((b) => b.status !== "cancelled");
  const atendidos = activos.filter((b) => b.status === "completed").length;
  const ausentes = activos.filter((b) => b.status === "no_show").length;
  const proximos = activos.filter(
    (b) => new Date(b.startsAt).getTime() >= ahora
  );
  const cobrado = activos.reduce((acc, b) => acc + b.amountPaid, 0);

  const perms = {
    asistencia: roleCan(sesion.role, "bookings:attendance"),
    pagos: roleCan(sesion.role, "payments:manage"),
    verImportes: veImportes,
    // Ya estamos en la ficha: el enlace del modal no aporta.
    verPaciente: false,
  };

  // Los turnos se agrupan por día para reusar el mismo listado que la agenda.
  const porDia = new Map<string, typeof turnos>();
  for (const b of turnos) {
    const key = toDateKey(b.startsAt, tenant.timezone);
    porDia.set(key, [...(porDia.get(key) ?? []), b]);
  }
  const dias = [...porDia.entries()].map(([fecha, lista]) => ({
    fecha,
    etiqueta: etiquetaDeDia(fecha),
    turnos: lista.map((t) => paraModal(t, tenant)),
  }));

  const fmt = new Intl.DateTimeFormat("es-AR", {
    timeZone: tenant.timezone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const notasVisibles: NotaVisible[] = notas.map((n) => ({
    id: n.id,
    body: n.body,
    autor: n.authorName,
    cuando: fmt.format(new Date(n.createdAt)),
    esMia: n.authorUserId === sesion.uid,
  }));

  return (
    <>
      <BrandStyle tenant={tenant} />
      <AppHeader tenant={tenant} subtitle="Ficha del paciente" backTo="/pacientes" />

      <Page width="lg">
        <PageHeader
          title={client.name}
          description={
            [client.email, client.phone].filter(Boolean).join(" · ") ||
            "Sin datos de contacto"
          }
          actions={
            <Link
              href="/pacientes"
              className="rounded-lg border border-line px-3.5 py-2 text-sm transition hover:bg-surface-2"
            >
              Volver al listado
            </Link>
          }
        />

        {/* --- Resumen --- */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Turnos" value={activos.length} />
          <Stat
            label="Asistió"
            value={atendidos}
            hint={`${ausentes} ausencia${ausentes === 1 ? "" : "s"}`}
          />
          <Stat label="Próximos" value={proximos.length} />
          {veImportes ? (
            <Stat label="Cobrado" value={formatMoney(cobrado, tenant)} />
          ) : (
            <Stat
              label="Paciente desde"
              value={new Intl.DateTimeFormat("es-AR", {
                timeZone: tenant.timezone,
                month: "short",
                year: "numeric",
              }).format(new Date(client.createdAt))}
            />
          )}
        </div>

        {/* --- Notas --- */}
        <section className="mt-10">
          <SectionTitle
            hint={
              puedeEscribirNota
                ? "Quedan firmadas con tu nombre y la fecha. Cada profesional lee solo las suyas; la administración las ve todas."
                : undefined
            }
          >
            Seguimiento
          </SectionTitle>

          <Notas
            clientId={client.id}
            notas={notasVisibles}
            puedeEscribir={puedeEscribirNota}
            ocultas={notasOcultas}
            soyAdmin={roleCan(sesion.role, "notes:read:all")}
          />
        </section>

        {/* --- Historial --- */}
        <section className="mt-10">
          <SectionTitle hint="Tocá un turno para ver el detalle.">
            Historial de turnos
          </SectionTitle>

          <AgendaLista
            dias={dias}
            perms={perms}
            timezone={tenant.timezone}
            moneda={tenant.currency}
            vacio="Este paciente todavía no tiene turnos."
          />
        </section>

        {/* --- Notas internas del alta --- */}
        {client.notes && (
          <section className="mt-10">
            <SectionTitle hint="Cargado al crear el paciente.">
              Observación administrativa
            </SectionTitle>
            <Card>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg-muted">
                {client.notes}
              </p>
            </Card>
          </section>
        )}
      </Page>

      <AppFooter tenant={tenant} />
    </>
  );
}
