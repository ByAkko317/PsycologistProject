"use client";

// =============================================================================
// Flujo de reserva del cliente — 4 pasos (pasos 1 a 6 del flujo del PDF).
//   1. Servicio  2. Profesional  3. Dia y horario  4. Datos y confirmacion
// La disponibilidad se pide siempre al servidor: el navegador nunca decide
// que horario esta libre.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AvailabilitySlot,
  Professional,
  Service,
  Tenant,
} from "@/lib/types";

interface Props {
  tenant: Pick<
    Tenant,
    "id" | "slug" | "name" | "currency" | "timezone" | "cancellationHours"
  >;
  services: Service[];
  professionals: Professional[];
  /** Proximas fechas "YYYY-MM-DD" ya calculadas en la timezone del negocio. */
  dateOptions: { key: string; label: string; weekday: number }[];
}

type Paso = 1 | 2 | 3 | 4;

const PASOS = [
  { n: 1, titulo: "Servicio" },
  { n: 2, titulo: "Profesional" },
  { n: 3, titulo: "Dia y hora" },
  { n: 4, titulo: "Tus datos" },
] as const;

export function BookingWizard({
  tenant,
  services,
  professionals,
  dateOptions,
}: Props) {
  const router = useRouter();

  const [paso, setPaso] = useState<Paso>(1);
  const [serviceId, setServiceId] = useState<string>("");
  const [professionalId, setProfessionalId] = useState<string>("");
  const [dateKey, setDateKey] = useState<string>("");
  const [slot, setSlot] = useState<AvailabilitySlot | null>(null);

  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [cargandoSlots, setCargandoSlots] = useState(false);

  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [notas, setNotas] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const money = useMemo(
    () =>
      new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: tenant.currency || "ARS",
        maximumFractionDigits: 0,
      }),
    [tenant.currency]
  );

  const service = services.find((s) => s.id === serviceId) ?? null;
  const professional =
    professionals.find((p) => p.id === professionalId) ?? null;

  const profesionalesDelServicio = useMemo(
    () =>
      serviceId
        ? professionals.filter((p) => p.serviceIds.includes(serviceId))
        : [],
    [professionals, serviceId]
  );

  const senia = service
    ? Math.round((service.price * Math.min(service.depositPercent, 100)) / 100)
    : 0;

  // --- Carga de disponibilidad ---------------------------------------------
  const cargarSlots = useCallback(
    async (fecha: string) => {
      if (!serviceId || !professionalId || !fecha) return;
      setCargandoSlots(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          tenant: tenant.slug,
          serviceId,
          professionalId,
          date: fecha,
        });
        const res = await fetch(`/api/availability?${qs}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Error de disponibilidad");
        setSlots(data.slots as AvailabilitySlot[]);
      } catch (e) {
        setSlots([]);
        setError(
          e instanceof Error ? e.message : "No se pudo cargar la disponibilidad"
        );
      } finally {
        setCargandoSlots(false);
      }
    },
    [professionalId, serviceId, tenant.slug]
  );

  useEffect(() => {
    if (paso === 3 && dateKey) void cargarSlots(dateKey);
  }, [paso, dateKey, cargarSlots]);

  // --- Navegacion -----------------------------------------------------------
  function elegirServicio(s: Service) {
    setServiceId(s.id);
    setProfessionalId("");
    setSlot(null);
    setSlots([]);
    setPaso(2);
  }

  function elegirProfesional(p: Professional) {
    setProfessionalId(p.id);
    setSlot(null);
    setSlots([]);
    const primera = dateOptions[0]?.key ?? "";
    setDateKey(primera);
    setPaso(3);
  }

  function elegirSlot(s: AvailabilitySlot) {
    setSlot(s);
    setPaso(4);
  }

  async function confirmar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!service || !professional || !slot) return;

    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant: tenant.slug,
          serviceId: service.id,
          professionalId: professional.id,
          startsAt: slot.startsAt,
          notes: notas || undefined,
          client: {
            name: nombre,
            email: email || undefined,
            phone: telefono || undefined,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear el turno");

      // Si hay senia, el checkout de Mercado Pago se abre aca (paso 5).
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl as string;
        return;
      }
      router.push(`/book/gracias?token=${data.token}&tenant=${tenant.slug}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setEnviando(false);
    }
  }

  const puedeConfirmar =
    nombre.trim().length > 1 && (email.trim() !== "" || telefono.trim() !== "");

  // --- Render ---------------------------------------------------------------
  return (
    <div className="space-y-6">
      <Stepper paso={paso} onVolver={(n) => n < paso && setPaso(n as Paso)} />

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      {/* Paso 1 — Servicio */}
      {paso === 1 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Elegí el servicio</h2>
          {services.length === 0 && (
            <p className="rounded-xl border border-dashed bg-white p-6 text-sm text-slate-500">
              Todavía no hay servicios cargados para este negocio.
            </p>
          )}
          {services.map((s) => (
            <button
              key={s.id}
              onClick={() => elegirServicio(s)}
              className="flex w-full items-start justify-between gap-4 rounded-xl border bg-white p-5 text-left transition hover:border-brand hover:shadow-sm"
            >
              <span>
                <span className="block font-medium">{s.name}</span>
                {s.description && (
                  <span className="mt-0.5 block text-sm text-slate-500">
                    {s.description}
                  </span>
                )}
                <span className="mt-2 block text-xs text-slate-500">
                  {s.durationMinutes} min
                  {s.depositPercent > 0 &&
                    ` · seña del ${s.depositPercent}% al reservar`}
                </span>
              </span>
              <span className="shrink-0 font-semibold">
                {money.format(s.price)}
              </span>
            </button>
          ))}
        </section>
      )}

      {/* Paso 2 — Profesional */}
      {paso === 2 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Elegí el profesional</h2>
          {profesionalesDelServicio.length === 0 && (
            <p className="rounded-xl border border-dashed bg-white p-6 text-sm text-slate-500">
              No hay profesionales habilitados para este servicio.
            </p>
          )}
          {profesionalesDelServicio.map((p) => (
            <button
              key={p.id}
              onClick={() => elegirProfesional(p)}
              className="flex w-full items-center gap-4 rounded-xl border bg-white p-5 text-left transition hover:border-brand hover:shadow-sm"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-fg">
                {p.name
                  .split(" ")
                  .filter((w) => w.length > 2)
                  .slice(-2)
                  .map((w) => w[0])
                  .join("")}
              </span>
              <span>
                <span className="block font-medium">{p.name}</span>
                <span className="text-sm text-slate-500">
                  {p.serviceIds.length} servicio
                  {p.serviceIds.length === 1 ? "" : "s"} disponible
                  {p.serviceIds.length === 1 ? "" : "s"}
                </span>
              </span>
            </button>
          ))}
        </section>
      )}

      {/* Paso 3 — Dia y horario */}
      {paso === 3 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Elegí día y horario</h2>

          <div className="flex gap-2 overflow-x-auto pb-2">
            {dateOptions.map((d) => (
              <button
                key={d.key}
                onClick={() => {
                  setDateKey(d.key);
                  setSlot(null);
                }}
                className={`shrink-0 rounded-lg border px-4 py-2 text-sm transition ${
                  dateKey === d.key
                    ? "border-brand bg-brand text-brand-fg"
                    : "bg-white hover:border-brand"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          {cargandoSlots ? (
            <p className="text-sm text-slate-500">Buscando horarios libres…</p>
          ) : slots.filter((s) => s.available).length === 0 ? (
            <p className="rounded-xl border border-dashed bg-white p-6 text-sm text-slate-500">
              No quedan horarios disponibles ese día con{" "}
              {professional?.name ?? "el profesional"}. Probá con otra fecha.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {slots.map((s) => (
                <button
                  key={s.startsAt}
                  disabled={!s.available}
                  onClick={() => elegirSlot(s)}
                  className={`rounded-lg border py-2 text-sm transition ${
                    s.available
                      ? "bg-white hover:border-brand hover:text-brand"
                      : "cursor-not-allowed bg-slate-100 text-slate-300 line-through"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Paso 4 — Datos y resumen */}
      {paso === 4 && service && professional && slot && (
        <section className="space-y-5">
          <h2 className="text-lg font-semibold">Confirmá tu turno</h2>

          <dl className="rounded-xl border bg-white p-5 text-sm">
            <Fila termino="Servicio" valor={service.name} />
            <Fila termino="Profesional" valor={professional.name} />
            <Fila
              termino="Cuándo"
              valor={new Intl.DateTimeFormat("es-AR", {
                timeZone: tenant.timezone,
                weekday: "long",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }).format(new Date(slot.startsAt))}
            />
            <Fila termino="Duración" valor={`${service.durationMinutes} min`} />
            <Fila termino="Total" valor={money.format(service.price)} />
            {senia > 0 && (
              <Fila
                termino="A pagar ahora"
                valor={`${money.format(senia)} (seña ${service.depositPercent}%)`}
                destacado
              />
            )}
          </dl>

          <form onSubmit={confirmar} className="space-y-4">
            <Campo
              label="Nombre y apellido"
              value={nombre}
              onChange={setNombre}
              required
              autoComplete="name"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                autoComplete="email"
              />
              <Campo
                label="Teléfono / WhatsApp"
                type="tel"
                value={telefono}
                onChange={setTelefono}
                autoComplete="tel"
                hint="Con código de país, ej. +54 9 11…"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Comentario <span className="text-slate-400">(opcional)</span>
              </label>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={3}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>

            <p className="text-xs text-slate-500">
              Podés cancelar o reprogramar hasta {tenant.cancellationHours} horas
              antes del turno. Te enviamos el link de gestión junto con la
              confirmación.
            </p>

            <button
              type="submit"
              disabled={!puedeConfirmar || enviando}
              className="w-full rounded-lg bg-brand px-4 py-3 font-medium text-brand-fg transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              {enviando
                ? "Reservando…"
                : senia > 0
                  ? `Reservar y pagar ${money.format(senia)}`
                  : "Confirmar turno"}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

// --- Piezas internas ---------------------------------------------------------

function Stepper({
  paso,
  onVolver,
}: {
  paso: number;
  onVolver: (n: number) => void;
}) {
  return (
    <ol className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
      {PASOS.map((p, i) => {
        const activo = p.n === paso;
        const hecho = p.n < paso;
        return (
          <li key={p.n} className="flex items-center gap-2">
            <button
              onClick={() => onVolver(p.n)}
              disabled={!hecho}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 transition ${
                activo
                  ? "bg-brand font-medium text-brand-fg"
                  : hecho
                    ? "text-brand hover:underline"
                    : "text-slate-400"
              }`}
            >
              <span className="text-xs">{p.n}</span>
              {p.titulo}
            </button>
            {i < PASOS.length - 1 && (
              <span className="text-slate-300">›</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Fila({
  termino,
  valor,
  destacado,
}: {
  termino: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 border-b py-2 last:border-0">
      <dt className="text-slate-500">{termino}</dt>
      <dd className={`text-right ${destacado ? "font-semibold text-brand" : ""}`}>
        {valor}
      </dd>
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  type = "text",
  required,
  autoComplete,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">
        {label}
        {required && <span className="text-brand"> *</span>}
      </label>
      <input
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand"
      />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
