"use client";

// Navegación por rol, con la sección actual marcada.
//
// En escritorio va dentro del header. En pantallas chicas es una franja propia
// debajo del header, con scroll horizontal: esconderla en el menú de usuario
// obligaba a dos toques para cambiar de sección, y es lo que más se hace en
// el panel.

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/auth/permissions";

/** "/admin" solo se marca en "/admin"; las demás también en sus subrutas. */
function esActual(pathname: string, href: string, items: NavItem[]): boolean {
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;
  // Si otro ítem es más específico (ej. /admin/agenda contra /admin), gana él.
  return !items.some(
    (i) =>
      i.href !== href &&
      i.href.startsWith(href) &&
      (pathname === i.href || pathname.startsWith(`${i.href}/`))
  );
}

export function NavLinks({
  items,
  variante,
}: {
  items: NavItem[];
  variante: "header" | "franja";
}) {
  const pathname = usePathname() ?? "";

  if (variante === "header") {
    return (
      <nav className="ml-4 hidden items-center gap-0.5 md:flex">
        {items.map((i) => {
          const actual = esActual(pathname, i.href, items);
          return (
            <Link
              key={i.href}
              href={i.href}
              aria-current={actual ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm transition hover:bg-surface-2 hover:text-fg ${
                actual ? "bg-surface-2 font-medium text-fg" : "text-fg-muted"
              }`}
            >
              {i.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Secciones"
      className="border-t border-line md:hidden"
    >
      <div className="no-scrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 py-1.5">
        {items.map((i) => {
          const actual = esActual(pathname, i.href, items);
          return (
            <Link
              key={i.href}
              href={i.href}
              aria-current={actual ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ${
                actual
                  ? "bg-brand-soft font-medium text-brand"
                  : "text-fg-muted hover:bg-surface-2 hover:text-fg"
              }`}
            >
              {i.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
