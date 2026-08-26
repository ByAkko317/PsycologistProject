"use server";

import { revalidatePath } from "next/cache";
import { requireActionSession } from "@/lib/auth/guards";
import { AuthFlowError, createTeamUser } from "@/lib/services/auth";
import { db } from "@/lib/services/db";
import { requireTenant } from "@/lib/tenant";

export interface EquipoState {
  error?: string;
  ok?: string;
}

/** Alta de un usuario del equipo. Solo la administración. */
export async function crearUsuario(
  _prev: EquipoState,
  formData: FormData
): Promise<EquipoState> {
  requireActionSession(["owner"]);

  const role = String(formData.get("role") ?? "employee");
  if (role !== "owner" && role !== "employee") {
    return { error: "Rol inválido" };
  }

  try {
    const usuario = await createTeamUser({
      name: String(formData.get("name") ?? "").trim(),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      role,
      professionalId: String(formData.get("professionalId") ?? "") || undefined,
    });

    revalidatePath("/admin/equipo");
    return { ok: `Usuario creado para ${usuario.email}.` };
  } catch (error) {
    if (error instanceof AuthFlowError) return { error: error.message };
    console.error("[equipo:crear]", error);
    return { error: "No se pudo crear el usuario." };
  }
}

/**
 * Activa o desactiva un usuario.
 *
 * Se desactiva en vez de borrar: los turnos que atendió siguen apuntando a esa
 * ficha, y perder esa referencia arruinaría el historial del paciente.
 */
export async function alternarActivo(formData: FormData) {
  const sesion = requireActionSession(["owner"]);
  const userId = String(formData.get("userId") ?? "");
  const activar = formData.get("activar") === "1";

  // Nadie se desactiva a sí mismo: sería quedarse afuera del panel sin forma
  // de volver a entrar.
  if (userId === sesion.uid) return;

  const tenant = await requireTenant();
  await db.updateUser(tenant.id, userId, { active: activar });
  revalidatePath("/admin/equipo");
}

/** Vincula (o desvincula) un usuario con una ficha de profesional. */
export async function vincularProfesional(formData: FormData) {
  requireActionSession(["owner"]);
  const tenant = await requireTenant();

  await db.updateUser(tenant.id, String(formData.get("userId") ?? ""), {
    professionalId: String(formData.get("professionalId") ?? "") || undefined,
  });
  revalidatePath("/admin/equipo");
}
