import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { BrandStyle } from "@/components/brand";
import { LoginForm } from "@/components/auth-forms";
import { getSession, homeForRole } from "@/lib/auth/session";
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
  // Si ya hay sesión, no tiene sentido mostrar el formulario.
  const sesion = getSession();
  if (sesion) redirect(homeForRole(sesion.role));

  const tenant = await requireTenant();
  const esDemo = resolveDataProvider() === "mock";

  return (
    <>
      <BrandStyle tenant={tenant} />
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <Link href="/" className="mb-8 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-fg">
            {tenant.name.slice(0, 2).toUpperCase()}
          </span>
          <span className="font-semibold">{tenant.name}</span>
        </Link>

        <h1 className="text-2xl font-bold">Iniciar sesión</h1>
        <p className="mb-6 mt-1 text-sm text-slate-600">
          Pacientes, profesionales y administración entran por acá.
        </p>

        <LoginForm next={searchParams.next} />

        {esDemo && (
          <div className="mt-8 rounded-xl border border-dashed bg-white p-4 text-sm">
            <p className="font-medium">Cuentas de demostración</p>
            <p className="mt-1 text-xs text-slate-500">
              Datos de ejemplo en memoria. Contraseña para todas:{" "}
              <code className="rounded bg-slate-100 px-1">demo1234</code>
            </p>
            <ul className="mt-3 space-y-1 font-mono text-xs text-slate-600">
              <li>admin@demo.test — dueño</li>
              <li>ana@demo.test — profesional</li>
              <li>sofia@ejemplo.test — paciente</li>
            </ul>
          </div>
        )}

        <p className="mt-8 text-center text-sm text-slate-500">
          ¿Solo querés reservar?{" "}
          <Link href="/book" className="text-brand hover:underline">
            Reservá sin cuenta
          </Link>
        </p>
      </main>
    </>
  );
}
