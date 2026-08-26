"use client";

// Menú de la sesión: identidad, navegación en pantallas chicas y cierre.
// Los ítems llegan ya filtrados por rol desde el servidor: este componente no
// decide permisos, solo dibuja lo que le pasan.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { NavItem } from "@/lib/auth/permissions";

export function UserMenu({
  name,
  email,
  role,
  items,
}: {
  name: string;
  email: string;
  role: string;
  items: NavItem[];
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  // Cerrar al hacer click afuera o con Escape: sin esto el menú queda pegado y
  // tapa contenido, que en mobile es especialmente molesto.
  useEffect(() => {
    if (!abierto) return;

    const alClick = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };

    document.addEventListener("mousedown", alClick);
    document.addEventListener("keydown", alTeclado);
    return () => {
      document.removeEventListener("mousedown", alClick);
      document.removeEventListener("keydown", alTeclado);
    };
  }, [abierto]);

  const iniciales = name
    .split(/\s+/)
    .filter((p) => p.length > 2)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        className="flex items-center gap-2 rounded-lg border border-line py-1 pl-1 pr-2 transition hover:bg-surface-2"
      >
        <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-soft text-[11px] font-semibold text-brand">
          {iniciales || name.slice(0, 2).toUpperCase()}
        </span>
        <span className="hidden max-w-[9rem] truncate text-sm sm:block">
          {name}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3.5 w-3.5 text-fg-subtle transition ${abierto ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {abierto && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-60 animate-fade-in overflow-hidden rounded-xl border border-line bg-overlay shadow-pop"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-fg-subtle">{email}</p>
            <span className="mt-1.5 inline-flex rounded-md bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
              {role}
            </span>
          </div>

          {/* En md+ estos links ya están en el header; acá cubren mobile. */}
          {items.length > 0 && (
            <div className="border-b border-line py-1 md:hidden">
              {items.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  onClick={() => setAbierto(false)}
                  className="block px-4 py-2 text-sm text-fg-muted transition hover:bg-surface-2 hover:text-fg"
                >
                  {i.label}
                </Link>
              ))}
            </div>
          )}

          <div className="py-1">
            <Link
              href="/"
              onClick={() => setAbierto(false)}
              className="block px-4 py-2 text-sm text-fg-muted transition hover:bg-surface-2 hover:text-fg"
            >
              Ir al inicio
            </Link>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="w-full px-4 py-2 text-left text-sm text-danger transition hover:bg-danger-soft"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
