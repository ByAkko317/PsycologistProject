import Link from "next/link";
import type { Metadata } from "next";
import { LogoutButton } from "@/components/auth-forms";
import { getSession } from "@/lib/auth/session";
import { homeFor, roleLabel } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sin permiso",
  robots: { index: false, follow: false },
};

export default function SinPermiso() {
  const sesion = getSession();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
      <span
        className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-surface-2 text-fg-muted"
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          className="h-6 w-6"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </span>

      <h1 className="mt-5 text-2xl font-semibold tracking-tight">
        Esta sección no es para vos
      </h1>
      <p className="mt-2 text-fg-muted">
        {sesion
          ? `Entraste como ${sesion.email} (${roleLabel(sesion.role)}), y ese usuario no tiene permiso acá.`
          : "Necesitás iniciar sesión con un usuario que tenga permiso."}
      </p>

      <div className="mt-7 flex flex-col items-center gap-3">
        <Link
          href={homeFor(sesion)}
          className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-fg transition hover:brightness-110"
        >
          {sesion ? "Ir a mi inicio" : "Ir al inicio"}
        </Link>
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
