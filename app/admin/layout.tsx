// Chrome del panel del duenio: navegacion lateral + marca del tenant.
import Link from "next/link";
import type { Metadata } from "next";
import { BrandStyle } from "@/components/brand";
import { requireTenant } from "@/lib/tenant";

export const metadata: Metadata = {
  title: "Panel · Turnos",
  robots: { index: false, follow: false },
};

const SECCIONES = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/agenda", label: "Agenda" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/servicios", label: "Servicios" },
  { href: "/admin/marca", label: "Marca" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenant = await requireTenant();

  return (
    <>
      <BrandStyle tenant={tenant} />
      <div className="flex min-h-screen flex-col md:flex-row">
        <aside className="border-b bg-white md:w-60 md:shrink-0 md:border-b-0 md:border-r">
          <div className="flex items-center gap-2 px-6 py-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-xs font-bold text-brand-fg">
              {tenant.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{tenant.name}</p>
              <p className="text-xs text-slate-500">Panel del negocio</p>
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto px-4 pb-4 md:flex-col md:overflow-visible">
            {SECCIONES.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="shrink-0 rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              >
                {s.label}
              </Link>
            ))}
            <Link
              href="/employee/agenda"
              className="shrink-0 rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-100 md:mt-4 md:border-t md:pt-3"
            >
              Vista del empleado →
            </Link>
          </nav>
        </aside>

        <main className="flex-1 px-6 py-8">
          <div className="mx-auto max-w-4xl">{children}</div>
        </main>
      </div>
    </>
  );
}
