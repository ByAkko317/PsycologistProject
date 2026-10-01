"use server";

// Server actions del panel. Se usan directo desde <form action={...}>, asi que
// la edicion funciona incluso sin JavaScript en el cliente.

import { revalidatePath } from "next/cache";
import { requireActionSession } from "@/lib/auth/guards";
import { db } from "@/lib/services/db";
import { requireTenant } from "@/lib/tenant";
import type { WeeklyHours } from "@/lib/types";

/** Resultado que leen los formularios de servicios para avisar qué pasó. */
export type ResultadoServicio =
  | { ok: true; mensaje: string }
  | { ok: false; error: string };

export async function guardarServicio(
  formData: FormData
): Promise<ResultadoServicio> {
  // Una server action es un endpoint POST publico: sin esto, cualquiera que
  // conozca su id puede cambiar precios sin pasar por el panel.
  requireActionSession(["owner"]);
  const tenant = await requireTenant();

  const id = String(formData.get("id") ?? "") || undefined;
  const name = String(formData.get("name") ?? "").trim();
  const durationMinutes = Number(formData.get("durationMinutes") ?? 30);
  const price = Number(formData.get("price") ?? 0);

  // El input del navegador ya lo pide, pero la action se puede llamar sin
  // pasar por el formulario.
  if (!name) return { ok: false, error: "El servicio necesita un nombre." };
  if (!Number.isFinite(durationMinutes) || durationMinutes < 5) {
    return { ok: false, error: "La duración mínima es de 5 minutos." };
  }
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, error: "El precio no puede ser negativo." };
  }

  const professionalIds = formData
    .getAll("professionalIds")
    .map(String)
    .filter(Boolean);

  await db.saveService(tenant.id, {
    id,
    name,
    description: String(formData.get("description") ?? "").trim(),
    durationMinutes: Math.round(durationMinutes),
    price,
    depositPercent: Math.max(
      0,
      Math.min(100, Number(formData.get("depositPercent") ?? 0))
    ),
    active: formData.get("active") === "on",
    professionalIds,
  });

  revalidatePath("/admin/servicios");
  revalidatePath("/book");
  return { ok: true, mensaje: id ? "Cambios guardados." : "Servicio creado." };
}

/**
 * Quita un servicio del panel.
 *
 * Sin turnos se borra de verdad. Con turnos se archiva: los turnos guardan el
 * id del servicio, y borrarlo dejaria el historial, la agenda y los cobros
 * mostrando un servicio que no existe. Archivado desaparece igual del panel y
 * del portal, que es lo que se pide al borrar.
 */
export async function eliminarServicio(id: string): Promise<ResultadoServicio> {
  requireActionSession(["owner"]);
  const tenant = await requireTenant();

  const servicio = await db.getService(tenant.id, id);
  if (!servicio) return { ok: false, error: "Ese servicio ya no existe." };

  const turnos = (await db.listBookings(tenant.id)).filter(
    (b) => b.serviceId === id
  ).length;

  if (turnos === 0) {
    await db.deleteService(tenant.id, id);
  } else {
    // Se manda el servicio completo: saveService escribe todos los campos, y
    // con un objeto parcial borraria la descripcion y los profesionales.
    await db.saveService(tenant.id, {
      ...servicio,
      active: false,
      archived: true,
    });
  }

  revalidatePath("/admin/servicios");
  revalidatePath("/book");
  return {
    ok: true,
    mensaje:
      turnos === 0
        ? `"${servicio.name}" se eliminó.`
        : `"${servicio.name}" se archivó: tiene ${turnos} turno${turnos === 1 ? "" : "s"} en el historial.`,
  };
}

/** Devuelve un archivado al panel. Vuelve oculto: publicarlo es otra decisión. */
export async function restaurarServicio(
  id: string
): Promise<ResultadoServicio> {
  requireActionSession(["owner"]);
  const tenant = await requireTenant();

  const servicio = await db.getService(tenant.id, id);
  if (!servicio) return { ok: false, error: "Ese servicio ya no existe." };

  await db.saveService(tenant.id, {
    ...servicio,
    active: false,
    archived: false,
  });

  revalidatePath("/admin/servicios");
  return {
    ok: true,
    mensaje: `"${servicio.name}" volvió al panel, oculto en el portal hasta que lo actives.`,
  };
}

export async function guardarMarca(formData: FormData) {
  requireActionSession(["owner"]);
  const tenant = await requireTenant();

  const businessHours: WeeklyHours = {};
  for (let dia = 0; dia <= 6; dia++) {
    const rangos = String(formData.get(`hours_${dia}`) ?? "").trim();
    if (!rangos) continue;

    // Formato aceptado: "09:00-13:00, 14:00-19:00"
    const parsed = rangos
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => {
        const [start, end] = r.split("-").map((t) => t.trim());
        return { start, end };
      })
      .filter(
        (r) =>
          /^\d{2}:\d{2}$/.test(r.start ?? "") && /^\d{2}:\d{2}$/.test(r.end ?? "")
      );

    if (parsed.length > 0) businessHours[dia] = parsed;
  }

  await db.updateTenant(tenant.id, {
    name: String(formData.get("name") ?? tenant.name).trim(),
    brandColor: String(formData.get("brandColor") ?? tenant.brandColor).trim(),
    logoUrl: String(formData.get("logoUrl") ?? "").trim(),
    contactEmail: String(formData.get("contactEmail") ?? "").trim(),
    contactPhone: String(formData.get("contactPhone") ?? "").trim(),
    cancellationHours: Math.max(
      0,
      Number(formData.get("cancellationHours") ?? 24)
    ),
    slotIntervalMinutes: Math.max(
      5,
      Number(formData.get("slotIntervalMinutes") ?? 30)
    ),
    timezone: String(formData.get("timezone") ?? tenant.timezone).trim(),
    businessHours,
  });

  revalidatePath("/admin/marca");
  revalidatePath("/book");
  revalidatePath("/admin");
}
