"use client";

// Botones de asistencia de la agenda del empleado (paso 11 del flujo).
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BookingStatus } from "@/lib/types";

const OPCIONES: { value: "completed" | "no_show" | "confirmed"; label: string }[] =
  [
    { value: "completed", label: "Asistió" },
    { value: "no_show", label: "Ausente" },
    { value: "confirmed", label: "Reabrir" },
  ];

export function AttendanceControls({
  bookingId,
  tenantSlug,
  status,
}: {
  bookingId: string;
  tenantSlug: string;
  status: BookingStatus;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (status === "cancelled") {
    return <span className="text-xs text-slate-400">Turno cancelado</span>;
  }

  async function marcar(nuevo: (typeof OPCIONES)[number]["value"]) {
    setGuardando(nuevo);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nuevo, tenant: tenantSlug }),
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

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        {OPCIONES.filter(
          (o) => !(o.value === "confirmed" && status === "confirmed")
        ).map((o) => (
          <button
            key={o.value}
            onClick={() => marcar(o.value)}
            disabled={guardando !== null || status === o.value}
            className={`rounded-lg border px-2.5 py-1 text-xs transition disabled:opacity-40 ${
              status === o.value
                ? "border-brand bg-brand text-brand-fg"
                : "bg-white hover:border-brand"
            }`}
          >
            {guardando === o.value ? "…" : o.label}
          </button>
        ))}
      </div>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}
