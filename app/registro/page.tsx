import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { BrandStyle } from "@/components/brand";
import { RegistroForm } from "@/components/auth-forms";
import { getSession, homeForRole } from "@/lib/auth/session";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crear cuenta",
  robots: { index: false, follow: false },
};

export default async function RegistroPage() {
  const sesion = getSession();
  if (sesion) redirect(homeForRole(sesion.role));

  const tenant = await requireTenant();

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

        <h1 className="text-2xl font-bold">Crear cuenta</h1>
        <p className="mb-6 mt-1 text-sm text-slate-600">
          Con una cuenta ves todos tus turnos juntos y los gestionás sin
          depender del link del mensaje.
        </p>

        <RegistroForm />

        <p className="mt-8 text-xs text-slate-500">
          Las cuentas son solo para pacientes. Si sos profesional del
          consultorio, tu usuario lo crea la administración.
        </p>
      </main>
    </>
  );
}
