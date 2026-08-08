import Link from "next/link";
import type { Metadata } from "next";
import { LogoutButton } from "@/components/auth-forms";
import { getSession, homeForRole } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sin permiso",
  robots: { index: false, follow: false },
};

export default function SinPermiso() {
  const sesion = getSession();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-xl">
        🔒
      </span>
      <h1 className="mt-4 text-2xl font-bold">Esta sección no es para vos</h1>
      <p className="mt-2 text-slate-600">
        {sesion
          ? `Entraste como ${sesion.email}, y ese usuario no tiene permiso acá.`
          : "Necesitás iniciar sesión con un usuario que tenga permiso."}
      </p>

      <div className="mt-6 flex flex-col items-center gap-3">
        {sesion && (
          <Link
            href={homeForRole(sesion.role)}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg"
          >
            Ir a mi inicio
          </Link>
        )}
        {sesion ? (
          <LogoutButton />
        ) : (
          <Link href="/login" className="text-sm text-brand hover:underline">
            Iniciar sesión
          </Link>
        )}
      </div>
    </main>
  );
}
