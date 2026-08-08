"use server";

// Server actions del panel. Se usan directo desde <form action={...}>, asi que
// la edicion funciona incluso sin JavaScript en el cliente.

import { revalidatePath } from "next/cache";
import { requireActionSession } from "@/lib/auth/guards";
import { db } from "@/lib/services/db";
import { requireTenant } from "@/lib/tenant";
import type { WeeklyHours } from "@/lib/types";

export async function guardarServicio(formData: FormData) {
  // Una server action es un endpoint POST publico: sin esto, cualquiera que
  // conozca su id puede cambiar precios sin pasar por el panel.
  requireActionSession(["owner"]);
  const tenant = await requireTenant();

  const id = String(formData.get("id") ?? "") || undefined;
  const professionalIds = formData
    .getAll("professionalIds")
    .map(String)
    .filter(Boolean);

  await db.saveService(tenant.id, {
    id,
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    durationMinutes: Number(formData.get("durationMinutes") ?? 30),
    price: Number(formData.get("price") ?? 0),
    depositPercent: Math.max(
      0,
      Math.min(100, Number(formData.get("depositPercent") ?? 0))
    ),
    active: formData.get("active") === "on",
    professionalIds,
  });

  revalidatePath("/admin/servicios");
  revalidatePath("/book");
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
