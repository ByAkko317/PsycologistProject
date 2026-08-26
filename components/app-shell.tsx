// =============================================================================
// Chrome compartido por toda la app: header con marca, navegación por rol,
// vuelta al inicio, tema y sesión.
//
// Se usa en TODAS las pantallas para que el usuario nunca quede sin salida.
// =============================================================================

import Link from "next/link";
import { ThemeToggle } from "@/components/theme";
import { UserMenu } from "@/components/user-menu";
import { getSession } from "@/lib/auth/session";
import { homeFor, navFor, roleLabel } from "@/lib/auth/permissions";
import type { Tenant } from "@/lib/types";

/** Iniciales del negocio como fallback cuando no hay logo cargado. */
function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function BrandMark({
  tenant,
  size = "md",
}: {
  tenant: Pick<Tenant, "name" | "logoUrl">;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-8 w-8 text-[11px]" : "h-9 w-9 text-xs";
  return tenant.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={tenant.logoUrl}
      alt=""
      className={`${dim} shrink-0 rounded-lg object-cover`}
    />
  ) : (
    <span
      className={`${dim} grid shrink-0 place-items-center rounded-lg bg-brand font-bold tracking-wide text-brand-fg`}
      aria-hidden
    >
      {iniciales(tenant.name)}
    </span>
  );
}

/**
 * Header principal.
 *
 * El logo siempre es un link. Es el gesto que la gente ya tiene aprendido de
 * cualquier sitio, y evita que la única salida sea el botón "atrás" del
 * navegador — que en medio de un flujo de reserva puede reenviar un formulario.
 */
export async function AppHeader({
  tenant,
  subtitle,
  /** Si se pasa, aparece una flecha explícita de retroceso a esa ruta. */
  backTo,
  backLabel = "Volver",
}: {
  tenant: Tenant;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
}) {
  const sesion = getSession();
  const items = navFor(sesion);
  const inicio = homeFor(sesion);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        {backTo && (
          <Link
            href={backTo}
            aria-label={backLabel}
            title={backLabel}
            className="-ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-fg-muted transition hover:bg-surface-2 hover:text-fg"
          >
            <FlechaIzquierda />
          </Link>
        )}

        <Link
          href={inicio}
          className="flex min-w-0 items-center gap-2.5 rounded-lg transition hover:opacity-80"
          aria-label={`${tenant.name} — ir al inicio`}
        >
          <BrandMark tenant={tenant} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-tight">
              {tenant.name}
            </span>
            {subtitle && (
              <span className="block truncate text-xs text-fg-subtle">
                {subtitle}
              </span>
            )}
          </span>
        </Link>

        {/* Navegación por rol. En pantallas chicas se va al menú de usuario. */}
        {items.length > 0 && (
          <nav className="ml-4 hidden items-center gap-0.5 md:flex">
            {items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className="rounded-lg px-3 py-1.5 text-sm text-fg-muted transition hover:bg-surface-2 hover:text-fg"
              >
                {i.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {sesion ? (
            <UserMenu
              name={sesion.name}
              email={sesion.email}
              role={roleLabel(sesion.role)}
              items={items}
            />
          ) : (
            <Link
              href="/login"
              className="rounded-lg border border-line px-3.5 py-1.5 text-sm font-medium text-fg transition hover:bg-surface-2"
            >
              Iniciar sesión
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

/** Contenedor estándar del contenido. Ancho fijo por tipo de pantalla. */
export function Page({
  children,
  width = "md",
  className = "",
}: {
  children: React.ReactNode;
  width?: "sm" | "md" | "lg";
  className?: string;
}) {
  const max = { sm: "max-w-xl", md: "max-w-3xl", lg: "max-w-6xl" }[width];
  return (
    <main className={`mx-auto ${max} px-4 py-8 sm:px-6 sm:py-10 ${className}`}>
      {children}
    </main>
  );
}

/** Encabezado de página: título, bajada y acciones a la derecha. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[1.6rem] font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-fg-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Pie discreto con la vuelta al inicio siempre disponible. */
export function AppFooter({ tenant }: { tenant: Pick<Tenant, "name"> }) {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-fg-subtle sm:px-6">
        <span>{tenant.name}</span>
        <Link href="/" className="transition hover:text-fg">
          Volver al inicio
        </Link>
      </div>
    </footer>
  );
}

function FlechaIzquierda() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
      aria-hidden
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}
