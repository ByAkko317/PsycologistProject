"use client";

// Marcado de asistencia (paso 11). El tenant sale de la sesión en el servidor:
// mandarlo desde el cliente permitiría que alguien apunte a otro negocio.

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BookingStatus } from "@/lib/types";

const OPCIONES = [
  { value: "completed", label: "Asistió" },
  { value: "no_show", label: "Ausente" },
  { value: "confirmed", label: "Reabrir" },
] as const;

type Valor = (typeof OPCIONES)[number]["value"];

export function AttendanceControls({
  bookingId,
  status,
}: {
  bookingId: string;
  status: BookingStatus;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = useState<Valor | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (status === "cancelled") {
    return <span className="text-xs text-fg-subtle">Turno cancelado</span>;
  }

  async function marcar(nuevo: Valor) {
    setGuardando(nuevo);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nuevo }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo actualizar");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setGuardando(null);
    }
  }

  // "Reabrir" solo tiene sentido si el turno ya fue marcado.
  const visibles = OPCIONES.filter(
    (o) => o.value !== "confirmed" || status === "completed" || status === "no_show"
  );

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        {visibles.map((o) => {
          const activo = status === o.value;
          return (
            <button
              key={o.value}
              onClick={() => marcar(o.value)}
              disabled={guardando !== null || activo}
              aria-pressed={activo}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:cursor-default ${
                activo
                  ? "border-brand bg-brand text-brand-fg"
                  : "border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg disabled:opacity-50"
              }`}
            >
              {guardando === o.value ? "…" : o.label}
            </button>
          );
        })}
      </div>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
