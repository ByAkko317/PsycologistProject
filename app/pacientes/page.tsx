// Listado de pacientes, compartido por administración y profesionales.
//
// Una sola ruta para los dos roles: el alcance lo resuelve buscarPacientes()
// según la sesión. Duplicar la vista por rol es como se terminan escribiendo
// dos reglas de privacidad que divergen.
import Link from "next/link";
import type { Metadata } from "next";
import { AppFooter, AppHeader, Page, PageHeader } from "@/components/app-shell";
import { BrandStyle } from "@/components/brand";
import { Buscador, FiltroChips, Paginado } from "@/components/listado";
import { Alert, Card, EmptyState } from "@/components/ui";
import { requirePageSession } from "@/lib/auth/guards";
import { buscarPacientes } from "@/lib/services/patients";
import { formatMoney, requireTenant } from "@/lib/tenant";
import { formatBookingDate } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pacientes",
  robots: { index: false, follow: false },
};

const FILTROS = [
  { value: "todos", label: "Todos" },
  { value: "activos", label: "Con turno próximo" },
  { value: "sin-turnos", label: "Sin turnos" },
];

export default async function PacientesPage({
  searchParams,
}: {
  searchParams: { q?: string; pagina?: string; filtro?: string };
}) {
  const sesion = requirePageSession(["owner", "employee"], "/pacientes");
  const tenant = await requireTenant();

  const resultado = await buscarPacientes({
    tenant,
    sesion,
    q: searchParams.q,
    pagina: Number(searchParams.pagina) || 1,
    filtro: searchParams.filtro,
  });

  return (
    <>
      <BrandStyle tenant={tenant} />
      <AppHeader
        tenant={tenant}
        subtitle="Pacientes"
        backTo={sesion.role === "owner" ? "/admin" : "/employee/agenda"}
      />

      <Page width="lg">
        <PageHeader
          title="Pacientes"
          description={
            resultado.alcanceLimitado
              ? "Los pacientes que atendiste al menos una vez."
              : "Todos los pacientes del consultorio."
          }
        />

        <div className="mb-5 space-y-3">
          <Buscador
            placeholder="Buscar por nombre, email o teléfono…"
            ayuda="El teléfono se encuentra con o sin espacios y guiones."
          />
          <FiltroChips
            nombre="filtro"
            opciones={FILTROS}
            actual={searchParams.filtro ?? "todos"}
          />
        </div>

        <div className="mb-4">
          <Paginado
            pagina={resultado.pagina}
            paginas={resultado.paginas}
            total={resultado.total}
            etiqueta="paciente"
          />
        </div>

        {resultado.filas.length === 0 ? (
          <EmptyState>
            {searchParams.q
              ? `Ningún paciente coincide con "${searchParams.q}".`
              : resultado.alcanceLimitado
                ? "Todavía no atendiste a ningún paciente."
                : "Todavía no hay pacientes registrados. Se crean solos al reservar."}
          </EmptyState>
        ) : (
          <Card padding={false} className="divide-y divide-line">
            {resultado.filas.map(
              ({ client, turnos, atendidos, ultimoTurno, proximoTurno, cobrado }) => (
                <Link
                  key={client.id}
                  href={`/pacientes/${client.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 transition hover:bg-surface-2 sm:px-5"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
                    {client.name
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((p) => p[0])
                      .join("")
                      .toUpperCase()}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {client.name}
                    </span>
                    <span className="block truncate text-sm text-fg-muted">
                      {[client.email, client.phone].filter(Boolean).join(" · ") ||
                        "Sin datos de contacto"}
                    </span>
                  </span>

                  <span className="shrink-0 text-right text-sm">
                    {proximoTurno ? (
                      <span className="block text-brand">
                        Próximo:{" "}
                        {formatBookingDate(proximoTurno, tenant.timezone)}
                      </span>
                    ) : ultimoTurno ? (
                      <span className="block text-fg-muted">
                        Último: {formatBookingDate(ultimoTurno, tenant.timezone)}
                      </span>
                    ) : (
                      <span className="block text-fg-subtle">Sin turnos</span>
                    )}
                    <span className="tabular block text-xs text-fg-subtle">
                      {turnos} turno{turnos === 1 ? "" : "s"} · {atendidos}{" "}
                      atendido{atendidos === 1 ? "" : "s"}
                      {cobrado !== null && ` · ${formatMoney(cobrado, tenant)}`}
                    </span>
                  </span>

                  <span className="text-fg-subtle" aria-hidden>
                    ›
                  </span>
                </Link>
              )
            )}
          </Card>
        )}

        {resultado.paginas > 1 && (
          <div className="mt-6">
            <Paginado
              pagina={resultado.pagina}
              paginas={resultado.paginas}
              total={resultado.total}
              etiqueta="paciente"
            />
          </div>
        )}

        {resultado.alcanceLimitado && resultado.total > 0 && (
          <Alert tone="info" className="mt-6">
            Ves solo a los pacientes que atendiste. Las notas que escribas son
            privadas: las leen únicamente vos y la administración.
          </Alert>
        )}
      </Page>

      <AppFooter tenant={tenant} />
    </>
  );
}
