"use server";

import { revalidatePath } from "next/cache";
import { requireActionSession } from "@/lib/auth/guards";
import { AuthError } from "@/lib/auth/session";
import { agregarNota } from "@/lib/services/patients";
import { requireTenant } from "@/lib/tenant";

export interface NotaState {
  error?: string;
  ok?: boolean;
}

/**
 * Agrega una nota clinica.
 *
 * El alcance se verifica dentro de agregarNota(): sin eso, alguien podria
 * anotar sobre un paciente que no atiende mandando su id en el formulario.
 */
export async function crearNota(
  _prev: NotaState,
  formData: FormData
): Promise<NotaState> {
  const sesion = requireActionSession(["owner", "employee"]);
  const clientId = String(formData.get("clientId") ?? "");
  const body = String(formData.get("body") ?? "");

  try {
    const tenant = await requireTenant();
    await agregarNota(tenant, sesion, clientId, body);
    revalidatePath(`/pacientes/${clientId}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthError) return { error: error.message };
    if (error instanceof Error) return { error: error.message };
    console.error("[notas:crear]", error);
    return { error: "No se pudo guardar la nota." };
  }
}
