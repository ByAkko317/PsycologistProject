import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AppHeader } from "@/components/app-shell";
import { BrandStyle } from "@/components/brand";
import { LoginForm } from "@/components/auth-forms";
import { Card } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/permissions";
import { resolveDataProvider } from "@/lib/config";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Iniciar sesión",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const sesion = getSession();
  if (sesion) redirect(homeFor(sesion));

  const tenant = await requireTenant();
  const esDemo = resolveDataProvider() === "mock";

  return (
    <>
      <BrandStyle tenant={tenant} />
      <AppHeader tenant={tenant} backTo="/" backLabel="Volver al inicio" />

      <main className="mx-auto flex max-w-md flex-col justify-center px-6 py-14">
        <h1 className="text-2xl font-semibold tracking-tight">
          Iniciar sesión
        </h1>
        <p className="mb-7 mt-1.5 text-sm text-fg-muted">
          Pacientes, profesionales y administración entran por acá.
        </p>

        <LoginForm next={searchParams.next} />

        {esDemo && (
          <Card className="mt-8">
            <p className="text-sm font-medium">Cuentas de demostración</p>
            <p className="mt-1 text-xs text-fg-subtle">
              Datos de ejemplo en memoria. Contraseña para todas:{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5">
                demo1234
              </code>
            </p>
            <ul className="mt-3 space-y-1.5 text-xs">
              {[
                ["admin@demo.test", "Administración"],
                ["ana@demo.test", "Profesional"],
                ["sofia@ejemplo.test", "Paciente"],
              ].map(([mail, rol]) => (
                <li key={mail} className="flex justify-between gap-3">
                  <code className="text-fg-muted">{mail}</code>
                  <span className="shrink-0 text-fg-subtle">{rol}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <p className="mt-8 text-center text-sm text-fg-muted">
          ¿Solo querés reservar?{" "}
          <Link href="/book" className="text-brand hover:underline">
            Reservá sin cuenta
          </Link>
        </p>
      </main>
    </>
  );
}
