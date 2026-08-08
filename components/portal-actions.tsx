"use client";

// Autogestion del cliente (paso 10): cancelar o reprogramar dentro de la
// politica del negocio. Toda la validacion real corre en el servidor; aca solo
// se cuida la experiencia.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AvailabilitySlot } from "@/lib/types";

interface Props {
  token: string;
  tenantSlug: string;
  serviceId: string;
  professionalId: string;
  cancellationHours: number;
  dateOptions: { key: string; label: string }[];
  /** False si ya paso el limite: se muestra el motivo en vez de los botones. */
  puedeGestionar: boolean;
}

type Modo = "menu" | "cancelar" | "reprogramar";

export function PortalActions({
  token,
  tenantSlug,
  serviceId,
  professionalId,
  cancellationHours,
  dateOptions,
  puedeGestionar,
}: Props) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("menu");
  const [motivo, setMotivo] = useState("");
  const [dateKey, setDateKey] = useState(dateOptions[0]?.key ?? "");
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const cargarSlots = useCallback(
    async (fecha: string) => {
      setCargando(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          tenant: tenantSlug,
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
        setError(e instanceof Error ? e.message : "Error de disponibilidad");
      } finally {
        setCargando(false);
      }
    },
    [professionalId, serviceId, tenantSlug]
  );

  useEffect(() => {
    if (modo === "reprogramar" && dateKey) void cargarSlots(dateKey);
  }, [modo, dateKey, cargarSlots]);

  if (!puedeGestionar) {
    return (
      <div className="rounded-xl border border-dashed bg-white p-5 text-sm text-slate-600">
        Este turno ya no admite cambios online: la política del consultorio
        acepta cancelaciones hasta {cancellationHours} horas antes. Escribinos
        para reprogramarlo.
      </div>
    );
  }

  async function cancelar() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reason: motivo || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cancelar");
      setExito("Tu turno quedó cancelado. Te llega la confirmación por mensaje.");
      setModo("menu");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setEnviando(false);
    }
  }

  async function reprogramar(startsAt: string) {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, startsAt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo reprogramar");
      setExito("Listo, tu turno se movió al nuevo horario.");
      setModo("menu");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4">
      {exito && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {exito}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      {modo === "menu" && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setModo("reprogramar");
              setExito(null);
            }}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg"
          >
            Reprogramar
          </button>
          <button
            onClick={() => {
              setModo("cancelar");
              setExito(null);
            }}
            className="rounded-lg border px-4 py-2 text-sm hover:border-rose-300 hover:text-rose-700"
          >
            Cancelar turno
          </button>
        </div>
      )}

      {modo === "cancelar" && (
        <div className="rounded-xl border bg-white p-5">
          <p className="font-medium">¿Seguro que querés cancelar?</p>
          <p className="mt-1 text-sm text-slate-500">
            El horario vuelve a quedar disponible para otra persona.
          </p>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            placeholder="Motivo (opcional)"
            className="mt-3 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={cancelar}
              disabled={enviando}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {enviando ? "Cancelando…" : "Sí, cancelar"}
            </button>
            <button
              onClick={() => setModo("menu")}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Volver
            </button>
          </div>
        </div>
      )}

      {modo === "reprogramar" && (
        <div className="rounded-xl border bg-white p-5">
          <p className="font-medium">Elegí el nuevo horario</p>
          <p className="mt-1 text-sm text-slate-500">
            Mismo servicio y mismo profesional.
          </p>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
            {dateOptions.map((d) => (
              <button
                key={d.key}
                onClick={() => setDateKey(d.key)}
                className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm transition ${
                  dateKey === d.key
                    ? "border-brand bg-brand text-brand-fg"
                    : "hover:border-brand"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          {cargando ? (
            <p className="text-sm text-slate-500">Buscando horarios…</p>
          ) : slots.filter((s) => s.available).length === 0 ? (
            <p className="text-sm text-slate-500">
              No quedan horarios libres ese día.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {slots
                .filter((s) => s.available)
                .map((s) => (
                  <button
                    key={s.startsAt}
                    disabled={enviando}
                    onClick={() => reprogramar(s.startsAt)}
                    className="rounded-lg border py-2 text-sm transition hover:border-brand hover:text-brand disabled:opacity-40"
                  >
                    {s.label}
                  </button>
                ))}
            </div>
          )}

          <button
            onClick={() => setModo("menu")}
            className="mt-4 text-sm text-slate-500 hover:underline"
          >
            ← Volver
          </button>
        </div>
      )}
    </div>
  );
}
