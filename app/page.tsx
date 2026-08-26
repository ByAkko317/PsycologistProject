// Portada pública. No exige sesión: cualquiera puede ver los servicios y
// empezar a reservar. Los accesos privados solo aparecen si ya hay sesión, y
// con lo que ese rol puede hacer.
import Link from "next/link";
import { AppFooter, AppHeader, Page } from "@/components/app-shell";
import { BrandStyle } from "@/components/brand";
import { Card } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
import { homeFor, roleLabel } from "@/lib/auth/permissions";
import { db } from "@/lib/services/db";
import { formatMoney, requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function Home() {
  const tenant = await requireTenant();
  const sesion = getSession();
  const servicios = await db.listServices(tenant.id, { activeOnly: true });

  return (
    <>
      <BrandStyle tenant={tenant} />
      <AppHeader tenant={tenant} />

      <Page width="lg">
        {/* --- Presentación --- */}
        <section className="py-8 sm:py-14">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-brand">{tenant.name}</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
              Reservá tu turno
              <span className="block text-fg-muted">en menos de un minuto</span>
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-fg-muted">
              Elegí el servicio, el profesional y el horario que te quede
              cómodo. Te confirmamos al instante y te recordamos el día
              anterior.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/book"
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-3 text-sm font-medium text-brand-fg shadow-card transition hover:brightness-110"
              >
                Reservar un turno
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>

              {sesion ? (
                <Link
                  href={homeFor(sesion)}
                  className="inline-flex items-center rounded-lg border border-line bg-surface px-5 py-3 text-sm font-medium transition hover:bg-surface-2"
                >
                  Ir a mi panel · {roleLabel(sesion.role)}
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="inline-flex items-center rounded-lg border border-line bg-surface px-5 py-3 text-sm font-medium transition hover:bg-surface-2"
                >
                  Ya tengo cuenta
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* --- Servicios --- */}
        {servicios.length > 0 && (
          <section className="border-t border-line py-12">
            <h2 className="text-lg font-semibold tracking-tight">
              Lo que ofrecemos
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              Precios y duración de cada consulta.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {servicios.map((s) => (
                <Link key={s.id} href="/book" className="group">
                  <Card className="h-full transition group-hover:border-brand group-hover:shadow-raised">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-medium leading-snug">{s.name}</h3>
                      <span className="tabular shrink-0 text-sm font-semibold">
                        {formatMoney(s.price, tenant)}
                      </span>
                    </div>
                    {s.description && (
                      <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                        {s.description}
                      </p>
                    )}
                    <p className="mt-4 text-xs text-fg-subtle">
                      {s.durationMinutes} minutos
                      {s.depositPercent > 0 &&
                        ` · seña del ${s.depositPercent}% al reservar`}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* --- Cómo funciona --- */}
        <section className="border-t border-line py-12">
          <h2 className="text-lg font-semibold tracking-tight">
            Cómo funciona
          </h2>
          <ol className="mt-6 grid gap-6 sm:grid-cols-3">
            {[
              {
                n: "1",
                t: "Elegís",
                d: "Servicio, profesional y horario, entre los que están realmente libres.",
              },
              {
                n: "2",
                t: "Confirmás",
                d: "Si el servicio lleva seña, la abonás online de forma segura.",
              },
              {
                n: "3",
                t: "Te recordamos",
                d: "Recibís la confirmación y un recordatorio 24 horas antes.",
              },
            ].map((p) => (
              <li key={p.n}>
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-sm font-semibold text-brand">
                  {p.n}
                </span>
                <h3 className="mt-3 font-medium">{p.t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-fg-muted">
                  {p.d}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* --- Acceso del equipo --- */}
        {!sesion && (
          <section className="border-t border-line py-12">
            <Card className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-medium">¿Sos parte del consultorio?</h2>
                <p className="mt-1 text-sm text-fg-muted">
                  Profesionales y administración entran con su usuario.
                </p>
              </div>
              <Link
                href="/login"
                className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium transition hover:bg-surface-2"
              >
                Iniciar sesión
              </Link>
            </Card>
          </section>
        )}
      </Page>

      <AppFooter tenant={tenant} />
    </>
  );
}
