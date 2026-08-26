import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AppHeader } from "@/components/app-shell";
import { BrandStyle } from "@/components/brand";
import { RegistroForm } from "@/components/auth-forms";
import { getSession } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/permissions";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crear cuenta",
  robots: { index: false, follow: false },
};

export default async function RegistroPage() {
  const sesion = getSession();
  if (sesion) redirect(homeFor(sesion));

  const tenant = await requireTenant();

  return (
    <>
      <BrandStyle tenant={tenant} />
      <AppHeader tenant={tenant} backTo="/login" backLabel="Volver al ingreso" />

      <main className="mx-auto flex max-w-md flex-col justify-center px-6 py-14">
        <h1 className="text-2xl font-semibold tracking-tight">Crear cuenta</h1>
        <p className="mb-7 mt-1.5 text-sm text-fg-muted">
          Con una cuenta ves todos tus turnos juntos y los gestionás sin
          depender del link de cada mensaje.
        </p>

        <RegistroForm />

        <p className="mt-8 text-xs leading-relaxed text-fg-subtle">
          Las cuentas son solo para pacientes. Si sos profesional del
          consultorio, tu usuario lo crea la administración.
        </p>
      </main>
    </>
  );
}
