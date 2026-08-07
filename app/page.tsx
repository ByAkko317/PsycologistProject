import Link from "next/link";

const accesos = [
  {
    href: "/book",
    titulo: "Reservar un turno",
    detalle: "Flujo publico del cliente: servicio, profesional, horario y confirmacion.",
    rol: "Cliente",
  },
  {
    href: "/portal",
    titulo: "Mis turnos",
    detalle: "Autogestion: ver, cancelar o reprogramar un turno ya reservado.",
    rol: "Cliente",
  },
  {
    href: "/employee/agenda",
    titulo: "Agenda del dia",
    detalle: "Vista del profesional: turnos asignados y marcado de asistencia.",
    rol: "Empleado",
  },
  {
    href: "/admin",
    titulo: "Panel de administracion",
    detalle: "Resumen, agenda completa, clientes, servicios y marca del negocio.",
    rol: "Duenio",
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <span className="inline-flex rounded-full bg-brand px-4 py-1 text-xs font-semibold uppercase tracking-wide text-brand-fg">
        MVP
      </span>

      <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
        Turnos
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-600">
        Plataforma de reservas white-label. Cada negocio gestiona su agenda con
        su propio logo y colores, con recordatorios automaticos y cobro de senia
        online.
      </p>

      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {accesos.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group rounded-xl border bg-white p-6 transition hover:border-brand hover:shadow-md"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {a.rol}
            </span>
            <h2 className="mt-2 text-lg font-semibold group-hover:text-brand">
              {a.titulo}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{a.detalle}</p>
          </Link>
        ))}
      </div>

      <footer className="mt-16 border-t pt-6 text-sm text-slate-500">
        Proveedor de datos activo:{" "}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
          {process.env.NEXT_PUBLIC_DATA_PROVIDER ?? "mock"}
        </code>
      </footer>
    </main>
  );
}
